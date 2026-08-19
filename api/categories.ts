import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withAuth } from './_lib/handler.js'
import { getSupabaseAdmin, getProfileId } from './_lib/supabase.js'

// Read-only over HTTP — categories are seeded by migration and otherwise
// only ever created/edited through the AI (create_category tool) or a
// user-initiated rename, both of which go through api/ai.ts's confirm flow,
// not this endpoint.
async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return void res.status(405).json({ error: 'method not allowed' })
  const supabase = getSupabaseAdmin()
  const profileId = await getProfileId()
  const { data, error } = await supabase.from('categories').select('*').eq('profile_id', profileId).order('sort_order')
  if (error) throw new Error(error.message)
  res.status(200).json({ data })
}

export default withAuth(handler)
