import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { generateIdentity, approval } from '../rooiam-examples/device-login/fake-phone.mjs'

// Deliberately restricted to the isolated stack documented in device-login.env.example.
const origin = 'http://127.0.0.1:15470'
const database = 'postgres://postgres:rooiam-local-test@127.0.0.1:15439/rooiam_test'
function sql(query) {
  const r = spawnSync('psql', [database, '-X', '-v', 'ON_ERROR_STOP=1', '-At'], { input: query, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(r.stderr)
  return r.stdout.trim()
}
async function request(path, { method = 'GET', body, cookie, userAgent = 'RooiamCertification/Browser' } = {}) {
  const response = await fetch(origin + '/v1' + path, { method, redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: { 'User-Agent': userAgent, ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null, cookie: response.headers.get('set-cookie')?.split(';')[0] }
}
const post = (path, body, cookie) => request(path, { method: 'POST', body, cookie })
const ok = (r) => { assert.equal(r.status, 200, JSON.stringify(r.body)); return r }
const fails = r => { assert.ok(r.status >= 400 && r.status < 500, `Expected rejection: ${JSON.stringify(r)}`); assert.equal(r.cookie, undefined); return r }
const suffix = randomUUID().slice(0,8)
const phone = ok(await post('/test/login', { email: `phone-${suffix}@device.test` }))
const other = ok(await post('/test/login', { email: `other-${suffix}@device.test` }))
const me = ok(await request('/identity/me', { cookie: phone.cookie })).body
function resetIsolatedRateCounters() {
  const r = spawnSync('redis-cli', ['-h', '127.0.0.1', '-p', '15479', 'EVAL', "for _,k in ipairs(redis.call('KEYS','rl:*')) do redis.call('DEL',k) end return 1", '0'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
}
// The test-only login is proof this is test mode before changing the isolated test configuration.
sql("INSERT INTO system_settings(key,value) VALUES ('tenant_login_device_enabled','true'), ('device_attestation_required_for_qr_login','false') ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value;")
const identity = generateIdentity(origin)
const device = ok(await post('/identity/me/devices', { device_label: 'Certification phone', platform: 'android', device_token: identity.device_token, device_public_key: identity.device_public_key }, phone.cookie)).body
const start = async () => {
  // Reset ONLY the dedicated local Redis counters between scenarios, never production.
  // Limits remain active inside races; database tests exercise all 50 simultaneous inserts.
  resetIsolatedRateCounters()
  return ok(await post('/auth/device-login/start', { surface: 'tenant', redirect_uri: 'http://127.0.0.1:15472/my' })).body
}
const preview = async i => ok(await request('/identity/device-login/intents/' + i.public_id, { cookie: phone.cookie })).body
const binding = i => ({ public_id: i.public_id, browser_nonce: i.browser_nonce })
const approve = async i => { const p = await preview(i); return ok(await post('/identity/device-login/approve', approval(identity, p, p.match_number), phone.cookie)) }

let intent = await start()
fails(await post('/auth/device-login/complete', binding(intent)))
let p = await preview(intent)
const signed = approval(identity, p, p.match_number)
fails(await post('/identity/device-login/approve', signed, other.cookie))
fails(await post('/identity/device-login/approve', { ...signed, approval_signature: 'invalid' }, phone.cookie))
fails(await post('/identity/device-login/approve', { ...signed, selected_number: p.match_number === 42 ? 43 : 42 }, phone.cookie))
ok(await post('/identity/device-login/approve', signed, phone.cookie))
fails(await post('/identity/device-login/approve', signed, phone.cookie))
fails(await post('/auth/device-login/complete', { ...binding(intent), browser_nonce: 'x'.repeat(43) }))
fails(await request('/auth/device-login/complete', { method: 'POST', body: binding(intent), userAgent: 'Different browser' }))
const completed = ok(await post('/auth/device-login/complete', binding(intent)))
assert.equal(ok(await request('/identity/me', { cookie: completed.cookie })).body.id, me.id)
fails(await post('/auth/device-login/complete', binding(intent)))
console.log('PASS normal flow, exact user, signature/number/nonce checks, two-account isolation and replay')

intent = await start(); ok(await post('/auth/device-login/cancel', binding(intent)))
fails(await post('/identity/device-login/approve', { ...signed, public_id: intent.public_id }, phone.cookie))
fails(await post('/auth/device-login/complete', binding(intent)))
intent = await start(); ok(await post('/identity/device-login/reject', { public_id: intent.public_id, device_token: identity.device_token }, phone.cookie))
fails(await post('/auth/device-login/complete', binding(intent)))
intent = await start(); sql(`UPDATE device_login_intents SET expires_at = NOW() - INTERVAL '1 second' WHERE public_id = '${intent.public_id}'`)
fails(await post('/auth/device-login/complete', binding(intent)))
console.log('PASS cancellation, denial and expiry')

intent = await start(); await approve(intent)
const results = await Promise.all(Array.from({ length: 50 }, () => post('/auth/device-login/complete', binding(intent))))
assert.equal(results.filter(r => r.status === 200).length, 1)
assert.equal(results.filter(r => r.cookie).length, 1)
console.log('PASS 50 concurrent completions: exactly one successful result')

intent = await start(); p = await preview(intent)
const attempts = approval(identity, p, p.match_number)
const mixed = await Promise.all(Array.from({ length: 50 }, () => [
  post('/identity/device-login/approve', attempts, phone.cookie),
  post('/identity/device-login/reject', { public_id: intent.public_id, device_token: identity.device_token }, phone.cookie),
  post('/auth/device-login/cancel', binding(intent)),
  post('/auth/device-login/complete', binding(intent)),
]).flat())
assert.ok(mixed.filter(r => r.cookie).length <= 1)
assert.ok(mixed.every(r => r.status < 500))
console.log('PASS 200 mixed approve/deny/cancel/complete requests')

intent = await start(); await approve(intent)
ok(await request('/identity/me/devices/' + device.id, { method: 'DELETE', cookie: phone.cookie }))
fails(await post('/auth/device-login/complete', binding(intent)))
console.log('PASS revocation after approval blocks completion')
console.log('Live HTTP certification passed (isolated test policy; vendor attestation and production limits require separate evidence).')
