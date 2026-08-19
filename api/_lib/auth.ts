import { createHmac, timingSafeEqual } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const COOKIE_NAME = 'fin_session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 90 // 90 days — this is a private two-person app, one shared login

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not set')
  return secret
}

function sign(value: string): string {
  return createHmac('sha256', getSessionSecret()).update(value).digest('hex')
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/** Issues the signed session cookie after a correct passphrase check. */
export function issueSessionCookie(res: VercelResponse): void {
  const expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000
  const payload = `v1.${expiresAt}`
  const signature = sign(payload)
  const value = `${payload}.${signature}`
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}`,
  )
}

export function clearSessionCookie(res: VercelResponse): void {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`)
}

function isValidSession(cookieValue: string | undefined): boolean {
  if (!cookieValue) return false
  const parts = cookieValue.split('.')
  if (parts.length !== 3) return false
  const [version, expiresAtRaw, signature] = parts
  const payload = `${version}.${expiresAtRaw}`
  const expected = sign(payload)
  if (!safeEqual(signature, expected)) return false
  const expiresAt = Number(expiresAtRaw)
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false
  return true
}

/** Pure check, no response side effect — for routes that accept session auth as one of several valid options. */
export function hasValidSession(req: VercelRequest): boolean {
  return isValidSession(req.cookies?.[COOKIE_NAME])
}

/**
 * Verifies the session cookie on an incoming request. Returns true and lets
 * the caller continue, or writes a 401 and returns false.
 */
export function requireSession(req: VercelRequest, res: VercelResponse): boolean {
  if (hasValidSession(req)) return true
  res.status(401).json({ error: 'unauthorized' })
  return false
}

export function checkPassphrase(candidate: unknown): boolean {
  const expected = process.env.APP_PASSPHRASE
  if (!expected || typeof candidate !== 'string' || candidate.length === 0) return false
  return safeEqual(candidate, expected)
}

/** Cron routes authenticate via a bearer token instead of the session cookie — see CRON_SECRET in .env.example. */
export function requireCronSecret(req: VercelRequest, res: VercelResponse): boolean {
  const expected = process.env.CRON_SECRET
  if (!expected) return true // no secret configured — allow (matches health app's cron behavior)
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined
  if (!token || !safeEqual(token, expected)) {
    res.status(401).json({ error: 'unauthorized' })
    return false
  }
  return true
}
