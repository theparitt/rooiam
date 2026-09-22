import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import cookieParser from 'cookie-parser'
import { redis, loadSession, saveSession } from '../src/session.js'
import { proxyRouter } from '../src/routes/proxy.js'
import { authRouter } from '../src/routes/auth.js'

const entries = new Map()
redis.get = async key => entries.get(key)
redis.set = async (key, value) => entries.set(key, value)
redis.del = async key => entries.delete(key)
const originalFetch = globalThis.fetch
const calls = []
let server, base
before(async () => {
  const app = express()
  app.use(express.json(), cookieParser())
  app.use('/auth', authRouter)
  app.use(proxyRouter)
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.message }))
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  base = `http://127.0.0.1:${server.address().port}`
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith(base)) return originalFetch(url, options)
    calls.push({ url, ...options })
    return Response.json({ ok: true })
  }
})
after(async () => {
  globalThis.fetch = originalFetch
  await new Promise(resolve => server.close(resolve))
  redis.disconnect()
})
const session = () => ({ accessToken: 'test-token', createdAt: Date.now(), expiresIn: 3600, userinfo: { sub: 'user' } })
const request = (path, method = 'GET', body) => fetch(base + path, {
  method, headers: { Cookie: 'candycloud_session=valid', 'Content-Type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})

test('demo MFA accepts the actual frontend challenge/code payload', async () => {
  await saveSession('valid', session())
  const result = await request('/mfa/totp/finish', 'POST', { challenge_id: 'demo-totp-challenge', code: '123456' })
  assert.equal(result.status, 200)
  assert.equal((await loadSession('valid')).demo_totp_enabled, true)
  assert.equal((await request('/mfa/totp/finish', 'POST', { code: 'invalid' })).status, 400)
})
test('proxy keeps empty JSON bodies and bearer credentials', async () => {
  await saveSession('valid', session())
  assert.equal((await request('/webauthn/register/start', 'POST', {})).status, 200)
  assert.equal(calls.at(-1).body, '{}')
  assert.equal(calls.at(-1).headers.Authorization, 'Bearer test-token')
  assert.match(calls.at(-1).url, /\/identity\/token\/passkeys\/register\/start$/)
})
test('proxy does not expose arbitrary organization routes or decoded path traversal', async () => {
  await saveSession('valid', session())
  assert.equal((await request('/orgs/current/api-keys', 'DELETE', {})).status, 404)
  await request('/identity/me/sessions/a%2F..%2F..%2Fprofile', 'DELETE')
  assert.match(calls.at(-1).url, /sessions\/a%2F\.\.%2F\.\.%2Fprofile$/)
})
test('Redis updates cannot extend authentication beyond access-token expiry', async () => {
  await saveSession('valid', { ...session(), createdAt: Date.now() - 3601000 })
  assert.equal(await loadSession('valid'), null)
  assert.equal(entries.has('valid'), false)
  assert.equal((await request('/mfa/status')).status, 401)
  await saveSession('valid', { ...session(), expiresIn: 0 })
  assert.equal(await loadSession('valid'), null)
})
test('token responses are not cacheable', async () => {
  await saveSession('valid', session())
  const response = await request('/auth/token')
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
})

test('clearing the display name uses an empty string accepted by the proxy', async () => {
  await saveSession('valid', session())
  assert.equal((await request('/identity/me/profile', 'PATCH', { display_name: '' })).status, 200)
  assert.equal(JSON.parse(calls.at(-1).body).display_name, '')
})
