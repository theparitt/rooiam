import Redis from 'ioredis'
import { randomBytes } from 'crypto'

export const redis = new Redis(process.env.CANDYCLOUD_REDIS_URL || 'redis://localhost:6379', {
  keyPrefix: 'candycloud:session:',
  lazyConnect: true,
})

redis.on('error', err => console.error('[redis]', err.message))

// Session TTL: 24 hours
const SESSION_TTL = 60 * 60 * 24

export const COOKIE_NAME = 'candycloud_session'

export function generateSessionId() {
  return randomBytes(32).toString('hex')
}

/**
 * Save a session.
 * @param {string} sessionId
 * @param {object} data  — { accessToken, refreshToken, idToken, userinfo, workspace, workspaceId, appId, appName }
 */
export async function saveSession(sessionId, data) {
  await redis.set(sessionId, JSON.stringify(data), 'EX', SESSION_TTL)
}

/**
 * Load a session. Returns null if missing or expired.
 * @param {string} sessionId
 */
export async function loadSession(sessionId) {
  if (!sessionId) return null
  const raw = await redis.get(sessionId)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * Delete a session.
 */
export async function deleteSession(sessionId) {
  if (!sessionId) return
  await redis.del(sessionId)
}

/**
 * Build the Set-Cookie options.
 * Secure + SameSite=None in production so it works cross-subdomain.
 * SameSite=Lax in dev (http).
 */
export function cookieOptions() {
  const secure = process.env.CANDYCLOUD_COOKIE_SECURE === 'true'
  const domain = process.env.CANDYCLOUD_COOKIE_DOMAIN || undefined
  return {
    httpOnly: true,
    secure,
    // Production (HTTPS): SameSite=none so the cookie works cross-subdomain.
    // Local dev (HTTP):   Omit SameSite entirely — browsers treat no-SameSite
    //                     as the legacy default, which allows cross-port fetches
    //                     on localhost. SameSite=lax blocks fetch() from :5184→:5185.
    ...(secure ? { sameSite: 'none' } : {}),
    maxAge: SESSION_TTL * 1000,
    path: '/',
    ...(domain ? { domain } : {}),
  }
}
