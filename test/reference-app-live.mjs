import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { createReferenceApp } from '../rooiam-examples/example-4-reference-app/app.mjs'

// Deliberately restricted to the disposable stack in device-login.env.example.
const database = 'postgres://postgres:rooiam-local-test@127.0.0.1:15439/rooiam_test'
const rooiam = process.env.ROOIAM_REFERENCE_TEST_API_ORIGIN || 'http://127.0.0.1:15470'
const appOrigin = process.env.ROOIAM_REFERENCE_TEST_APP_ORIGIN || 'http://127.0.0.1:15474'
for (const origin of [rooiam, appOrigin]) {
  const url = new URL(origin)
  assert.equal(url.protocol, 'http:')
  assert.equal(url.hostname, '127.0.0.1')
  assert.equal(url.pathname, '/')
}
const appPort = Number(new URL(appOrigin).port)
const suffix = crypto.randomUUID().slice(0, 8)
const clientId = `reference-app-${suffix}`
const secretResult = spawnSync('cargo', ['run', '--quiet', '--example', 'generate_client_secret'], { cwd: new URL('../rooiam-server', import.meta.url), encoding: 'utf8', env: { ...process.env, SQLX_OFFLINE: 'true' } })
assert.equal(secretResult.status, 0, secretResult.stderr)
const { client_secret: clientSecret, client_secret_hash: clientSecretHash } = JSON.parse(secretResult.stdout)

function sql(query, variables = {}) {
  const args = [database, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At']
  for (const [key, value] of Object.entries(variables)) args.push('-v', `${key}=${value}`)
  const result = spawnSync('psql', args, { input: query, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout.trim()
}
const cookiePair = response => response.headers.get('set-cookie')?.split(';')[0]
let clientUuid
let server
try {
  // /test/login proves that this is the intended test-mode server before SQL fixtures are created.
  const login = await fetch(`${rooiam}/v1/test/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `reference-${suffix}@device.test` }) })
  assert.equal(login.status, 200)
  const rooiamCookie = cookiePair(login)
  const org = sql("SELECT id FROM organizations WHERE status='active' ORDER BY created_at LIMIT 1")
  assert.match(org, /^[0-9a-f-]{36}$/)
  clientUuid = sql(`INSERT INTO oauth_clients(client_id,client_secret_hash,app_name,app_type,org_id,status) VALUES (:'client_id',:'secret_hash','Phase D reference','web',:'org_id','active') RETURNING id;`, { client_id: clientId, secret_hash: clientSecretHash, org_id: org })
  sql(`INSERT INTO oauth_client_redirect_uris(oauth_client_id,redirect_uri) VALUES (:'client_uuid',:'callback'), (:'client_uuid',:'logout'); INSERT INTO oauth_client_allowed_embed_origins(oauth_client_id,origin) VALUES (:'client_uuid',:'origin');`, { client_uuid: clientUuid, callback: `${appOrigin}/callback`, logout: `${appOrigin}/`, origin: appOrigin })
  const reference = createReferenceApp({ appBaseUrl: appOrigin, apiBase: `${rooiam}/v1`, widgetUrl: `${rooiam}/login-widget`, workspaceId: org, clientId, clientSecret, secureCookie: false })
  server = reference.app.listen(appPort, '127.0.0.1'); await once(server, 'listening')
  const start = await fetch(`${appOrigin}/login`, { redirect: 'manual' })
  assert.equal(start.status, 200)
  assert.equal((await start.text()).includes(clientSecret), false)
  const transactionCookie = cookiePair(start)
  const handoff = await fetch(`${appOrigin}/callback`, { redirect: 'manual', headers: { Cookie: transactionCookie } })
  assert.equal(handoff.status, 302)
  const authorizeUrl = handoff.headers.get('location')
  const authorize = await fetch(authorizeUrl, { redirect: 'manual', headers: { Cookie: rooiamCookie } })
  assert.equal(authorize.status, 302)
  const callback = new URL(authorize.headers.get('location'))
  assert.equal(callback.origin, appOrigin)
  assert.ok(callback.searchParams.get('code'))
  const complete = await fetch(callback, { redirect: 'manual', headers: { Cookie: transactionCookie } })
  assert.equal(complete.status, 303)
  const appCookie = complete.headers.getSetCookie().find(value => value.startsWith('reference_app_session='))?.split(';')[0]
  assert.ok(appCookie)
  const session = await fetch(`${appOrigin}/api/session`, { headers: { Cookie: appCookie } })
  assert.equal(session.status, 200)
  const appIdentity = await session.json()
  const upstreamIdentity = await (await fetch(`${rooiam}/v1/identity/me`, { headers: { Cookie: rooiamCookie } })).json()
  assert.equal(appIdentity.user.subject, upstreamIdentity.id)
  const replay = await fetch(callback, { redirect: 'manual', headers: { Cookie: transactionCookie } })
  assert.equal(replay.status, 400)
  console.log('PASS real Rooiam authorize/code exchange/userinfo creates exactly one app-owned session for the authenticated subject.')
} finally {
  if (server) { server.close(); await once(server, 'close') }
  if (clientUuid) sql("DELETE FROM oauth_clients WHERE id = :'client_uuid'", { client_uuid: clientUuid })
}
