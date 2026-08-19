import type { VercelRequest, VercelResponse } from '@vercel/node'
import { checkPassphrase, issueSessionCookie, clearSessionCookie, requireSession } from './_lib/auth.js'

// Consolidated login/logout/session into one route (dispatched via
// ?action=) to stay under Vercel Hobby's serverless function count limit —
// same convention as the health app's api/auth.ts.
export default function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string | undefined

  if (action === 'login') {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method not allowed' })
      return
    }
    const { passphrase } = (req.body ?? {}) as { passphrase?: string }
    if (!checkPassphrase(passphrase)) {
      res.status(401).json({ error: 'incorrect passphrase' })
      return
    }
    issueSessionCookie(res)
    res.status(200).json({ ok: true })
    return
  }

  if (action === 'logout') {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method not allowed' })
      return
    }
    clearSessionCookie(res)
    res.status(200).json({ ok: true })
    return
  }

  if (action === 'session') {
    if (!requireSession(req, res)) return
    res.status(200).json({ ok: true })
    return
  }

  res.status(400).json({ error: 'unknown action' })
}
