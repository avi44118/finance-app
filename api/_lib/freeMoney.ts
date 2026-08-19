import { getSupabaseAdmin } from './supabase.js'
import { monthBounds, getTransactionsInRange } from './repositories/transactions.js'

export type AccountView = 'combined' | 'checking' | 'credit'

function accountTypesForView(view: AccountView): Array<'checking' | 'credit' | 'cash'> {
  if (view === 'checking') return ['checking']
  if (view === 'credit') return ['credit']
  return ['checking', 'credit', 'cash']
}

interface RecurringBillRow {
  amount_cents: number
  effective_start: string
  effective_end: string | null
}

function isBillActiveInMonth(bill: RecurringBillRow, monthStart: string, monthEnd: string): boolean {
  if (bill.effective_start >= monthEnd) return false
  if (bill.effective_end && bill.effective_end <= monthStart) return false
  return true
}

async function getFixedBillsTotal(profileId: string, monthStart: string, monthEnd: string): Promise<number> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('recurring_bills')
    .select('amount_cents, effective_start, effective_end')
    .eq('profile_id', profileId)
  if (error) throw new Error(error.message)
  return (data ?? [])
    .filter((b) => isBillActiveInMonth(b as RecurringBillRow, monthStart, monthEnd))
    .reduce((sum, b) => sum + (b as RecurringBillRow).amount_cents, 0)
}

export interface MonthFinancials {
  month: string
  view: AccountView
  income_cents: number
  spending_cents: number
  fixed_bills_cents: number
  free_money_remaining_cents: number
  transaction_count: number
}

/**
 * income = signed-positive transactions in range, minus internal transfers
 * fixed_bills = recurring_bills active this month (cash-only items NOT visible in Chase — see 0001_init.sql)
 * spending = |signed-negative transactions| in range, minus internal transfers
 *   — includes flagged/unusual rows: the flag only excludes them from
 *     average/pattern queries elsewhere, not from this real-money total.
 * free_money_remaining = income - fixed_bills - spending
 */
export async function computeMonthFinancials(profileId: string, month: string, view: AccountView = 'combined'): Promise<MonthFinancials> {
  const { start, end } = monthBounds(month)
  const accountTypes = accountTypesForView(view)
  const [transactions, fixedBillsTotal] = await Promise.all([
    getTransactionsInRange(profileId, start, end, accountTypes),
    getFixedBillsTotal(profileId, start, end),
  ])

  let income = 0
  let spending = 0
  for (const t of transactions) {
    if (t.is_internal_transfer) continue
    if (t.amount_cents > 0) income += t.amount_cents
    else spending += Math.abs(t.amount_cents)
  }

  return {
    month,
    view,
    income_cents: income,
    spending_cents: spending,
    fixed_bills_cents: fixedBillsTotal,
    free_money_remaining_cents: income - fixedBillsTotal - spending,
    transaction_count: transactions.length,
  }
}

export function currentMonthString(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}
