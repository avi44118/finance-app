import { getSupabaseAdmin } from '../supabase.js'

export interface RecurringBill {
  id: string
  profile_id: string
  name: string
  amount_cents: number
  due_day: number | null
  effective_start: string
  effective_end: string | null
  created_at: string
}

export async function listActiveBills(profileId: string): Promise<RecurringBill[]> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('recurring_bills')
    .select('*')
    .eq('profile_id', profileId)
    .is('effective_end', null)
    .order('name')
  if (error) throw new Error(error.message)
  return (data ?? []) as RecurringBill[]
}

export async function createBill(profileId: string, input: { name: string; amountCents: number; dueDay?: number }): Promise<RecurringBill> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('recurring_bills')
    .insert({ profile_id: profileId, name: input.name, amount_cents: input.amountCents, due_day: input.dueDay ?? null })
    .select()
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Could not create bill')
  return data as RecurringBill
}

/** Append-only, same pattern as the health app's goals_history: close the current row out, insert a fresh one — never mutate a bill's own historical amount in place. */
export async function replaceBill(profileId: string, id: string, input: { name: string; amountCents: number; dueDay?: number }): Promise<RecurringBill> {
  const supabase = getSupabaseAdmin()
  const today = new Date().toISOString().slice(0, 10)
  const { error: closeErr } = await supabase
    .from('recurring_bills')
    .update({ effective_end: today })
    .eq('profile_id', profileId)
    .eq('id', id)
    .is('effective_end', null)
  if (closeErr) throw new Error(closeErr.message)
  return createBill(profileId, input)
}

export async function removeBill(profileId: string, id: string): Promise<void> {
  const supabase = getSupabaseAdmin()
  const today = new Date().toISOString().slice(0, 10)
  const { error } = await supabase
    .from('recurring_bills')
    .update({ effective_end: today })
    .eq('profile_id', profileId)
    .eq('id', id)
    .is('effective_end', null)
  if (error) throw new Error(error.message)
}
