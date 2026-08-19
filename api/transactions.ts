import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withAuth } from './_lib/handler.js'
import { getProfileId } from './_lib/supabase.js'
import { getTransactionsInRange, listRecentTransactions, updateTransaction, monthBounds } from './_lib/repositories/transactions.js'
import { computeMonthFinancials, currentMonthString, type AccountView } from './_lib/freeMoney.js'
import { recordCorrection } from './_lib/categorize.js'

function parseView(raw: unknown): AccountView {
  return raw === 'checking' || raw === 'credit' ? raw : 'combined'
}

async function handler(req: VercelRequest, res: VercelResponse) {
  const action = (req.query.action as string | undefined) ?? 'list'
  const profileId = await getProfileId()

  if (req.method === 'GET' && action === 'list') {
    const month = (req.query.month as string | undefined) ?? currentMonthString()
    const view = parseView(req.query.view)
    const { start, end } = monthBounds(month)
    const accountTypes = view === 'checking' ? (['checking'] as const) : view === 'credit' ? (['credit'] as const) : undefined
    const rows = await getTransactionsInRange(profileId, start, end, accountTypes ? [...accountTypes] : undefined)
    res.status(200).json({ data: rows })
    return
  }

  if (req.method === 'GET' && action === 'recent') {
    const limit = Number(req.query.limit ?? 5)
    const rows = await listRecentTransactions(profileId, Number.isFinite(limit) ? limit : 5)
    res.status(200).json({ data: rows })
    return
  }

  if (req.method === 'GET' && action === 'summary') {
    const month = (req.query.month as string | undefined) ?? currentMonthString()
    const view = parseView(req.query.view)
    const summary = await computeMonthFinancials(profileId, month, view)
    res.status(200).json({ data: summary })
    return
  }

  if (req.method === 'PATCH' && action === 'update') {
    const id = req.query.id as string | undefined
    if (!id) return void res.status(400).json({ error: 'id is required' })
    const { category_id, is_flagged_unusual, note } = (req.body ?? {}) as {
      category_id?: string
      is_flagged_unusual?: boolean
      note?: string | null
    }
    const updated = await updateTransaction(profileId, id, { category_id, is_flagged_unusual, note })
    // A manual correction through the UI (not chat) still teaches the merchant-matching rule going forward.
    if (category_id) await recordCorrection(profileId, updated.merchant_normalized, category_id)
    res.status(200).json({ data: updated })
    return
  }

  res.status(400).json({ error: 'unknown action' })
}

export default withAuth(handler)
