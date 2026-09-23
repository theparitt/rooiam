import crypto from 'node:crypto'
import express from 'express'
import { escapeHtml, parseCookies } from '../shared/example-helpers.mjs'

const TX_COOKIE = 'rooiam_reference_tx'
const SESSION_COOKIE = 'reference_app_session'
const TX_TTL_MS = 10 * 60 * 1000
const SESSION_TTL_MS = 8 * 60 * 60 * 1000

const random = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url')
const sha256 = value => crypto.createHash('sha256').update(value).digest('base64url')
const same = (left, right) => {
  const a = Buffer.from(String(left || ''))
  const b = Buffer.from(String(right || ''))
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function exactBaseUrl(value, name) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error(`${name} must be an HTTP(S) origin without credentials, path, query, or fragment.`)
  }
  return url.origin
}

function cookie(name, value, { secure, maxAge, path = '/' }) {
  return `${name}=${encodeURIComponent(value)}; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`
}

function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>
  <style>body{font:16px/1.55 system-ui,sans-serif;background:#f6f2ff;color:#202033;margin:0}.shell{max-width:720px;margin:48px auto;padding:0 20px}.card{background:#fff;border:1px solid #e7def6;border-radius:20px;padding:28px;box-shadow:0 18px 45px #35206012}h1{margin-top:0}.button,button{display:inline-block;border:0;border-radius:12px;padding:12px 18px;background:#6d3bd1;color:#fff;font:700 15px system-ui;text-decoration:none;cursor:pointer}code{background:#f3effa;padding:2px 6px;border-radius:6px}iframe{width:100%;height:640px;border:0}.muted{color:#68647a}.error{color:#a21b36}</style></head><body><main class="shell"><section class="card">${body}</section></main></body></html>`
}

export function createReferenceApp(rawConfig, hooks = {}) {
  const config = {
    appBaseUrl: exactBaseUrl(rawConfig.appBaseUrl, 'APP_BASE_URL'),
    apiBase: String(rawConfig.apiBase).replace(/\/+$/, ''),
    widgetUrl: String(rawConfig.widgetUrl),
    workspaceId: String(rawConfig.workspaceId || '').trim(),
    clientId: String(rawConfig.clientId || '').trim(),
    clientSecret: String(rawConfig.clientSecret || ''),
    secureCookie: Boolean(rawConfig.secureCookie),
  }
  if (!config.workspaceId || !config.clientId || !config.clientSecret) throw new Error('Workspace ID, web client ID, and client secret are required.')
  if (config.secureCookie && !config.appBaseUrl.startsWith('https://')) throw new Error('Secure cookies require an HTTPS APP_BASE_URL.')
  const widget = new URL(config.widgetUrl)
  if (!['http:', 'https:'].includes(widget.protocol) || widget.username || widget.password) throw new Error('ROOIAM_WIDGET_URL must be HTTP(S) without credentials.')
  widget.searchParams.set('workspace_id', config.workspaceId)
  widget.searchParams.set('client_id', config.clientId)
  const callbackUri = `${config.appBaseUrl}/callback`
  const app = express()
  const pending = hooks.pending || new Map()
  const sessions = hooks.sessions || new Map()
  const users = hooks.users || new Map()
  const now = hooks.now || Date.now
  const fetchImpl = hooks.fetch || globalThis.fetch.bind(globalThis)

  app.disable('x-powered-by')
  app.use(express.urlencoded({ extended: false, limit: '16kb' }))
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store')
    res.set('Referrer-Policy', 'no-referrer')
    res.set('X-Content-Type-Options', 'nosniff')
    res.locals.scriptNonce = random(18)
    res.set('Content-Security-Policy', `default-src 'self'; frame-src ${widget.origin}; script-src 'nonce-${res.locals.scriptNonce}'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`)
    next()
  })

  function purge() {
    const timestamp = now()
    for (const [id, value] of pending) if (value.expiresAt <= timestamp) pending.delete(id)
    for (const [id, value] of sessions) if (value.expiresAt <= timestamp) sessions.delete(id)
  }
  function currentSession(req) {
    purge()
    const id = parseCookies(req.headers.cookie)[SESSION_COOKIE]
    const value = id ? sessions.get(id) : null
    return value ? { id, ...value } : null
  }
  function fail(res, status, message) {
    return res.status(status).type('html').send(page('Sign-in failed', `<h1>Sign-in failed</h1><p class="error">${escapeHtml(message)}</p><p><a href="/">Return home</a></p>`))
  }

  app.get('/', (req, res) => {
    const session = currentSession(req)
    if (!session) return res.type('html').send(page('Reference app', '<h1>Reference relying-party app</h1><p>This app creates its own session after a server-side OIDC code exchange.</p><a class="button" href="/login">Sign in with Rooiam</a>'))
    const user = users.get(session.userId)
    return res.type('html').send(page('Reference dashboard', `<h1>Application session</h1><p>Signed in as <strong>${escapeHtml(user.email || user.subject)}</strong>.</p><p class="muted">Local user: <code>${escapeHtml(user.id)}</code><br>Rooiam subject: <code>${escapeHtml(user.subject)}</code></p><form method="post" action="/logout"><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}"><button>Sign out</button></form>`))
  })

  app.get('/login', (_req, res) => {
    purge()
    const transactionId = random()
    const verifier = random(48)
    pending.set(transactionId, { state: random(), verifier, challenge: sha256(verifier), authorizationStarted: false, expiresAt: now() + TX_TTL_MS })
    res.setHeader('Set-Cookie', cookie(TX_COOKIE, transactionId, { secure: config.secureCookie, maxAge: TX_TTL_MS / 1000, path: '/callback' }))
    const body = `<h1>Sign in</h1><p class="muted">Rooiam owns authentication. This example backend owns OAuth state, PKCE, callback exchange, and the resulting app session.</p><iframe id="rooiam-widget" title="Rooiam sign in" src="${escapeHtml(widget.toString())}"></iframe><script nonce="${res.locals.scriptNonce}">const frame=document.getElementById('rooiam-widget');window.addEventListener('message',event=>{if(event.source!==frame.contentWindow||event.origin!==${JSON.stringify(widget.origin)})return;if(event.data?.type==='rooiam-login-widget:navigate'){const target=new URL(event.data.url,event.origin);if(target.origin===event.origin&&/^https?:$/.test(target.protocol))window.location.assign(target.toString())}if(event.data?.type==='rooiam-login-widget:size'&&Number.isFinite(event.data.height))frame.style.height=Math.min(900,Math.max(320,event.data.height))+'px'})</script>`
    res.type('html').send(page('Sign in', body))
  })

  app.get('/callback', async (req, res) => {
    purge()
    const transactionId = parseCookies(req.headers.cookie)[TX_COOKIE]
    const transaction = transactionId ? pending.get(transactionId) : null
    if (!transaction) return fail(res, 400, 'The login transaction is missing, expired, or already used. Start again.')
    const suppliedState = typeof req.query.state === 'string' ? req.query.state : ''
    const error = typeof req.query.error === 'string' ? req.query.error : ''
    const code = typeof req.query.code === 'string' ? req.query.code : ''
    if (error) {
      pending.delete(transactionId)
      res.setHeader('Set-Cookie', cookie(TX_COOKIE, '', { secure: config.secureCookie, maxAge: 0, path: '/callback' }))
      if (!same(suppliedState, transaction.state)) return fail(res, 400, 'OAuth state validation failed.')
      return fail(res, 400, `Rooiam rejected authorization: ${error}`)
    }
    if (!code) {
      if (transaction.authorizationStarted) return fail(res, 400, 'Authorization was already started for this login transaction.')
      transaction.authorizationStarted = true
      const authorize = new URL(`${config.apiBase}/oidc/authorize`)
      for (const [key, value] of Object.entries({ response_type: 'code', client_id: config.clientId, redirect_uri: callbackUri, scope: 'openid profile email', state: transaction.state, code_challenge: transaction.challenge, code_challenge_method: 'S256' })) authorize.searchParams.set(key, value)
      return res.redirect(302, authorize.toString())
    }
    if (!transaction.authorizationStarted || !same(suppliedState, transaction.state)) {
      pending.delete(transactionId)
      res.setHeader('Set-Cookie', cookie(TX_COOKIE, '', { secure: config.secureCookie, maxAge: 0, path: '/callback' }))
      return fail(res, 400, 'OAuth state validation failed.')
    }
    // Consume before exchange so concurrent/replayed callbacks cannot mint two app sessions.
    pending.delete(transactionId)
    res.setHeader('Set-Cookie', cookie(TX_COOKIE, '', { secure: config.secureCookie, maxAge: 0, path: '/callback' }))
    const form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: callbackUri, client_id: config.clientId, client_secret: config.clientSecret, code_verifier: transaction.verifier })
    let tokens
    try {
      const response = await fetchImpl(`${config.apiBase}/oidc/token`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form })
      tokens = await response.json()
      if (!response.ok || !tokens.access_token) return fail(res, 502, 'The authorization code exchange failed. Start a new login.')
      const infoResponse = await fetchImpl(`${config.apiBase}/oidc/userinfo`, { redirect: 'error', signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${tokens.access_token}` } })
      const identity = await infoResponse.json()
      if (!infoResponse.ok || !identity.sub) return fail(res, 502, 'Rooiam user information could not be verified.')
      let user = [...users.values()].find(value => value.subject === identity.sub)
      if (!user) {
        user = { id: crypto.randomUUID(), subject: identity.sub, email: identity.email || '', createdAt: now() }
        users.set(user.id, user)
      } else if (identity.email) user.email = identity.email
      const sessionId = random()
      sessions.set(sessionId, { userId: user.id, csrf: random(), createdAt: now(), expiresAt: now() + SESSION_TTL_MS })
      res.append('Set-Cookie', cookie(SESSION_COOKIE, sessionId, { secure: config.secureCookie, maxAge: SESSION_TTL_MS / 1000 }))
      return res.redirect(303, '/')
    } catch {
      return fail(res, 502, 'Rooiam could not be reached. Start a new login; do not replay this callback.')
    }
  })

  app.get('/api/session', (req, res) => {
    const session = currentSession(req)
    if (!session) return res.status(401).json({ error: { message: 'Application session required.' } })
    const user = users.get(session.userId)
    return res.json({ user: { id: user.id, subject: user.subject, email: user.email }, csrf: session.csrf, expires_at: new Date(session.expiresAt).toISOString() })
  })

  app.post('/logout', (req, res) => {
    const session = currentSession(req)
    if (!session || !same(req.body.csrf, session.csrf)) return res.status(403).json({ error: { message: 'Invalid logout request.' } })
    sessions.delete(session.id)
    res.setHeader('Set-Cookie', cookie(SESSION_COOKIE, '', { secure: config.secureCookie, maxAge: 0 }))
    const end = new URL(`${config.apiBase}/oidc/end-session`)
    end.searchParams.set('client_id', config.clientId)
    end.searchParams.set('post_logout_redirect_uri', `${config.appBaseUrl}/`)
    return res.redirect(303, end.toString())
  })

  return { app, stores: { pending, sessions, users }, config: { ...config, callbackUri } }
}
