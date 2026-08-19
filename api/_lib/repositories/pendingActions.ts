import { getSupabaseAdmin, getProfileId } from '../supabase.js'

export interface PendingAction {
  id: string
  profile_id: string
  tool_name: string
  tool_input: Record<string, unknown>
  status: 'pending' | 'confirmed' | 'cancelled' | 'expired'
  created_at: string
  resolved_at: string | null
  expires_at: string
}

export async function createPendingAction(toolName: string, toolInput: Record<string, unknown>) {
  const profile_id = await getProfileId()
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('pending_actions')
    .insert({ profile_id, tool_name: toolName, tool_input: toolInput })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as PendingAction
}

export async function getPendingAction(id: string): Promise<PendingAction | null> {
  const profile_id = await getProfileId()
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('pending_actions')
    .select('*')
    .eq('id', id)
    .eq('profile_id', profile_id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as PendingAction | null
}

export async function resolvePendingAction(id: string, status: 'confirmed' | 'cancelled') {
  const profile_id = await getProfileId()
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('pending_actions')
    .update({ status, resolved_at: new Date().toISOString() })
    .eq('id', id)
    .eq('profile_id', profile_id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as PendingAction
}

/** A pending action is only usable if it's still 'pending' and hasn't expired. */
export function isActionable(action: PendingAction | null): action is PendingAction {
  if (!action) return false
  if (action.status !== 'pending') return false
  if (new Date(action.expires_at).getTime() < Date.now()) return false
  return true
}
