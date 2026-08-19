import { getSupabaseAdmin } from '../supabase.js'

export interface FlaggedTransactionSnapshot {
  date: string
  description: string
  amount_cents: number
  category_id: string | null
  note: string | null
}

export interface MonthlySummaryInput {
  profileId: string
  month: string // first-of-month, YYYY-MM-01
  totalIncomeCents: number
  totalSpendingCents: number
  categoryBreakdown: Record<string, { total_cents: number; count: number }>
  fixedBillsTotalCents: number
  freeMoneyRemainingCents: number
  flaggedTransactions: FlaggedTransactionSnapshot[]
  aiNotes: string
  transactionCount: number
}

export async function upsertMonthlySummary(input: MonthlySummaryInput): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.from('monthly_summaries').upsert(
    {
      profile_id: input.profileId,
      month: input.month,
      total_income_cents: input.totalIncomeCents,
      total_spending_cents: input.totalSpendingCents,
      category_breakdown: input.categoryBreakdown,
      fixed_bills_total_cents: input.fixedBillsTotalCents,
      free_money_remaining_cents: input.freeMoneyRemainingCents,
      flagged_transactions: input.flaggedTransactions,
      ai_notes: input.aiNotes,
      transaction_count: input.transactionCount,
      compacted_at: new Date().toISOString(),
    },
    { onConflict: 'profile_id,month' },
  )
  if (error) throw new Error(error.message)
}

export async function hasSummaryForMonth(profileId: string, month: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('monthly_summaries')
    .select('id')
    .eq('profile_id', profileId)
    .eq('month', `${month}-01`)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return !!data
}
