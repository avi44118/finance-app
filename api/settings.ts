import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withAuth } from './_lib/handler.js'
import { getSupabaseAdmin, getProfileId } from './_lib/supabase.js'

async function handler(req: VercelRequest, res: VercelResponse) {
  const supabase = getSupabaseAdmin()
  const profileId = await getProfileId()

  if (req.method === 'GET') {
    const { data, error } = await supabase.from('settings').select('*').eq('profile_id', profileId).single()
    if (error) throw new Error(error.message)
    res.status(200).json({ data })
    return
  }

  if (req.method === 'PATCH') {
    const { rough_monthly_income_cents } = (req.body ?? {}) as { rough_monthly_income_cents?: number | null }
    const { data, error } = await supabase
      .from('settings')
      .update({ rough_monthly_income_cents, updated_at: new Date().toISOString() })
      .eq('profile_id', profileId)
      .select()
      .single()
    if (error) throw new Error(error.message)
    res.status(200).json({ data })
    return
  }

  res.status(405).json({ error: 'method not allowed' })
}

export default withAuth(handler)
