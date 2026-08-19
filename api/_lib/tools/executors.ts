import { getProfileId } from '../supabase.js'
import { createPendingAction } from '../repositories/pendingActions.js'
import { getTransaction, updateTransaction, insertManualTransaction, getTransactionsInRange, monthBounds } from '../repositories/transactions.js'
import { listActiveBills, createBill, replaceBill, removeBill } from '../repositories/bills.js'
import { createCategory, listCategories } from '../repositories/categories.js'
import { matchCategory, recordCorrection } from '../categorize.js'
import { prepareRows, computeDedupeDelta, insertTransactions, summarizeImport, centsToDisplay } from '../ingestion.js'
import type { NormalizedRow } from '../csvParser.js'
import { computeMonthFinancials, currentMonthString } from '../freeMoney.js'
import { getSupabaseAdmin } from '../supabase.js'

// This app has no orb, no proactive suggestion cards, no celebration
// toasts — just the one persistent bar and a confirmation card, so this is
// the only UI event it ever needs to emit.
export type UiEvent = { type: 'show_confirmation_card'; pending_action_id: string; tool_name: string; summary: string }

export interface ToolExecutionResult {
  toolResultContent: unknown
  uiEvents: UiEvent[]
}

/** Shared confirm-before-apply wrapper — see api/_lib/tools/schemas.ts's confirmProp. */
async function proposeOrApply(
  toolName: string,
  input: Record<string, unknown>,
  summary: string,
  apply: () => Promise<unknown>,
): Promise<ToolExecutionResult> {
  if (input.confirm !== true) {
    const pending = await createPendingAction(toolName, input)
    return {
      toolResultContent: { status: 'awaiting_confirmation', pending_action_id: pending.id, summary },
      uiEvents: [{ type: 'show_confirmation_card', pending_action_id: pending.id, tool_name: toolName, summary }],
    }
  }
  const result = await apply()
  return { toolResultContent: { status: 'applied', result }, uiEvents: [] }
}

export async function executeTool(name: string, rawInput: unknown): Promise<ToolExecutionResult> {
  const input = (rawInput ?? {}) as Record<string, unknown>
  const profileId = await getProfileId()

  switch (name) {
    case 'import_transactions_commit': {
      const i = input as unknown as {
        transactions: Array<{ date: string; description: string; amount_cents: number; account_type?: 'checking' | 'credit' | 'cash' }>
      }
      const normalized: NormalizedRow[] = i.transactions.map((t) => ({
        account_type: (t.account_type ?? 'cash') as 'checking' | 'credit' | 'cash',
        posted_date: t.date,
        description: t.description,
        amount_cents: t.amount_cents,
        chase_category: null,
        chase_type: null,
      }))
      const prepared = await prepareRows(profileId, normalized)
      const { toInsert, duplicateCount } = await computeDedupeDelta(profileId, prepared)
      const summary = summarizeImport('the pasted transactions', toInsert, duplicateCount)
      return proposeOrApply(name, input, summary, async () => {
        // Recompute fresh at commit time too, in case anything changed between propose and confirm.
        const freshPrepared = await prepareRows(profileId, normalized)
        const { toInsert: freshToInsert } = await computeDedupeDelta(profileId, freshPrepared)
        const count = await insertTransactions(profileId, freshToInsert, 'paste', null)
        return { inserted_count: count }
      })
    }

    case 'log_cash_transaction': {
      const i = input as unknown as { description: string; amount_cents: number; date?: string; category_id?: string }
      const merchantNormalized = i.description.toUpperCase().trim()
      const categoryId = i.category_id ?? (await matchCategory(profileId, merchantNormalized, null)).category_id
      const txn = await insertManualTransaction({
        profileId,
        description: i.description,
        amountCents: i.amount_cents,
        postedDate: i.date ?? new Date().toISOString().slice(0, 10),
        categoryId,
        source: 'cash',
      })
      return { toolResultContent: { status: 'applied', transaction: txn }, uiEvents: [] }
    }

    case 'correct_transaction_category': {
      const i = input as unknown as { transaction_id: string; category_id: string }
      const txn = await getTransaction(profileId, i.transaction_id)
      if (!txn) return { toolResultContent: { status: 'error', error: 'Transaction not found' }, uiEvents: [] }
      const updated = await updateTransaction(profileId, i.transaction_id, { category_id: i.category_id })
      await recordCorrection(profileId, txn.merchant_normalized, i.category_id)

      // Surface other same-merchant transactions this month still on the old category, for an optional bulk_apply_category follow-up.
      const { start, end } = monthBounds(currentMonthString())
      const monthTxns = await getTransactionsInRange(profileId, start, end)
      const otherMatches = monthTxns.filter(
        (t) => t.id !== txn.id && t.merchant_normalized === txn.merchant_normalized && t.category_id === txn.category_id,
      )
      return {
        toolResultContent: {
          status: 'applied',
          transaction: updated,
          other_matching_transaction_ids: otherMatches.map((t) => t.id),
        },
        uiEvents: [],
      }
    }

    case 'bulk_apply_category': {
      const i = input as unknown as { transaction_ids: string[]; category_id: string }
      const summary = `Apply "${i.category_id}" to ${i.transaction_ids.length} transaction(s)`
      return proposeOrApply(name, input, summary, async () => {
        const results = await Promise.all(i.transaction_ids.map((id) => updateTransaction(profileId, id, { category_id: i.category_id })))
        return { updated_count: results.length }
      })
    }

    case 'create_category': {
      const i = input as unknown as { label: string; reason_summary: string }
      return proposeOrApply(name, input, `Create a new "${i.label}" category — ${i.reason_summary}`, () => createCategory(profileId, i.label))
    }

    case 'flag_transaction_unusual': {
      const i = input as unknown as { transaction_id: string; note?: string }
      const txn = await getTransaction(profileId, i.transaction_id)
      const summary = `Flag "${txn?.description ?? i.transaction_id}" as one-time/unusual${i.note ? ` — ${i.note}` : ''}`
      return proposeOrApply(name, input, summary, () =>
        updateTransaction(profileId, i.transaction_id, { is_flagged_unusual: true, note: i.note }),
      )
    }

    case 'unflag_transaction': {
      const i = input as unknown as { transaction_id: string }
      const txn = await getTransaction(profileId, i.transaction_id)
      const summary = `Remove the one-time flag from "${txn?.description ?? i.transaction_id}"`
      return proposeOrApply(name, input, summary, () => updateTransaction(profileId, i.transaction_id, { is_flagged_unusual: false }))
    }

    case 'set_recurring_bill': {
      const i = input as unknown as { name: string; amount_cents: number; due_day?: number }
      const summary = `${i.name}: ${centsToDisplay(i.amount_cents)}${i.due_day ? ` due day ${i.due_day}` : ''}`
      return proposeOrApply(name, input, summary, async () => {
        const existing = (await listActiveBills(profileId)).find((b) => b.name.toLowerCase() === i.name.toLowerCase())
        return existing
          ? replaceBill(profileId, existing.id, { name: i.name, amountCents: i.amount_cents, dueDay: i.due_day })
          : createBill(profileId, { name: i.name, amountCents: i.amount_cents, dueDay: i.due_day })
      })
    }

    case 'remove_recurring_bill': {
      const i = input as unknown as { name: string }
      return proposeOrApply(name, input, `Remove the "${i.name}" bill`, async () => {
        const existing = (await listActiveBills(profileId)).find((b) => b.name.toLowerCase() === i.name.toLowerCase())
        if (!existing) return { status: 'not_found' }
        await removeBill(profileId, existing.id)
        return { status: 'removed' }
      })
    }

    case 'set_rough_monthly_income': {
      const i = input as unknown as { amount_cents: number }
      return proposeOrApply(name, input, `Set rough monthly income to ${centsToDisplay(i.amount_cents)}`, async () => {
        const supabase = getSupabaseAdmin()
        const { error } = await supabase
          .from('settings')
          .update({ rough_monthly_income_cents: i.amount_cents, updated_at: new Date().toISOString() })
          .eq('profile_id', profileId)
        if (error) throw new Error(error.message)
        return { rough_monthly_income_cents: i.amount_cents }
      })
    }

    case 'get_financial_context': {
      const i = input as unknown as { scope: string; month?: string; category_id?: string; limit?: number }
      const month = i.month ?? currentMonthString()
      const { start, end } = monthBounds(month)

      if (i.scope === 'recent_transactions') {
        const rows = await getTransactionsInRange(profileId, start, end)
        return { toolResultContent: { data: rows.slice(0, i.limit ?? 20) }, uiEvents: [] }
      }

      if (i.scope === 'month_detail') {
        const financials = await computeMonthFinancials(profileId, month, 'combined')
        return { toolResultContent: { data: financials }, uiEvents: [] }
      }

      if (i.scope === 'category_totals') {
        const rows = await getTransactionsInRange(profileId, start, end)
        const filtered = i.category_id ? rows.filter((r) => r.category_id === i.category_id) : rows
        const totals: Record<string, { total_cents: number; count: number }> = {}
        for (const r of filtered) {
          if (r.is_internal_transfer || r.amount_cents >= 0) continue
          const key = r.category_id ?? 'uncategorized'
          totals[key] ??= { total_cents: 0, count: 0 }
          totals[key].total_cents += Math.abs(r.amount_cents)
          totals[key].count += 1
        }
        return { toolResultContent: { data: totals }, uiEvents: [] }
      }

      if (i.scope === 'monthly_summaries_history') {
        const supabase = getSupabaseAdmin()
        const { data, error } = await supabase
          .from('monthly_summaries')
          .select('*')
          .eq('profile_id', profileId)
          .order('month', { ascending: false })
          .limit(i.limit ?? 6)
        if (error) throw new Error(error.message)
        return { toolResultContent: { data: data ?? [] }, uiEvents: [] }
      }

      return { toolResultContent: { data: null, error: `Unknown scope: ${i.scope}` }, uiEvents: [] }
    }

    default:
      return { toolResultContent: { status: 'error', error: `Unknown tool: ${name}` }, uiEvents: [] }
  }
}

// Re-exported for callers (e.g. api/ai.ts) that need to list current categories alongside tool results — not itself a tool.
export { listCategories }
