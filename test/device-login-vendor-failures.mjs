// Isolated real-Google rejection and missing-verifier checks. Never point this at a user database.
// Requires ROOIAM_VENDOR_GATE_DATABASE_URL on a dedicated PostgreSQL instance at 127.0.0.1:15485,
// ROOIAM_VENDOR_GATE_ENV_TEMPLATE (an isolated test-mode env file), and
// GOOGLE_APPLICATION_CREDENTIALS for service-account impersonation.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { generateIdentity, approval } from '../rooiam-examples/device-login/fake-phone.mjs'

const origin = 'http://127.0.0.1:15483'
const db = process.env.ROOIAM_VENDOR_GATE_DATABASE_URL
const templatePath = process.env.ROOIAM_VENDOR_GATE_ENV_TEMPLATE
const adcPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
assert.match(db || '', /^postgres:\/\/[^@]+@127\.0\.0\.1:15485\/rooiam_test$/, 'Use only the dedicated PostgreSQL instance on port 15485')
assert.ok(templatePath && adcPath, 'An isolated env template and ADC are required')
const template = readFileSync(templatePath, 'utf8')
assert.match(template, /^ROOIAM_MODE=test$/m)
assert.ok(!template.includes(db), 'The template must be a separate source environment')
const workDir = '.local/v02-vendor-gate'
mkdirSync(workDir, { recursive: true, mode: 0o700 })
let server

function sql(query) {
  const result = spawnSync('psql', [db, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At'], { input: query, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}
async function boot(mode, adc) {
  let env = template
    .replace(/^ROOIAM_MODE=.*$/m, `ROOIAM_MODE=${mode}`)
    .replace(/^ROOIAM_PORT=.*$/m, 'ROOIAM_PORT=15483')
    .replace(/^ROOIAM_SERVER_URL=.*$/m, `ROOIAM_SERVER_URL=${origin}`)
    .replace(/^ROOIAM_DATABASE_URL=.*$/m, `ROOIAM_DATABASE_URL=${db}`)
    .replace(/^ROOIAM_REDIS_URL=.*$/m, 'ROOIAM_REDIS_URL=redis://127.0.0.1:15479/5')
  env += `\nROOIAM_GOOGLE_PLAY_USE_ADC=${adc}\n`
  const envFile = `${workDir}/running.env`
  writeFileSync(envFile, env, { mode: 0o600 })
  const fd = openSync(`${workDir}/server.log`, 'a', 0o600)
  const { ROOIAM_VENDOR_GATE_DATABASE_URL, ROOIAM_VENDOR_GATE_ENV_TEMPLATE, ...serverEnv } = process.env
  server = spawn('./rooiam-server/target/debug/rooiam-server', ['--env-file', envFile], {
    env: { ...serverEnv, GOOGLE_APPLICATION_CREDENTIALS: adc ? adcPath : '' },
    stdio: ['ignore', fd, fd],
  })
  closeSync(fd)
  for (let attempt = 0; attempt < 120; attempt++) {
    assert.equal(server.exitCode, null, 'Isolated server exited; inspect private log')
    try {
      const response = await fetch(`${origin}/v1/setup/public-urls`, { signal: AbortSignal.timeout(1000) })
      if (response.ok) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('Isolated server did not start')
}
async function stop() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return
  const ended = once(server, 'exit')
  server.kill('SIGTERM')
  await ended
}
async function request(path, body, cookie) {
  const response = await fetch(`${origin}/v1${path}`, {
    method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const raw = await response.text()
  let data
  try { data = JSON.parse(raw) } catch { data = null }
  return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] }
}
function ok(result) {
  assert.equal(result.status, 200, JSON.stringify(result.data))
  return result
}
async function assertNoBrowserSession(intent) {
  const completed = await request('/auth/device-login/complete', {
    public_id: intent.public_id, browser_nonce: intent.browser_nonce,
  })
  assert.notEqual(completed.status, 200)
  assert.equal(completed.cookie, undefined)
  assert.equal(sql(`SELECT status FROM device_login_intents WHERE public_id='${intent.public_id}'`), 'pending')
}
async function run() {
  try {
    try { await fetch(origin, { signal: AbortSignal.timeout(500) }); throw new Error('Port 15483 is occupied') } catch (error) {
      if (error.message === 'Port 15483 is occupied') throw error
    }
    await boot('test', false)
    const suffix = randomUUID().slice(0, 8)
    const cookie = ok(await request('/test/login', { email: `vendor-gate-${suffix}@device.test` })).cookie
    const user = ok(await request('/identity/me', undefined, cookie)).data.id
    const identities = [generateIdentity(origin), generateIdentity(origin)]
    const devices = []
    for (const identity of identities) {
      const registered = ok(await request('/identity/me/devices', {
        device_label: 'Isolated vendor failure fixture', platform: 'android',
        device_token: identity.device_token, device_public_key: identity.device_public_key,
        attestation: { format: 'android-play-integrity', key_id: 'vendor-gate',
          app_id: 'com.rooiam.reference', environment: 'production',
          statement: `invalid-certification-smoke-token-${randomUUID()}` },
      }, cookie)).data
      assert.equal(registered.attestation.status, 'pending')
      devices.push(registered.id)
    }
    const org = sql(`INSERT INTO organizations(name,slug,allow_device_login) VALUES ('Vendor Gate','vendor-gate-${suffix}',true) RETURNING id`)
    const client = sql(`INSERT INTO oauth_clients(client_id,app_name,app_type,org_id) VALUES ('vendor-gate-${suffix}','Vendor Gate','web','${org}') RETURNING id`)
    const redirect = `https://vendor-gate-${suffix}.example/callback`
    sql(`INSERT INTO oauth_client_redirect_uris(oauth_client_id,redirect_uri) VALUES ('${client}','${redirect}'); INSERT INTO organization_members(organization_id,user_id) VALUES ('${org}','${user}')`)
    sql("INSERT INTO system_settings(key,value) VALUES ('tenant_login_device_enabled','true'),('device_attestation_required_for_qr_login','true'),('device_attestation_require_vendor_verification_for_qr_login','true'),('device_attestation_allow_development_environments','false'),('device_attestation_allowed_app_ids','com.rooiam.reference') ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value")
    await stop()

    async function attempt(index) {
      const intent = ok(await request('/auth/device-login/start', { surface: 'tenant', redirect_uri: redirect })).data
      const preview = ok(await request(`/identity/device-login/intents/${intent.public_id}`, undefined, cookie)).data
      const result = await request('/identity/device-login/approve', approval(identities[index], preview, preview.match_number), cookie)
      assert.equal(result.cookie, undefined)
      await assertNoBrowserSession(intent)
      return result
    }

    await boot('production', true)
    const rejected = await attempt(0)
    assert.equal(rejected.status, 403, 'Google must reject the invalid attestation token')
    assert.equal(sql(`SELECT attestation_status FROM user_trusted_devices WHERE id='${devices[0]}'`), 'rejected')
    console.log('PASS live Google invalid-token rejection: no QR approval or browser session')
    await stop()

    await boot('production', false)
    const unavailable = await attempt(1)
    assert.ok(unavailable.status >= 500, 'Missing verifier must fail closed')
    assert.equal(sql(`SELECT attestation_status FROM user_trusted_devices WHERE id='${devices[1]}'`), 'pending')
    console.log('PASS missing-verifier failure: pending device/intent, no browser session')
  } finally {
    await stop()
  }
}

await run()
