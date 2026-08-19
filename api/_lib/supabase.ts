import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

/**
 * Server-only Supabase client using the service-role key. Never import this
 * file from anything that ships to the browser — it bypasses row-level
 * security entirely, which is fine here because every /api route already
 * gates access via requireSession().
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (client) return client

  const url = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set')
  }

  client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return client
}

let cachedProfileId: string | null = null

/** This app has exactly one profile row (shared by both of them on one phone) — fetched once and cached. */
export async function getProfileId(): Promise<string> {
  if (cachedProfileId) return cachedProfileId
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.from('profiles').select('id').limit(1).single()
  if (error || !data) {
    throw new Error(`Could not load profile: ${error?.message ?? 'no profile row found'}`)
  }
  cachedProfileId = data.id as string
  return cachedProfileId
}
