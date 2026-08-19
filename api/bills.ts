import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withAuth } from './_lib/handler.js'
import { getProfileId } from './_lib/supabase.js'
import { listActiveBills, createBill, replaceBill, removeBill } from './_lib/repositories/bills.js'

async function handler(req: VercelRequest, res: VercelResponse) {
  const profileId = await getProfileId()

  if (req.method === 'GET') {
    const data = await listActiveBills(profileId)
    res.status(200).json({ data })
    return
  }

  if (req.method === 'POST') {
    const { name, amount_cents, due_day } = (req.body ?? {}) as { name?: string; amount_cents?: number; due_day?: number }
    if (!name || typeof amount_cents !== 'number') return void res.status(400).json({ error: 'name and amount_cents are required' })
    const bill = await createBill(profileId, { name, amountCents: amount_cents, dueDay: due_day })
    res.status(200).json({ data: bill })
    return
  }

  if (req.method === 'PATCH') {
    const id = req.query.id as string | undefined
    const { name, amount_cents, due_day } = (req.body ?? {}) as { name?: string; amount_cents?: number; due_day?: number }
    if (!id || !name || typeof amount_cents !== 'number') return void res.status(400).json({ error: 'id, name and amount_cents are required' })
    const bill = await replaceBill(profileId, id, { name, amountCents: amount_cents, dueDay: due_day })
    res.status(200).json({ data: bill })
    return
  }

  if (req.method === 'DELETE') {
    const id = req.query.id as string | undefined
    if (!id) return void res.status(400).json({ error: 'id is required' })
    await removeBill(profileId, id)
    res.status(200).json({ ok: true })
    return
  }

  res.status(405).json({ error: 'method not allowed' })
}

export default withAuth(handler)
