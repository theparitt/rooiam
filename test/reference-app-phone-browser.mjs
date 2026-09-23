import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { createReferenceApp } from '../rooiam-examples/example-4-reference-app/app.mjs'
import { generateIdentity, approval } from '../rooiam-examples/device-login/fake-phone.mjs'

// Real browser/server regression; the signing device is simulated, not physical evidence.
// Requires the disposable API and hosted frontend from test/device-login.md.
const database = process.env.ROOIAM_BROWSER_TEST_DATABASE || 'postgres://postgres:rooiam-local-test@127.0.0.1:15439/rooiam_test'
const db = new URL(database)
assert.equal(db.hostname, '127.0.0.1')
assert.ok(['15439', '15440'].includes(db.port))
assert.equal(db.pathname, '/rooiam_test')
const apiOrigin = 'http://127.0.0.1:15470'
const hosted = 'http://127.0.0.1:15472'
const appOrigin = 'http://127.0.0.1:15475'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
function sql(query, variables = {}) {
  const args = [database, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1']
  for (const [key, value] of Object.entries(variables)) args.push('-v', `${key}=${value}`)
  const result = spawnSync('psql', args, { input: query, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}
async function api(path, body, cookie, method = body ? 'POST' : 'GET') {
  const r = await fetch(`${apiOrigin}/v1${path}`, { method, redirect: 'error', headers: {
    'Content-Type': 'application/json', Connection: 'close', ...(cookie ? { Cookie: cookie } : {}),
  }, ...(body ? { body: JSON.stringify(body) } : {}) })
  assert.equal(r.status, 200, `API ${path}: ${r.status}`)
  return { response: r, data: await r.json() }
}
let server, browser, clientUuid, deviceId, phoneCookie
try {
  const login = await api('/test/login', { email: 'owner@rooiam.test' })
  phoneCookie = login.response.headers.get('set-cookie').split(';')[0]
  const { data: owner } = await api('/identity/me', null, phoneCookie)
  const org = sql("SELECT id FROM organizations WHERE name='Rooiam Test' AND status='active'")
  assert.match(org, /^[0-9a-f-]{36}$/)
  assert.equal(sql("SELECT allow_device_login FROM organizations WHERE id=:'org'", { org }), 't', 'Enable device login in the disposable workspace first')
  assert.equal(sql("SELECT value FROM system_settings WHERE key='device_attestation_required_for_qr_login'"), 'false', 'Requires the disposable unattested-device policy')
  const generated = spawnSync('cargo', ['run', '--quiet', '--example', 'generate_client_secret'], {
    cwd: new URL('../rooiam-server', import.meta.url), encoding: 'utf8', env: { ...process.env, SQLX_OFFLINE: 'true' },
  })
  assert.equal(generated.status, 0, generated.stderr)
  const secret = JSON.parse(generated.stdout)
  const clientId = `browser-reference-${randomUUID()}`
  clientUuid = sql("INSERT INTO oauth_clients(client_id,client_secret_hash,app_name,app_type,org_id,status) VALUES (:'client',:'hash','Reference browser regression','web',:'org','active') RETURNING id", { client: clientId, hash: secret.client_secret_hash, org })
  sql("INSERT INTO oauth_client_redirect_uris(oauth_client_id,redirect_uri) VALUES (:'id',:'callback'),(:'id',:'logout'); INSERT INTO oauth_client_allowed_embed_origins(oauth_client_id,origin) VALUES (:'id',:'origin')", { id: clientUuid, callback: `${appOrigin}/callback`, logout: `${appOrigin}/`, origin: appOrigin })
  const reference = createReferenceApp({ appBaseUrl: appOrigin, apiBase: `${apiOrigin}/v1`, widgetUrl: `${apiOrigin}/login-widget`, hostedLoginOrigin: hosted, workspaceId: org, clientId, clientSecret: secret.client_secret, secureCookie: false })
  server = reference.app.listen(15475, '127.0.0.1'); await once(server, 'listening')
  const identity = generateIdentity(apiOrigin)
  const { data: device } = await api('/identity/me/devices', { device_label: 'Temporary browser regression signer', platform: 'android', device_token: identity.device_token, device_public_key: identity.device_public_key }, phoneCookie)
  deviceId = device.id
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {}) })
  const page = await browser.newPage()
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  const widget = page.waitForResponse(r => r.url().includes('/login-widget?'))
  await page.goto(`${appOrigin}/login`)
  const widgetResponse = await widget
  assert.equal(widgetResponse.status(), 200)
  assert.equal(await widgetResponse.request().headerValue('referer'), `${appOrigin}/`)
  // A malicious URL destination must not override the server's registered callback.
  const phoneLink = await page.getByRole('link', { name: 'Sign in with your phone', exact: true }).getAttribute('href')
  const destination = new URL(phoneLink); destination.searchParams.set('redirect_uri', 'https://attacker.invalid/callback')
  await page.goto(destination.toString())
  const started = page.waitForResponse(r => r.url().endsWith('/auth/device-login/start'))
  await page.getByRole('button', { name: 'Show QR code', exact: true }).click()
  const startResponse = await started; assert.equal(startResponse.status(), 200)
  assert.equal(startResponse.request().postDataJSON().redirect_uri, `${appOrigin}/callback`)
  const intent = await startResponse.json()
  assert.equal(sql("SELECT oauth_client_id::text || ':' || workspace_id::text FROM device_login_intents WHERE public_id=:'id'", { id: intent.public_id }), `${clientUuid}:${org}`)
  const { data: preview } = await api(`/identity/device-login/intents/${intent.public_id}`, null, phoneCookie)
  await api('/identity/device-login/approve', approval(identity, preview, preview.match_number), phoneCookie)
  await page.getByRole('heading', { name: 'Application session', exact: true }).waitFor({ timeout: 20000 })
  assert.equal(new URL(page.url()).origin, appOrigin)
  const session = await (await page.request.get(`${appOrigin}/api/session`)).json()
  assert.equal(session.user.subject, owner.id)
  assert.equal(reference.stores.sessions.size, 1)
  // Existing IAM session must also hand back to the app rather than portal home.
  await page.goto(`${appOrigin}/login`)
  await page.getByRole('link', { name: 'Sign in with your phone', exact: true }).click()
  await page.getByRole('heading', { name: 'Application session', exact: true }).waitFor()
  assert.equal(new URL(page.url()).origin, appOrigin)
  // A real form submission must complete cross-origin RP logout under the CSP.
  await page.getByRole('button', { name: 'Sign out', exact: true }).click()
  await page.getByRole('link', { name: 'Sign in with Rooiam', exact: true }).waitFor({ timeout: 15000 })
  await page.getByRole('link', { name: 'Sign in with Rooiam', exact: true }).click()
  await page.getByRole('link', { name: 'Sign in with your phone', exact: true }).click()
  await page.getByRole('button', { name: 'Show QR code', exact: true }).waitFor({ timeout: 15000 })
  // Invalid client and unknown workspace fail closed.
  await page.goto(`${hosted}/?workspace_id=${org}&client_id=nonexistent-${randomUUID()}`)
  await page.getByText('This application has no valid registered callback for this workspace.', { exact: false }).first().waitFor()
  assert.equal(await page.getByRole('button', { name: 'Show QR code', exact: true }).count(), 0)
  const unknownWorkspace = randomUUID()
  const invalidBootstrap = await page.request.get(`${apiOrigin}/v1/setup/login-bootstrap?workspace_id=${unknownWorkspace}&client_id=${clientId}`)
  assert.ok(invalidBootstrap.status() >= 400 && invalidBootstrap.status() < 500)
  await page.goto(`${hosted}/?workspace_id=${unknownWorkspace}&client_id=${clientId}`)
  await page.getByText(/Could not validate this application|This application has no valid registered callback/, { exact: false }).first().waitFor()
  assert.equal(await page.getByRole('button', { name: 'Show QR code', exact: true }).count(), 0)
  assert.deepEqual(errors, [])
  console.log('PASS continuous QR -> registered client/workspace -> OIDC callback -> exact application session; existing-session return; logout -> fresh QR; callback tampering, invalid-client and unknown-workspace rejection; iframe origin validation.')
} finally {
  if (browser) await browser.close()
  if (server) { server.close(); await once(server, 'close') }
  if (deviceId) await api(`/identity/me/devices/${deviceId}`, null, phoneCookie, 'DELETE')
  if (clientUuid) sql("DELETE FROM oauth_clients WHERE id=:'id'", { id: clientUuid })
}
