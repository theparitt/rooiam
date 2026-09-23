import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { createServer } from 'node:http'
import { once } from 'node:events'
import vm from 'node:vm'
import { createReferenceApp } from './app.mjs'

const challenge = verifier => crypto.createHash('sha256').update(verifier).digest('base64url')
const cookiePair = value => value.split(';', 1)[0]
const setCookies = response => response.headers.getSetCookie?.() || [response.headers.get('set-cookie')].filter(Boolean)

async function fixture() {
  const calls = { token: 0, userinfo: 0, expectedChallenge: '', usedCodes: new Set() }
  const oidc = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json')
    if (req.url === '/v1/oidc/token' && req.method === 'POST') {
      calls.token++
      let body = ''
      for await (const chunk of req) body += chunk
      const form = new URLSearchParams(body)
      const valid = form.get('client_id') === 'reference-web' && form.get('client_secret') === 'server-only-secret' &&
        form.get('redirect_uri') === 'http://reference.test/callback' && challenge(form.get('code_verifier') || '') === calls.expectedChallenge
      const code = form.get('code')
      if (!valid || !code || calls.usedCodes.has(code) || code === 'invalid') {
        res.statusCode = 400
        return res.end(JSON.stringify({ error: 'invalid_grant' }))
      }
      calls.usedCodes.add(code)
      return res.end(JSON.stringify({ access_token: `access-${code}`, token_type: 'Bearer', expires_in: 300 }))
    }
    if (req.url === '/v1/oidc/userinfo' && req.headers.authorization?.startsWith('Bearer access-')) {
      calls.userinfo++
      return res.end(JSON.stringify({ sub: 'rooiam-user-123', email: 'person@example.test', email_verified: true }))
    }
    res.statusCode = 404
    res.end(JSON.stringify({ error: 'not_found' }))
  })
  oidc.listen(0, '127.0.0.1')
  await once(oidc, 'listening')
  const oidcBase = `http://127.0.0.1:${oidc.address().port}`
  const reference = createReferenceApp({
    appBaseUrl: 'http://reference.test', apiBase: `${oidcBase}/v1`, widgetUrl: `${oidcBase}/login-widget`,
    workspaceId: 'workspace-1', clientId: 'reference-web', clientSecret: 'server-only-secret', secureCookie: false,
  })
  const server = reference.app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  return { base, calls, stores: reference.stores, close: async () => { server.close(); oidc.close(); await Promise.all([once(server, 'close'), once(oidc, 'close')]) } }
}

async function begin(base) {
  const login = await fetch(base + '/login', { redirect: 'manual' })
  assert.equal(login.status, 200)
  const html = await login.text()
  assert.ok(html.includes('Rooiam owns authentication'))
  assert.equal(html.includes('server-only-secret'), false)
  const nonce = /<script nonce="([^"]+)">/.exec(html)?.[1]
  assert.ok(nonce)
  assert.ok(login.headers.get('content-security-policy').includes(`script-src 'nonce-${nonce}'`))
  const script = /<script nonce="[^"]+">([\s\S]*?)<\/script>/.exec(html)?.[1]
  assert.ok(script)
  new vm.Script(script)
  const transactionCookie = cookiePair(setCookies(login)[0])
  assert.match(setCookies(login)[0], /HttpOnly; SameSite=Lax/)
  const handoff = await fetch(base + '/callback', { redirect: 'manual', headers: { Cookie: transactionCookie } })
  assert.equal(handoff.status, 302)
  const authorize = new URL(handoff.headers.get('location'))
  assert.equal(authorize.pathname, '/v1/oidc/authorize')
  assert.equal(authorize.searchParams.get('response_type'), 'code')
  assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(authorize.searchParams.get('redirect_uri'), 'http://reference.test/callback')
  return { transactionCookie, state: authorize.searchParams.get('state'), challenge: authorize.searchParams.get('code_challenge') }
}

test('server-owned PKCE callback creates one opaque application session', async t => {
  const f = await fixture(); t.after(f.close)
  const flow = await begin(f.base); f.calls.expectedChallenge = flow.challenge
  const callbacks = await Promise.all([1, 2].map(() => fetch(`${f.base}/callback?code=single-use&state=${encodeURIComponent(flow.state)}`, { redirect: 'manual', headers: { Cookie: flow.transactionCookie } })))
  assert.deepEqual(callbacks.map(value => value.status).sort(), [303, 400])
  assert.equal(f.calls.token, 1)
  assert.equal(f.calls.userinfo, 1)
  const success = callbacks.find(value => value.status === 303)
  const cookies = setCookies(success)
  const sessionHeader = cookies.find(value => value.startsWith('reference_app_session='))
  assert.match(sessionHeader, /HttpOnly; SameSite=Lax; Max-Age=28800/)
  assert.doesNotMatch(sessionHeader, /access-|server-only-secret/)
  const sessionCookie = cookiePair(sessionHeader)
  const session = await fetch(f.base + '/api/session', { headers: { Cookie: sessionCookie } })
  assert.equal(session.status, 200)
  const data = await session.json()
  assert.deepEqual(data.user, { id: data.user.id, subject: 'rooiam-user-123', email: 'person@example.test' })
  assert.equal(f.stores.sessions.size, 1)
  assert.equal(f.stores.users.size, 1)
  const replay = await fetch(`${f.base}/callback?code=single-use&state=${encodeURIComponent(flow.state)}`, { redirect: 'manual', headers: { Cookie: flow.transactionCookie } })
  assert.equal(replay.status, 400)
  assert.equal(f.calls.token, 1)
  const wrongLogout = await fetch(f.base + '/logout', { method: 'POST', redirect: 'manual', headers: { Cookie: sessionCookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'csrf=wrong' })
  assert.equal(wrongLogout.status, 403)
  const logout = await fetch(f.base + '/logout', { method: 'POST', redirect: 'manual', headers: { Cookie: sessionCookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrf: data.csrf }) })
  assert.equal(logout.status, 303)
  assert.equal(new URL(logout.headers.get('location')).pathname, '/v1/oidc/end-session')
  assert.match(setCookies(logout)[0], /reference_app_session=;.*Max-Age=0/)
})

test('wrong state is rejected and consumes the pending transaction', async t => {
  const f = await fixture(); t.after(f.close)
  const flow = await begin(f.base); f.calls.expectedChallenge = flow.challenge
  const rejected = await fetch(`${f.base}/callback?code=never-exchanged&state=attacker`, { redirect: 'manual', headers: { Cookie: flow.transactionCookie } })
  assert.equal(rejected.status, 400)
  assert.equal(f.calls.token, 0)
  assert.equal(f.stores.pending.size, 0)
  const retry = await fetch(`${f.base}/callback?code=never-exchanged&state=${encodeURIComponent(flow.state)}`, { redirect: 'manual', headers: { Cookie: flow.transactionCookie } })
  assert.equal(retry.status, 400)
})

test('failed or reused authorization codes never create an app session', async t => {
  const f = await fixture(); t.after(f.close)
  f.calls.usedCodes.add('already-used')
  const flow = await begin(f.base); f.calls.expectedChallenge = flow.challenge
  const failed = await fetch(`${f.base}/callback?code=already-used&state=${encodeURIComponent(flow.state)}`, { redirect: 'manual', headers: { Cookie: flow.transactionCookie } })
  assert.equal(failed.status, 502)
  assert.equal(f.stores.sessions.size, 0)
  assert.equal((await fetch(f.base + '/api/session')).status, 401)
})

test('production cookie configuration requires HTTPS and sets Secure', async () => {
  assert.throws(() => createReferenceApp({ appBaseUrl: 'http://reference.test', apiBase: 'https://iam.test/v1', widgetUrl: 'https://iam.test/login-widget', workspaceId: 'w', clientId: 'c', clientSecret: 's', secureCookie: true }), /HTTPS/)
  const { app } = createReferenceApp({ appBaseUrl: 'https://reference.test', apiBase: 'https://iam.test/v1', widgetUrl: 'https://iam.test/login-widget', workspaceId: 'w', clientId: 'c', clientSecret: 's', secureCookie: true })
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening')
  try { assert.match(setCookies(await fetch(`http://127.0.0.1:${server.address().port}/login`))[0], /; Secure/) }
  finally { server.close(); await once(server, 'close') }
})
