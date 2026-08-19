import { getAnthropicClient, MODEL } from './anthropicClient.js'
import { computeMonthFinancials, currentMonthString } from './freeMoney.js'
import { getTransactionsInRange, monthBounds, archiveTransactions, purgeArchivedBefore, shiftMonth } from './repositories/transactions.js'
import { upsertMonthlySummary, hasSummaryForMonth, type FlaggedTransactionSnapshot } from './repositories/monthlySummaries.js'
import { listCategories } from './repositories/categories.js'
import { centsToDisplay } from './ingestion.js'

const MONTHS_OF_FULL_DETAIL = 4 // current month + 3 prior, per the brief
const PURGE_GRACE_DAYS = 30

/** Months strictly older than the "current + 3 prior" full-detail window, that don't have a summary yet — oldest first, so a long-dormant app catches up in order rather than jumping straight to the most recent eligible month. */
async function findMonthsNeedingCompaction(profileId: string, lookbackMonths = 24): Promise<string[]> {
  const boundaryMonth = shiftMonth(currentMonthString(), -(MONTHS_OF_FULL_DETAIL - 1))
  const candidates: string[] = []
  for (let i = MONTHS_OF_FULL_DETAIL; i < MONTHS_OF_FULL_DETAIL + lookbackMonths; i++) {
    const month = shiftMonth(currentMonthString(), -i)
    if (month >= boundaryMonth) continue
    candidates.push(month)
  }
  const eligible: string[] = []
  for (const month of candidates) {
    const { start, end } = monthBounds(month)
    const rows = await getTransactionsInRange(profileId, start, end)
    if (rows.length === 0) continue // nothing to compact — likely before the household started using the app
    if (await hasSummaryForMonth(profileId, month)) continue
    eligible.push(month)
  }
  return eligible.reverse() // oldest first
}

function categoryBreakdown(rows: Awaited<ReturnType<typeof getTransactionsInRange>>): Record<string, { total_cents: number; count: number }> {
  const totals: Record<string, { total_cents: number; count: number }> = {}
  for (const r of rows) {
    if (r.is_internal_transfer || r.is_flagged_unusual || r.amount_cents >= 0) continue
    const key = r.category_id ?? 'uncategorized'
    totals[key] ??= { total_cents: 0, count: 0 }
    totals[key].total_cents += Math.abs(r.amount_cents)
    totals[key].count += 1
  }
  return totals
}

async function generateAiNotes(month: string, financials: Awaited<ReturnType<typeof computeMonthFinancials>>, breakdown: Record<string, { total_cents: number; count: number }>, categoryLabels: Map<string, string>): Promise<string> {
  const context = [
    `Month: ${month}.`,
    `Income ${centsToDisplay(financials.income_cents)}, spending ${centsToDisplay(financials.spending_cents)}, fixed bills ${centsToDisplay(financials.fixed_bills_cents)}, free money remaining ${centsToDisplay(financials.free_money_remaining_cents)}.`,
    Object.keys(breakdown).length > 0
      ? `By category: ${Object.entries(breakdown)
          .map(([id, t]) => `${categoryLabels.get(id) ?? id} ${centsToDisplay(t.total_cents)}`)
          .join(', ')}.`
      : 'No categorized spending.',
  ].join('\n')

  try {
    const response = await getAnthropicClient().messages.create({
      model: MODEL,
      max_tokens: 200,
      system:
        'Write a 2-3 sentence factual summary of this completed month for a private financial-awareness app — this becomes the permanent historical record once the raw transactions are archived, so ground it in the real numbers given, no generic advice, no lecturing tone. Respond with only the summary text.',
      messages: [{ role: 'user', content: context }],
    })
    const textBlock = response.content.find((b) => b.type === 'text')
    return textBlock && textBlock.type === 'text' ? textBlock.text.trim() : `${month}: income ${centsToDisplay(financials.income_cents)}, spending ${centsToDisplay(financials.spending_cents)}.`
  } catch {
    return `${month}: income ${centsToDisplay(financials.income_cents)}, spending ${centsToDisplay(financials.spending_cents)}.`
  }
}

export interface RollupResult {
  compacted_months: string[]
  purged_transaction_count: number
}

/** The whole monthly rollup: compact any newly-eligible old month into a summary + archive its raw rows, then hard-purge anything archived past its grace period. Safe to re-run — hasSummaryForMonth skips months already compacted, and the unique (profile_id, month) constraint on monthly_summaries backs that up. */
export async function runMonthlyRollup(profileId: string): Promise<RollupResult> {
  const compactedMonths: string[] = []
  const monthsToCompact = await findMonthsNeedingCompaction(profileId)
  const categories = await listCategories(profileId)
  const categoryLabels = new Map(categories.map((c) => [c.id, c.label]))

  for (const month of monthsToCompact) {
    const { start, end } = monthBounds(month)
    const rows = await getTransactionsInRange(profileId, start, end)
    const financials = await computeMonthFinancials(profileId, month, 'combined')
    const breakdown = categoryBreakdown(rows)
    const flagged: FlaggedTransactionSnapshot[] = rows
      .filter((r) => r.is_flagged_unusual)
      .map((r) => ({ date: r.posted_date, description: r.description, amount_cents: r.amount_cents, category_id: r.category_id, note: r.note }))
    const aiNotes = await generateAiNotes(month, financials, breakdown, categoryLabels)

    await upsertMonthlySummary({
      profileId,
      month: `${month}-01`,
      totalIncomeCents: financials.income_cents,
      totalSpendingCents: financials.spending_cents,
      categoryBreakdown: breakdown,
      fixedBillsTotalCents: financials.fixed_bills_cents,
      freeMoneyRemainingCents: financials.free_money_remaining_cents,
      flaggedTransactions: flagged,
      aiNotes,
      transactionCount: rows.length,
    })
    await archiveTransactions(profileId, rows.map((r) => r.id))
    compactedMonths.push(month)
  }

  const purgeCutoff = new Date(Date.now() - PURGE_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const purgedCount = await purgeArchivedBefore(profileId, purgeCutoff)

  return { compacted_months: compactedMonths, purged_transaction_count: purgedCount }
}
