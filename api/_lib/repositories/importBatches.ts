import { getSupabaseAdmin } from '../supabase.js'

export interface ImportBatch {
  id: string
  profile_id: string
  source: 'csv_checking' | 'csv_credit' | 'paste'
  raw_input: string
  parsed_count: number
  total_amount_cents: number
  status: 'pending_confirmation' | 'committed' | 'discarded'
  summary: string | null
  created_at: string
  committed_at: string | null
}

export async function createImportBatch(input: {
  profileId: string
  source: ImportBatch['source']
  rawInput: string
  parsedCount: number
  totalAmountCents: number
  summary: string
}): Promise<ImportBatch> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('import_batches')
    .insert({
      profile_id: input.profileId,
      source: input.source,
      raw_input: input.rawInput,
      parsed_count: input.parsedCount,
      total_amount_cents: input.totalAmountCents,
      summary: input.summary,
    })
    .select()
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Could not create import batch')
  return data as ImportBatch
}

export async function getImportBatch(profileId: string, id: string): Promise<ImportBatch | null> {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('import_batches').select().eq('profile_id', profileId).eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  return data as ImportBatch | null
}

export async function markImportBatch(profileId: string, id: string, status: 'committed' | 'discarded'): Promise<void> {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase
    .from('import_batches')
    .update({ status, committed_at: status === 'committed' ? new Date().toISOString() : null })
    .eq('profile_id', profileId)
    .eq('id', id)
  if (error) throw new Error(error.message)
}
