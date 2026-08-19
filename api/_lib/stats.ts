import { getTransactionsInRange, monthBounds } from './repositories/transactions.js'

export interface PaceResult {
  current_month_spending_cents: number
  average_spending_cents: number | null
  months_counted: number
  day_of_month: number
  days_in_month: number
  verdict: 'on_track' | 'spending_fast' | 'insufficient_history'
}

function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

/** Spend total for one month, excluding internal transfers AND flagged/unusual rows — this is a pattern comparison, exactly what flagging exists to keep clean (unlike free-money-remaining, which deliberately includes flagged rows). */
async function monthSpendingForPattern(profileId: string, month: string): Promise<number | null> {
  const { start, end } = monthBounds(month)
  const rows = await getTransactionsInRange(profileId, start, end, ['checking', 'credit', 'cash'])
  if (rows.length === 0) return null
  let total = 0
  for (const r of rows) {
    if (r.is_internal_transfer || r.is_flagged_unusual || r.amount_cents >= 0) continue
    total += Math.abs(r.amount_cents)
  }
  return total
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const total = y * 12 + (m - 1) + delta
  const newY = Math.floor(total / 12)
  const newM = (total % 12) + 1
  return `${newY}-${String(newM).padStart(2, '0')}`
}

export async function computeSpendingPace(profileId: string, currentMonth: string, monthsBack = 3): Promise<PaceResult> {
  const currentSpending = (await monthSpendingForPattern(profileId, currentMonth)) ?? 0

  const priorTotals: number[] = []
  for (let i = 1; i <= monthsBack; i++) {
    const total = await monthSpendingForPattern(profileId, shiftMonth(currentMonth, -i))
    if (total !== null) priorTotals.push(total)
  }

  const today = new Date()
  const dayOfMonth = today.getDate()
  const totalDays = daysInMonth(currentMonth)

  if (priorTotals.length === 0) {
    return {
      current_month_spending_cents: currentSpending,
      average_spending_cents: null,
      months_counted: 0,
      day_of_month: dayOfMonth,
      days_in_month: totalDays,
      verdict: 'insufficient_history',
    }
  }

  const average = Math.round(priorTotals.reduce((a, b) => a + b, 0) / priorTotals.length)
  const expectedByNow = average * (dayOfMonth / totalDays)
  // 15% margin so ordinary day-to-day noise doesn't flip the verdict on its own.
  const verdict: PaceResult['verdict'] = currentSpending > expectedByNow * 1.15 ? 'spending_fast' : 'on_track'

  return {
    current_month_spending_cents: currentSpending,
    average_spending_cents: average,
    months_counted: priorTotals.length,
    day_of_month: dayOfMonth,
    days_in_month: totalDays,
    verdict,
  }
}
