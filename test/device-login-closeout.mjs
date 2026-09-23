// Destructive only to the dedicated closeout stack: PostgreSQL 15441, Redis DB 4.
// Never uses the phone walkthrough (15470/15440/Redis DB 3).
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { readFileSync, writeFileSync, openSync, closeSync } from 'node:fs'
import { randomUUID, createHmac } from 'node:crypto'
import { createServer, request as httpRequest } from 'node:http'
import { generateIdentity, approval } from '../rooiam-examples/device-login/fake-phone.mjs'

const origin = 'http://127.0.0.1:15473'
const db = 'postgres://postgres:rooiam-local-test@127.0.0.1:15441/rooiam_test'
const envPath = '.local/v02-closeout/server.env'
const logPath = '.local/v02-closeout/closeout-server.log'
assert.ok(process.argv.slice(2).every(arg => arg === '--matrix-only'), 'Only --matrix-only is supported')
const flowCount = process.argv.includes('--matrix-only') ? 0 : 1000
const originalEnv = readFileSync(envPath, 'utf8')
for (const line of ['ROOIAM_MODE=test', 'ROOIAM_PORT=15473', `ROOIAM_DATABASE_URL=${db}`, 'ROOIAM_REDIS_URL=redis://127.0.0.1:15479/4'])
  assert.ok(originalEnv.split(/\r?\n/).includes(line), `Required isolated setting: ${line}`)
assert.ok(!originalEnv.includes('15440'), 'Do not use the phone database')
const secrets = new Set()
let server, proxy
const sql = query => {
  const r = spawnSync('psql', [db, '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At'], { input: query, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr); return r.stdout.trim()
}
function resetLimits() {
  const r = spawnSync('redis-cli', ['-h', '127.0.0.1', '-p', '15479', '-n', '4', 'EVAL', "for _,k in ipairs(redis.call('KEYS','rl:*')) do redis.call('DEL',k) end return 1", '0'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
}
async function stop(signal = 'SIGTERM') {
  if (!server || server.exitCode !== null || server.signalCode !== null) return
  const ended = once(server, 'exit'); server.kill(signal); await ended
}
async function boot(mode) {
  const file = '.local/v02-closeout/running.env'
  writeFileSync(file, originalEnv.replace('ROOIAM_MODE=test', `ROOIAM_MODE=${mode}`), { mode: 0o600 })
  const fd = openSync(logPath, 'a', 0o600)
  server = spawn('./rooiam-server/target/debug/rooiam-server', ['--env-file', file], { stdio: ['ignore', fd, fd] }); closeSync(fd)
  for (let i = 0; i < 150; i++) {
    assert.equal(server.exitCode, null, 'Server exited; inspect private closeout log')
    try { await fetch(origin + '/v1/setup/public-urls', { signal: AbortSignal.timeout(1000) }); return } catch {}
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error('Server did not start')
}
async function req(path, body, cookie, method = body ? 'POST' : 'GET', base = origin) {
  const r = await fetch(base + '/v1' + path, { method, redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'User-Agent': 'RooiamCloseout/Browser', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined })
  const text = await r.text()
  let data; try { data = JSON.parse(text) } catch { data = null }
  const session = r.headers.get('set-cookie')?.split(';')[0]
  if (session) secrets.add(session.split('=').slice(1).join('='))
  return { status: r.status, data, cookie: session }
}
const ok = r => { assert.equal(r.status, 200, JSON.stringify(r.data)); return r }
const fail = r => { assert.ok(r.status >= 400 && r.status < 500, `Expected rejection, got ${r.status}`); assert.equal(r.cookie, undefined); return r }
const binding = i => ({ public_id: i.public_id, browser_nonce: i.browser_nonce })
function totp(secret) {
  const bits = [...secret.replace(/=+$/, '').toUpperCase()].map(c => {
    const value = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c); assert.ok(value >= 0)
    return value.toString(2).padStart(5, '0')
  }).join('')
  const key = Buffer.from((bits.match(/.{8}/g) || []).map(b => parseInt(b, 2)))
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)))
  const mac = createHmac('sha1', key).update(counter).digest()
  return String((mac.readUInt32BE(mac[19] & 15) & 0x7fffffff) % 1000000).padStart(6, '0')
}
const actors = []
const intents = []
async function start(actor = actors[0]) {
  resetLimits() // Functional isolation test, NOT throughput or rate-limit evidence.
  const i = ok(await req('/auth/device-login/start', { surface: 'tenant', redirect_uri: actor.redirect })).data
  secrets.add(i.browser_nonce); intents.push(i.public_id); return i
}
async function preview(i, a = actors[0]) { return ok(await req('/identity/device-login/intents/' + i.public_id, undefined, a.cookie)).data }
async function approve(i, a = actors[0]) {
  const p = await preview(i, a)
  const signed = approval(a.identity, p, p.match_number); secrets.add(signed.approval_signature)
  ok(await req('/identity/device-login/approve', signed, a.cookie)); return signed
}
async function complete(i, a = actors[0]) {
  const r = ok(await req('/auth/device-login/complete', binding(i)))
  assert.equal(r.data.user_id, a.user); assert.equal(r.data.redirect_uri, a.redirect)
  assert.equal(ok(await req('/identity/me', undefined, r.cookie)).data.id, a.user)
  fail(await req('/auth/device-login/complete', binding(i)))
  return r
}

try {
  // Refuse to stop or reseed an already-running process.
  let occupied = false
  try { await fetch(origin, { signal: AbortSignal.timeout(1000) }); occupied = true } catch {}
  assert.equal(occupied, false, 'Port 15473 must be unused')
  writeFileSync(logPath, '', { mode: 0o600 })
  await boot('test')
  sql("INSERT INTO system_settings(key,value) VALUES ('tenant_login_device_enabled','true'),('device_attestation_required_for_qr_login','false') ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value")
  for (let n = 0; n < 2; n++) {
    const suffix = randomUUID().slice(0, 8)
    const cookie = ok(await req('/test/login', { email: `closeout-${suffix}@device.test` })).cookie
    const user = ok(await req('/identity/me', undefined, cookie)).data.id
    const identity = generateIdentity(origin); secrets.add(identity.device_token)
    const device = ok(await req('/identity/me/devices', { device_label: 'Isolated closeout fixture', platform: 'android', device_token: identity.device_token, device_public_key: identity.device_public_key }, cookie)).data.id
    const org = sql(`INSERT INTO organizations(name,slug,allow_device_login) VALUES ('Closeout ${n}','closeout-${suffix}',true) RETURNING id`)
    const client = sql(`INSERT INTO oauth_clients(client_id,app_name,app_type,org_id) VALUES ('closeout-${suffix}','Closeout ${n}','web','${org}') RETURNING id`)
    const redirect = `https://closeout-${suffix}.example/callback`
    sql(`INSERT INTO oauth_client_redirect_uris(oauth_client_id,redirect_uri) VALUES ('${client}','${redirect}'); INSERT INTO organization_members(organization_id,user_id) VALUES ('${org}','${user}')`)
    actors.push({ cookie, user, identity, device, org, client, redirect })
  }
  await stop(); await boot('production')
  assert.equal((await req('/test/login', {})).status, 404)
  resetLimits()
  for (let n = 0; n < 11; n++) assert.equal((await req('/auth/device-login/start', { surface: 'admin' })).status, n < 10 ? 400 : 429)
  resetLimits()
  for (let n = 0; n < 121; n++) assert.equal((await req('/auth/device-login/00000000-0000-0000-0000-000000000000/status?browser_nonce=' + 'x'.repeat(43))).status, n < 120 ? 404 : 429)
  console.log('PASS production routes and start/status limits (no resets within each burst)')

  const zero = '00000000-0000-0000-0000-000000000000'
  for (const [path, method, limit, authenticated] of [
    ['/auth/device-login/complete', 'POST', 30, false],
    ['/auth/device-login/cancel', 'POST', 30, false],
    ['/identity/device-login/approve', 'POST', 30, true],
    ['/identity/device-login/reject', 'POST', 30, true],
    [`/identity/device-login/intents/${zero}`, 'GET', 120, true],
    ['/identity/me/devices', 'GET', 10, true],
    ['/identity/me/devices', 'POST', 10, true],
    ['/identity/me/devices/attestation-challenge', 'POST', 10, true],
    [`/identity/me/devices/${zero}`, 'DELETE', 30, true],
    [`/identity/me/devices/${zero}/push-token`, 'PUT', 30, true],
  ]) {
    resetLimits()
    for (let n = 0; n <= limit; n++) {
      const r = await req(path, ['GET', 'DELETE'].includes(method) ? undefined : {}, authenticated ? actors[0].cookie : undefined, method)
      if (n === limit) assert.equal(r.status, 429, `${method} ${path}`)
      else assert.ok(r.status < 500 && r.status !== 429, `${method} ${path} limited before attempt ${limit + 1}: ${r.status}`)
      assert.equal(r.cookie, undefined)
    }
  }
  console.log('PASS endpoint limits for completion, cancellation, preview, approval, denial, device list/enrollment/revocation/push and attestation challenge')

  for (const raw of ['{', 'null', '[]', '{"surface":42}', '{"surface":"tenant","unknown":true}',
    '{"surface":"tenant","surface":"admin"}', '{"surface":"' + 'x'.repeat(2_100_000) + '"}']) {
    resetLimits()
    const response = await fetch(origin + '/v1/auth/device-login/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw, signal: AbortSignal.timeout(15000) })
    assert.ok([400, 413].includes(response.status), `Malformed body returned ${response.status}`)
    assert.equal(response.headers.get('set-cookie'), null); await response.text()
  }
  console.log('PASS malformed, duplicate, unknown, wrong-type and oversized JSON fails without session')

  let i = await start(); let p = await preview(i)
  const signed = approval(actors[0].identity, p, p.match_number)
  fail(await req('/identity/device-login/approve', signed, actors[1].cookie))
  fail(await req('/identity/device-login/approve', { ...signed, device_token: actors[1].identity.device_token }, actors[0].cookie))
  await approve(i); await complete(i)
  for (const [field, disabled, enabled] of [['allow_device_login', 'false', 'true'], ['status', "'suspended'", "'active'"]]) {
    i = await start(); await approve(i)
    sql(`UPDATE organizations SET ${field}=${disabled} WHERE id='${actors[0].org}'`)
    fail(await req('/auth/device-login/complete', binding(i)))
    sql(`UPDATE organizations SET ${field}=${enabled} WHERE id='${actors[0].org}'`)
    await complete(i)
  }
  i = await start(); await approve(i)
  sql(`DELETE FROM oauth_client_redirect_uris WHERE oauth_client_id='${actors[0].client}'`)
  fail(await req('/auth/device-login/complete', binding(i)))
  sql(`INSERT INTO oauth_client_redirect_uris(oauth_client_id,redirect_uri) VALUES ('${actors[0].client}','${actors[0].redirect}')`)
  await complete(i)
  i = await start(); await approve(i)
  sql(`UPDATE organizations SET require_mfa=true WHERE id='${actors[0].org}'`)
  const mfa = ok(await req('/auth/device-login/complete', binding(i)))
  assert.equal(mfa.data.mfa_enrollment_required, true); assert.equal(mfa.cookie, undefined)
  assert.equal(sql(`SELECT status FROM device_login_intents WHERE public_id='${i.public_id}'`), 'consumed')
  fail(await req('/auth/device-login/complete', binding(i)))
  const enrollment = ok(await req('/mfa/login/enroll/start', { challenge_id: mfa.data.challenge_id })).data
  secrets.add(enrollment.secret)
  const finished = ok(await req('/mfa/login/enroll/finish', { challenge_id: mfa.data.challenge_id, code: totp(enrollment.secret) }))
  assert.equal(finished.data.redirect_uri, actors[0].redirect)
  assert.equal(ok(await req('/identity/me', undefined, finished.cookie)).data.id, actors[0].user)
  for (const code of finished.data.recovery_codes) secrets.add(code)
  fail(await req('/mfa/login/enroll/finish', { challenge_id: mfa.data.challenge_id, code: totp(enrollment.secret) }))
  i = await start(); await approve(i)
  const challenge = ok(await req('/auth/device-login/complete', binding(i)))
  assert.equal(challenge.data.mfa_required, true); assert.equal(challenge.cookie, undefined)
  fail(await req('/mfa/login/verify', { challenge_id: challenge.data.challenge_id, code: 'invalid' }))
  const verified = ok(await req('/mfa/login/verify', { challenge_id: challenge.data.challenge_id, code: totp(enrollment.secret) }))
  assert.equal(verified.data.redirect_uri, actors[0].redirect)
  assert.equal(ok(await req('/identity/me', undefined, verified.cookie)).data.id, actors[0].user)
  fail(await req('/mfa/login/verify', { challenge_id: challenge.data.challenge_id, code: totp(enrollment.secret) }))
  // Remove only this disposable fixture's MFA, without revoking its test session.
  sql(`DELETE FROM user_mfa_methods WHERE user_id='${actors[0].user}'; DELETE FROM user_mfa_backup_codes WHERE user_id='${actors[0].user}'`)
  sql(`UPDATE organizations SET require_mfa=false WHERE id='${actors[0].org}'`)
  console.log('PASS two identities/devices; workspace disable/suspend, callback removal, MFA enrollment and existing-TOTP completion with callback/replay checks')

  const pending = await start(), approved = await start(), denied = await start(), cancelled = await start()
  await approve(approved)
  ok(await req('/identity/device-login/reject', { public_id: denied.public_id, device_token: actors[0].identity.device_token }, actors[0].cookie))
  ok(await req('/auth/device-login/cancel', binding(cancelled)))
  await stop('SIGKILL'); await boot('production')
  assert.equal((await preview(pending)).status, 'pending')
  await approve(pending); await complete(pending); await complete(approved)
  for (const terminal of [denied, cancelled]) fail(await req('/auth/device-login/complete', binding(terminal)))
  console.log('PASS SIGKILL/restart preserves pending, approved, denied, cancelled and enrolled identities without restore/reseed')

  // Forward a real completion, discard its response, then sever the client connection.
  // Waiting for upstream end proves the server finished before the client lost it.
  proxy = createServer((incoming, outgoing) => {
    const upstream = httpRequest(origin + incoming.url, { method: incoming.method, headers: incoming.headers }, response => {
      response.resume(); response.on('end', () => outgoing.destroy())
    }); upstream.on('error', () => outgoing.destroy()); incoming.pipe(upstream)
  })
  proxy.listen(15478, '127.0.0.1'); await once(proxy, 'listening')
  i = await start(); await approve(i)
  const before = Number(sql(`SELECT count(*) FROM sessions WHERE user_id='${actors[0].user}'`))
  await assert.rejects(() => req('/auth/device-login/complete', binding(i), undefined, 'POST', 'http://127.0.0.1:15478'))
  fail(await req('/auth/device-login/complete', binding(i)))
  assert.equal(Number(sql(`SELECT count(*) FROM sessions WHERE user_id='${actors[0].user}'`)), before + 1)
  await stop('SIGKILL'); await boot('production')
  fail(await req('/auth/device-login/complete', binding(i)))
  console.log('PASS lost completion response creates one result; replay fails before and after process restart')

  for (let n = 0; n < flowCount; n++) {
    const a = actors[n % 2]
    i = await start(a); p = await preview(i, a)
    assert.equal(p.workspace_id, a.org); assert.equal(p.application_id, a.client); assert.equal(p.redirect_uri, a.redirect)
    await approve(i, a); await complete(i, a)
    if ((n + 1) % 100 === 0) console.log(`PASS ${n + 1}/1000 sequential flows with exact user/workspace/client and replay rejection`)
  }
  i = await start(); await approve(i)
  ok(await req('/identity/me/devices/' + actors[0].device, undefined, actors[0].cookie, 'DELETE'))
  fail(await req('/auth/device-login/complete', binding(i)))
  await stop()
  const logs = readFileSync(logPath, 'utf8')
  const audits = sql('SELECT metadata::text FROM audit_logs')
  for (const value of secrets) if (value && value.length >= 20) {
    assert.equal(logs.includes(value), false, 'Secret fixture leaked in server logs')
    assert.equal(audits.includes(value), false, 'Secret fixture leaked in audit metadata')
  }
  console.log(`PASS revocation; server log inspection against ${secrets.size} nonce/token/cookie/signature fixtures`)
  console.log('Closeout HTTP checks passed. Simulated devices; relaxed attestation; sequential functional run, not a throughput benchmark or real-vendor acceptance.')
} finally {
  await stop()
  if (proxy) { proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)) }
}
