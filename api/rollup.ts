import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireCronSecret } from './_lib/auth.js'
import { getProfileId } from './_lib/supabase.js'
import { runMonthlyRollup } from './_lib/rollup.js'

// Triggered by vercel.json's cron entry (Vercel sends CRON_SECRET as a
// Bearer token automatically) — compacts any month older than "current + 3
// prior" into a monthly_summaries row and archives its raw transactions,
// then hard-purges anything past its 30-day archive grace period.
async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }
  if (!requireCronSecret(req, res)) return

  const profileId = await getProfileId()
  const result = await runMonthlyRollup(profileId)
  res.status(200).json({ data: result })
}

export default handler
