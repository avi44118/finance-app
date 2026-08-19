import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireSession } from './auth.js'

/** Wraps a route handler with session auth + a catch-all 500 for unexpected errors. */
export function withAuth(fn: (req: VercelRequest, res: VercelResponse) => Promise<void> | void) {
  return async (req: VercelRequest, res: VercelResponse) => {
    if (!requireSession(req, res)) return
    try {
      await fn(req, res)
    } catch (err) {
      console.error(err)
      res.status(500).json({ error: err instanceof Error ? err.message : 'internal error' })
    }
  }
}
