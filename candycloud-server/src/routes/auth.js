import { Router } from 'express'
import {
  generateSessionId,
  saveSession,
  loadSession,
  deleteSession,
  cookieOptions,
  COOKIE_NAME,
} from '../session.js'
import { exchangeCode, fetchUserinfo } from '../rooiam.js'
import { validateBody, validateEmptyQuery } from '../validation.js'

export const authRouter = Router()

// ── POST /v1/auth/exchange ────────────────────────────────────────────────────
// Frontend calls this after receiving the OIDC callback code.
// Body: { code, redirect_uri, client_id, code_verifier, workspace, workspace_id, app_name, app_id }
//
// 1. Exchange code with Rooiam server-side (no browser CORS)
// 2. Fetch userinfo
// 3. Create candycloud_session in Redis
// 4. Set candycloud_session cookie
//
authRouter.post('/exchange', async (req, res, next) => {
  try {
    validateEmptyQuery(req)
    validateBody(req, {
      required: ['code', 'redirect_uri', 'client_id', 'code_verifier'],
      optional: ['workspace', 'workspace_id', 'app_name', 'app_id'],
    })

    const { code, redirect_uri, client_id, code_verifier, workspace, workspace_id, app_name, app_id } = req.body

    // Exchange code for tokens — server-side, no CORS issue
    const tokens = await exchangeCode({ code, redirectUri: redirect_uri, clientId: client_id, codeVerifier: code_verifier })

    // Fetch userinfo to get identity
    const userinfo = await fetchUserinfo(tokens.access_token)

    // Create session in Redis
    const sessionId = generateSessionId()
    await saveSession(sessionId, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || null,
      idToken: tokens.id_token || null,
      tokenType: tokens.token_type || 'Bearer',
      expiresIn: tokens.expires_in || 0,
      userinfo,
      workspace: workspace || '',
      workspaceId: workspace_id || '',
      appId: app_id || client_id,
      appName: app_name || '',
      createdAt: Date.now(),
    })

    // Set first-party cookie on candycloud-api domain
    res.cookie(COOKIE_NAME, sessionId, cookieOptions())

    res.json({
      ok: true,
      userinfo,
      workspace: workspace || '',
      workspace_id: workspace_id || '',
      token_type: tokens.token_type || 'Bearer',
      expires_in: tokens.expires_in || 0,
      has_refresh_token: Boolean(tokens.refresh_token),
      has_id_token: Boolean(tokens.id_token),
    })
  } catch (err) {
    next(err)
  }
})

// ── GET /v1/auth/session ──────────────────────────────────────────────────────
// Returns current session info. 401 if no valid session.
//
authRouter.get('/session', async (req, res, next) => {
  try {
    validateEmptyQuery(req)
    const sessionId = req.cookies?.[COOKIE_NAME]
    const session = await loadSession(sessionId)
    if (!session) {
      return res.status(401).json({ error: { message: 'No active session' } })
    }
    res.json({
      ok: true,
      userinfo: session.userinfo,
      workspace: session.workspace,
      workspace_id: session.workspaceId,
      app_id: session.appId,
      app_name: session.appName,
      token_type: session.tokenType || 'Bearer',
      expires_in: session.expiresIn || 0,
      has_refresh_token: Boolean(session.refreshToken),
      has_id_token: Boolean(session.idToken),
    })
  } catch (err) {
    next(err)
  }
})

// ── GET /v1/auth/token ───────────────────────────────────────────────────────
// Returns the Rooiam access token for demo purposes.
// This allows the frontend to show the curl example with Bearer already filled.
//
authRouter.get('/token', async (req, res, next) => {
  try {
    validateEmptyQuery(req)
    const sessionId = req.cookies?.[COOKIE_NAME]
    const session = await loadSession(sessionId)
    if (!session) {
      return res.status(401).json({ error: { message: 'Not authenticated' } })
    }
    res.json({
      access_token: session.accessToken,
      token_type: 'Bearer',
    })
  } catch (err) {
    next(err)
  }
})

// ── POST /v1/auth/logout ──────────────────────────────────────────────────────
// Clears the candycloud_session cookie and deletes the session from Redis.
//
authRouter.post('/logout', async (req, res, next) => {
  try {
    validateEmptyQuery(req)
    validateBody(req, { required: [], optional: [] })
    const sessionId = req.cookies?.[COOKIE_NAME]
    await deleteSession(sessionId)

    // Clear the cookie
    const opts = cookieOptions()
    res.cookie(COOKIE_NAME, '', { ...opts, maxAge: 0 })

    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})
