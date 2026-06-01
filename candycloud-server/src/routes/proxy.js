import { Router } from 'express'
import { loadSession, COOKIE_NAME } from '../session.js'
import { proxyToRooiam } from '../rooiam.js'
import { validateBody, validateEmptyBody, validateEmptyQuery, validateQuery } from '../validation.js'

export const proxyRouter = Router()

// ── requireSession middleware ─────────────────────────────────────────────────
// Loads the candycloud_session from Redis and attaches it to req.session.
// Returns 401 if missing or expired.
//
async function requireSession(req, res, next) {
  const sessionId = req.cookies?.[COOKIE_NAME]
  const session = await loadSession(sessionId).catch(() => null)
  if (!session) {
    return res.status(401).json({ error: { message: 'Not authenticated' } })
  }
  req.session = session
  next()
}

// ── Proxy routes ──────────────────────────────────────────────────────────────
// Rooiam has two auth modes for self-service endpoints:
//   - Cookie auth (/identity/me/*): uses opaque rooiam_sid cookie — NOT usable here
//   - Bearer auth (/identity/token/*): uses access_token — what we use
//
// PUBLIC (no session — called before login):
//   GET  /demo/app-catalog                → /demo/app-catalog
//   GET  /demo/app-config                 → /demo/app-config
//   GET  /orgs/public/branding            → /orgs/public/branding
//   GET  /setup/auth-methods              → /setup/auth-methods
//
// PROTECTED — path rewrite required (frontend path → Rooiam bearer path):
//   GET  /identity/me                     → /identity/token
//   GET  /identity/me/linked-accounts     → /identity/token/linked-accounts
//   GET  /identity/me/sessions            → /identity/token/sessions
//   DELETE /identity/me/sessions/:id      → /identity/token/sessions/:id
//   POST /identity/me/sessions/revoke-all → /identity/token/sessions/revoke-all
//   GET  /identity/me/audit-logs          → /identity/token/audit-logs
//   GET  /webauthn/passkeys               → /identity/token/passkeys
//   POST /webauthn/register/start         → /identity/token/passkeys/register/start
//   POST /webauthn/register/finish        → /identity/token/passkeys/register/finish
//   DELETE /webauthn/passkeys/:id         → /identity/token/passkeys/:id
//   GET  /mfa/status                      → /identity/token/mfa
//   POST /mfa/totp/start                  → /identity/token/mfa/totp/start
//   POST /mfa/totp/finish                 → /identity/token/mfa/totp/finish
//   DELETE /mfa/totp                      → /identity/token/mfa/totp
//   POST /mfa/recovery-codes/regenerate   → /identity/token/mfa/recovery-codes/regenerate
//
// PROTECTED — path passthrough (same path in Rooiam):
//   GET  /orgs/current/portal             → /orgs/current/portal

// ── Public endpoints (no session required) ────────────────────────────────────
// These are called before login to populate the login page and widget.
proxyRouter.get('/demo/app-catalog', async (req, res, next) => {
  try {
    validateEmptyQuery(req)
  } catch (err) {
    return next(err)
  }
  await forward(req, res, next, '/demo/app-catalog', null)
})

proxyRouter.get('/demo/app-config', async (req, res, next) => {
  try {
    validateQuery(req, {
      required: ['app_id', 'origin'],
      optional: ['workspace_id', 'workspace'],
      crossValidate: query => {
        const hasWorkspaceId = Object.prototype.hasOwnProperty.call(query, 'workspace_id')
        const hasWorkspace = Object.prototype.hasOwnProperty.call(query, 'workspace')
        if (hasWorkspaceId === hasWorkspace) {
          throw Object.assign(
            new Error("Invalid query: exactly one of 'workspace_id' or 'workspace' is required."),
            { status: 400 }
          )
        }
      },
    })
  } catch (err) {
    return next(err)
  }
  await forward(req, res, next, '/demo/app-config', null)
})

// Workspace branding (logo, color) — needed to style the login page
proxyRouter.get('/orgs/public/branding', async (req, res, next) => {
  try {
    validateQuery(req, { required: ['workspace_id'], optional: [] })
  } catch (err) {
    return next(err)
  }
  await forward(req, res, next, '/orgs/public/branding', null)
})

// Auth methods (magic link, passkey, google, etc.) — needed to show the right panel
proxyRouter.get('/setup/auth-methods', async (req, res, next) => {
  try {
    validateQuery(req, { required: ['workspace_id'], optional: [] })
  } catch (err) {
    return next(err)
  }
  await forward(req, res, next, '/setup/auth-methods', null)
})

// ── Protected routes (rewrites frontend paths → Rooiam bearer paths) ─────────
// /identity/me/* → /identity/token/*
proxyRouter.get('/identity/me', requireSession, async (req, res, next) => {
  try {
    validateEmptyQuery(req)
  } catch (err) {
    return next(err)
  }
  await forward(req, res, next, '/identity/token')
})
proxyRouter.patch('/identity/me/profile', requireSession, async (req, res, next) => {
  try {
    validateEmptyQuery(req)
    validateBody(req, {
      required: ['display_name'],
      optional: [],
      stringFields: { display_name: { allowEmpty: true } },
    })
  } catch (err) {
    return next(err)
  }
  await forward(req, res, next, '/identity/token/profile')
})
proxyRouter.get('/identity/me/linked-accounts', requireSession, async (req, res, next) => {
  try {
    validateEmptyQuery(req)
  } catch (err) {
    return next(err)
  }
  await forward(req, res, next, '/identity/token/linked-accounts')
})
proxyRouter.post('/identity/me/linked-accounts/:provider/start', requireSession, async (req, res, next) => {
  try {
    validateEmptyQuery(req)
    validateEmptyBody(req)
  } catch (err) {
    return next(err)
  }
  await forward(req, res, next, `/identity/token/linked-accounts/${req.params.provider}/start`)
})
proxyRouter.delete('/identity/me/linked-accounts/:provider', requireSession, async (req, res, next) => {
  try {
    validateEmptyQuery(req)
  } catch (err) {
    return next(err)
  }
  await forward(req, res, next, `/identity/token/linked-accounts/${req.params.provider}`)
})
proxyRouter.post('/identity/me/email-change/request', requireSession, async (req, res, next) => {
  try {
    validateEmptyQuery(req)
    validateBody(req, { required: ['new_email'], optional: [] })
  } catch (err) {
    return next(err)
  }
  await forward(req, res, next, '/identity/token/email-change/request')
})
proxyRouter.get('/identity/me/sessions', requireSession, async (req, res, next) => {
  try {
    validateEmptyQuery(req)
  } catch (err) {
    return next(err)
  }
  await forward(req, res, next, '/identity/token/sessions')
})
proxyRouter.post('/identity/me/sessions/revoke-all', requireSession, async (req, res, next) => {
  try {
    validateEmptyQuery(req)
    validateEmptyBody(req)
  } catch (err) {
    return next(err)
  }
  await forward(req, res, next, '/identity/token/sessions/revoke-all')
})
proxyRouter.delete('/identity/me/sessions/:id', requireSession, async (req, res, next) => {
  try {
    validateEmptyQuery(req)
  } catch (err) {
    return next(err)
  }
  await forward(req, res, next, `/identity/token/sessions/${req.params.id}`)
})
proxyRouter.get('/identity/me/audit-logs', requireSession, async (req, res, next) => {
  try {
    validateQuery(req, { required: [], optional: ['page', 'page_size'], positiveIntFields: ['page', 'page_size'] })
  } catch (err) {
    return next(err)
  }
  await forward(req, res, next, '/identity/token/audit-logs')
})

// /webauthn/* → /identity/token/passkeys/*
proxyRouter.get('/webauthn/passkeys', requireSession, async (req, res, next) => {
  try {
    validateEmptyQuery(req)
  } catch (err) {
    return next(err)
  }
  await forward(req, res, next, '/identity/token/passkeys')
})
proxyRouter.post('/webauthn/register/start', requireSession, async (req, res, next) => {
  try {
    validateEmptyQuery(req)
    validateEmptyBody(req)
  } catch (err) {
    return next(err)
  }
  await forward(req, res, next, '/identity/token/passkeys/register/start')
})
proxyRouter.post('/webauthn/register/finish', requireSession, async (req, res, next) => {
  try {
    validateEmptyQuery(req)
    validateBody(req, {
      required: ['challenge_id', 'name', 'credential'],
      optional: [],
      stringFields: { credential: false },
    })
  } catch (err) {
    return next(err)
  }
  await forward(req, res, next, '/identity/token/passkeys/register/finish')
})
proxyRouter.patch('/webauthn/passkeys/:id', requireSession, async (req, res, next) => {
  try {
    validateEmptyQuery(req)
    validateBody(req, { required: ['name'], optional: [] })
  } catch (err) {
    return next(err)
  }
  await forward(req, res, next, `/identity/token/passkeys/${req.params.id}`)
})
proxyRouter.delete('/webauthn/passkeys/:id', requireSession, async (req, res, next) => {
  try {
    validateEmptyQuery(req)
  } catch (err) {
    return next(err)
  }
  await forward(req, res, next, `/identity/token/passkeys/${req.params.id}`)
})

// /mfa/* — demo stubs (no real TOTP stored, avoids locking demo accounts)
// All state is in-memory per-session in Redis (demo_totp_enabled flag).

proxyRouter.get('/mfa/status', requireSession, async (req, res) => {
  try {
    validateEmptyQuery(req)
    const enabled = Boolean(req.session.demo_totp_enabled)
    res.json({
      totp_enabled: enabled,
      backup_codes_remaining: enabled ? 8 : 0,
    })
  } catch (err) {
    res.status(err.status || 500).json({ error: { message: err.message || 'Internal server error' } })
  }
})

proxyRouter.post('/mfa/totp/start', requireSession, async (req, res) => {
  try {
    validateEmptyQuery(req)
    validateEmptyBody(req)
    // Return a fake TOTP URI — any authenticator app can scan it but it won't
    // actually be verified on finish (we accept any 6-digit code).
    const fakeSecret = 'JBSWY3DPEHPK3PXP'
    const label = encodeURIComponent(`Demo:${req.session.userinfo?.email || 'user'}`)
    res.json({
      challenge_id: 'demo-totp-challenge',
      secret: fakeSecret,
      otpauth_uri: `otpauth://totp/${label}?secret=${fakeSecret}&issuer=Demo`,
    })
  } catch (err) {
    res.status(err.status || 500).json({ error: { message: err.message || 'Internal server error' } })
  }
})

proxyRouter.post('/mfa/totp/finish', requireSession, async (req, res) => {
  try {
    validateEmptyQuery(req)
    validateBody(req, { required: ['code'], optional: [] })
    const { code } = req.body
    // Accept any 6-digit numeric code
    if (!code || !/^\d{6}$/.test(String(code))) {
      return res.status(400).json({ error: { message: 'Enter a 6-digit code from your authenticator app.' } })
    }
    // Persist the enabled flag in the session
    req.session.demo_totp_enabled = true
    const { saveSession } = await import('../session.js')
    await saveSession(req.cookies?.candycloud_session, req.session)
    res.json({
      ok: true,
      backup_codes: ['demo-1111', 'demo-2222', 'demo-3333', 'demo-4444', 'demo-5555', 'demo-6666', 'demo-7777', 'demo-8888'],
    })
  } catch (err) {
    res.status(err.status || 500).json({ error: { message: err.message || 'Internal server error' } })
  }
})

proxyRouter.delete('/mfa/totp', requireSession, async (req, res) => {
  try {
    validateEmptyQuery(req)
    req.session.demo_totp_enabled = false
    const { saveSession } = await import('../session.js')
    await saveSession(req.cookies?.candycloud_session, req.session)
    res.json({ ok: true, disabled: true })
  } catch (err) {
    res.status(err.status || 500).json({ error: { message: err.message || 'Internal server error' } })
  }
})

proxyRouter.post('/mfa/recovery-codes/regenerate', requireSession, async (req, res) => {
  try {
    validateEmptyQuery(req)
    validateEmptyBody(req)
    res.json({
      codes: ['demo-aaaa', 'demo-bbbb', 'demo-cccc', 'demo-dddd', 'demo-eeee', 'demo-ffff', 'demo-gggg', 'demo-hhhh'],
      remaining: 8,
    })
  } catch (err) {
    res.status(err.status || 500).json({ error: { message: err.message || 'Internal server error' } })
  }
})

// Path passthrough routes (same path in Rooiam)
proxyRouter.all('/orgs/*', requireSession, async (req, res, next) => {
  try {
    validateEmptyQuery(req)
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
      validateEmptyBody(req)
    }
  } catch (err) {
    return next(err)
  }
  await forward(req, res, next, req.path)
})

async function forward(req, res, next, rooiamPath, accessToken = req.session?.accessToken) {
  try {
    const { method } = req

    // Build query string if present
    const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''
    const fullPath = `${rooiamPath}${qs}`

    // Pass body for mutating methods
    let body
    let contentType
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method) && req.body && Object.keys(req.body).length > 0) {
      body = JSON.stringify(req.body)
      contentType = 'application/json'
    }

    const { status, data } = await proxyToRooiam(fullPath, {
      method,
      body,
      accessToken,
      contentType,
    })

    res.status(status).json(data)
  } catch (err) {
    next(err)
  }
}
