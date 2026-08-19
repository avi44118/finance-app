import { randomUUID } from 'node:crypto'
import { getSupabaseAdmin } from '../supabase.js'

export interface TransactionRow {
  id: string
  profile_id: string
  account_type: 'checking' | 'credit' | 'cash'
  posted_date: string
  description: string
  merchant_normalized: string
  amount_cents: number
  category_id: string | null
  chase_category: string | null
  is_flagged_unusual: boolean
  is_internal_transfer: boolean
  needs_review: boolean
  note: string | null
  source: 'csv' | 'paste' | 'manual' | 'cash'
  import_batch_id: string | null
  fingerprint: string
  occurrence_index: number
  archived_at: string | null
  created_at: string
}

/** Half-open [monthStart, monthEnd) bounds for a 'YYYY-MM' month string. */
export function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number)
  const start = `${month}-01`
  const nextM = m === 12 ? 1 : m + 1
  const nextY = m === 12 ? y + 1 : y
  const end = `${nextY}-${String(nextM).padStart(2, '0')}-01`
  return { start, end }
}

export async function getTransactionsInRange(
  profileId: string,
  startDate: string,
  endDateExclusive: string,
  accountTypes?: Array<'checking' | 'credit' | 'cash'>,
): Promise<TransactionRow[]> {
  const supabase = getSupabaseAdmin()
  let query = supabase
    .from('transactions')
    .select('*')
    .eq('profile_id', profileId)
    .gte('posted_date', startDate)
    .lt('posted_date', endDateExclusive)
    .order('posted_date', { ascending: false })
  if (accountTypes && accountTypes.length > 0) query = query.in('account_type', accountTypes)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as TransactionRow[]
}

export async function listRecentTransactions(profileId: string, limit: number): Promise<TransactionRow[]> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('profile_id', profileId)
    .is('archived_at', null)
    .order('posted_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []) as TransactionRow[]
}

export async function getTransaction(profileId: string, id: string): Promise<TransactionRow | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('transactions').select('*').eq('profile_id', profileId).eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return data as TransactionRow | null
}

export interface TransactionPatch {
  category_id?: string
  is_flagged_unusual?: boolean
  is_internal_transfer?: boolean
  needs_review?: boolean
  note?: string | null
}

export async function updateTransaction(profileId: string, id: string, patch: TransactionPatch): Promise<TransactionRow> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('transactions')
    .update(patch)
    .eq('profile_id', profileId)
    .eq('id', id)
    .select()
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Transaction not found')
  return data as TransactionRow
}

/** A cash/manual entry logged directly through chat — no import batch, no confirm ceremony (per the brief: "AI logs it immediately"). */
export async function insertManualTransaction(input: {
  profileId: string
  description: string
  amountCents: number
  postedDate: string
  categoryId: string
  source: 'manual' | 'cash'
  note?: string
}): Promise<TransactionRow> {
  const supabase = getSupabaseAdmin()
  const merchantNormalized = input.description.toUpperCase().trim()
  // Deliberately unique per call, not content-derived — CSV fingerprinting
  // exists to survive a re-upload of the same file; a cash/manual entry has
  // no such re-submission risk, and two real same-day "coffee $5" entries
  // should both be allowed to land rather than colliding on the dedup index.
  const fingerprint = `${input.source}|${randomUUID()}`
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      profile_id: input.profileId,
      account_type: 'cash',
      posted_date: input.postedDate,
      description: input.description,
      merchant_normalized: merchantNormalized,
      amount_cents: input.amountCents,
      category_id: input.categoryId,
      source: input.source,
      note: input.note ?? null,
      fingerprint,
      occurrence_index: 1,
    })
    .select()
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Could not save entry')
  return data as TransactionRow
}
