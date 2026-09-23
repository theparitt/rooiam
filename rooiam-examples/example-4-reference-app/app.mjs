import crypto from 'node:crypto'
import express from 'express'
import { fileURLToPath } from 'node:url'
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
  <link rel="icon" type="image/svg+xml" href="/assets/logo.svg"><link rel="stylesheet" href="/assets/reference.css"></head><body><div class="shell"><header class="site-header"><a class="brand" href="/" aria-label="Rooiam home"><img src="/assets/logo.svg" alt="Rooiam" width="158" height="44"></a><span class="app-label">Reference app</span></header><main id="main" class="card">${body}</main><footer>Powered by Rooiam <span aria-hidden="true">·</span> Your identity, your workspace.</footer></div></body></html>`
}

export function createReferenceApp(rawConfig, hooks = {}) {
  const config = {
    appBaseUrl: exactBaseUrl(rawConfig.appBaseUrl, 'APP_BASE_URL'),
    apiBase: String(rawConfig.apiBase).replace(/\/+$/, ''),
    widgetUrl: String(rawConfig.widgetUrl),
    hostedLoginOrigin: rawConfig.hostedLoginOrigin ? exactBaseUrl(rawConfig.hostedLoginOrigin, 'ROOIAM_HOSTED_LOGIN_ORIGIN') : null,
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
  const endSessionUrl = new URL(`${config.apiBase}/oidc/end-session`)
  if (!['http:', 'https:'].includes(endSessionUrl.protocol) || endSessionUrl.username || endSessionUrl.password) throw new Error('ROOIAM_API_BASE must use HTTP(S) without credentials.')
  const hostedLogin = config.hostedLoginOrigin ? new URL('/', config.hostedLoginOrigin) : null
  if (hostedLogin) {
    hostedLogin.searchParams.set('workspace_id', config.workspaceId)
    hostedLogin.searchParams.set('client_id', config.clientId)
  }
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
    res.set('Content-Security-Policy', `default-src 'self'; frame-src ${widget.origin}; script-src 'nonce-${res.locals.scriptNonce}'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; form-action 'self' ${endSessionUrl.origin}; base-uri 'none'; frame-ancestors 'none'`)
    next()
  })
  app.use('/assets', express.static(fileURLToPath(new URL('./public/', import.meta.url))))

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
    if (!session) return res.type('html').send(page('Reference app', '<span class="eyebrow">WELCOME TO YOUR APP</span><h1>A little less friction.<br>A secure way in.</h1><p class="intro">Sign in with your Rooiam identity and pick up where you left off.</p><a class="button" href="/login">Sign in with Rooiam</a><div class="hint">Use your phone, a passkey, or a magic link. Your workspace controls the available methods.</div>'))
    const user = users.get(session.userId)
    return res.type('html').send(page('Reference dashboard', `<span class="status-badge"><span aria-hidden="true">✓</span> Signed in</span><h1>Application session</h1><p class="intro">You're in. Welcome back to your app.</p><div class="identity"><span class="avatar" aria-hidden="true">${escapeHtml((user.email || user.subject).slice(0, 1).toUpperCase())}</span><div><span class="field-label">SIGNED IN AS</span><strong>${escapeHtml(user.email || user.subject)}</strong></div></div><details class="session-details"><summary>Session details</summary><dl><div><dt>Local user</dt><dd><code>${escapeHtml(user.id)}</code></dd></div><div><dt>Rooiam subject</dt><dd><code>${escapeHtml(user.subject)}</code></dd></div></dl></details><div class="session-actions"><p class="muted">Your app session is ready.</p><form method="post" action="/logout"><input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}"><button class="secondary">Sign out</button></form></div>`))
  })

  app.get('/login', (_req, res) => {
    purge()
    const transactionId = random()
    const verifier = random(48)
    pending.set(transactionId, { state: random(), verifier, challenge: sha256(verifier), authorizationStarted: false, expiresAt: now() + TX_TTL_MS })
    res.setHeader('Set-Cookie', cookie(TX_COOKIE, transactionId, { secure: config.secureCookie, maxAge: TX_TTL_MS / 1000, path: '/callback' }))
    const phoneLink = hostedLogin ? `<div class="phone-option"><span class="eyebrow">YOUR PHONE, YOUR APPROVAL</span><p>Scan a QR code and approve the sign-in on your enrolled phone.</p><a class="button" href="${escapeHtml(hostedLogin.toString())}">Sign in with your phone</a></div><div class="divider"><span>or choose another method</span></div>` : ''
    const body = `<span class="eyebrow">WELCOME BACK</span><h1>Sign in</h1><p class="intro">Choose how you'd like to continue to your app.</p>${phoneLink}<iframe referrerpolicy="origin" id="rooiam-widget" title="Rooiam sign in" src="${escapeHtml(widget.toString())}"></iframe><p class="existing-session">Already signed in?<br><a href="/callback">Continue with your Rooiam session</a></p><script nonce="${res.locals.scriptNonce}">const frame=document.getElementById('rooiam-widget');window.addEventListener('message',event=>{if(event.source!==frame.contentWindow||event.origin!==${JSON.stringify(widget.origin)})return;if(event.data?.type==='rooiam-login-widget:navigate'){const target=new URL(event.data.url,event.origin);if(target.origin===event.origin&&/^https?:$/.test(target.protocol))window.location.assign(target.toString())}if(event.data?.type==='rooiam-login-widget:size'&&Number.isFinite(event.data.height))frame.style.height=Math.min(900,Math.max(320,event.data.height))+'px'})</script>`
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
    const end = new URL(endSessionUrl)
    end.searchParams.set('client_id', config.clientId)
    end.searchParams.set('post_logout_redirect_uri', `${config.appBaseUrl}/`)
    return res.redirect(303, end.toString())
  })

  return { app, stores: { pending, sessions, users }, config: { ...config, callbackUri } }
}
