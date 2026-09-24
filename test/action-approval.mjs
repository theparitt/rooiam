// Isolated 0.3 API test. Requires a disposable test-mode server/database.
// Never run against production or a database containing user data.
import assert from 'node:assert/strict'
import { createPrivateKey, sign } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { generateIdentity } from '../rooiam-examples/device-login/fake-phone.mjs'

const envFile = process.env.ROOIAM_ACTION_TEST_ENV || '.local/v03-action/server.env'
const settings = Object.fromEntries(readFileSync(envFile, 'utf8').split(/\r?\n/).filter(x => x && !x.startsWith('#') && x.includes('=')).map(x => x.split(/=(.*)/s).slice(0, 2)))
const origin = settings.ROOIAM_SERVER_URL
const database = new URL(settings.ROOIAM_DATABASE_URL)
assert.equal(settings.ROOIAM_MODE, 'test')
assert.equal(origin, 'http://127.0.0.1:15493')
assert.equal(database.hostname, '127.0.0.1')
assert.equal(database.port, '15494')
assert.equal(database.pathname, '/rooiam') // Test mode isolates into rooiam_test on this dedicated server.
assert.equal(settings.ROOIAM_REDIS_URL, 'redis://127.0.0.1:15479/7')
const passwordEnv = { ...process.env, PGPASSWORD: decodeURIComponent(database.password) }

function resetLimits() {
  const result = spawnSync('redis-cli', ['-h', '127.0.0.1', '-p', '15479', '-n', '7', 'EVAL', "for _,k in ipairs(redis.call('KEYS','rl:*')) do redis.call('DEL',k) end return 1", '0'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
}

function sql(statement) {
  const result = spawnSync('psql', ['-h', database.hostname, '-p', database.port, '-U', decodeURIComponent(database.username), '-d', 'rooiam_test', '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', statement], { env: passwordEnv, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}
async function request(path, { method = 'GET', body, cookie } = {}) {
  resetLimits() // Functional isolation, not a rate-limit test.
  const response = await fetch(origin + '/v1' + path, { method, redirect: 'error', signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'RooiamActionApprovalTest/1', ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const data = await response.json().catch(() => ({}))
  return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] }
}
function expect(result, status) {
  assert.equal(result.status, status, `Expected ${status}, got ${result.status}: ${result.data?.error?.message || ''}`)
  return result.data
}
function reject(result) { assert.ok(result.status >= 400 && result.status < 500, `Expected 4xx, got ${result.status}`) }

const suffix = Math.random().toString(36).slice(2, 10)
const ownerEmail = `action-${suffix}@action-${suffix}.test`
const ownerLogin = await request('/test/login', { method: 'POST', body: { email: ownerEmail } })
expect(ownerLogin, 200)
const owner = ownerLogin.cookie
assert.ok(owner?.startsWith('rooiam_sid='))
const me = expect(await request('/identity/me', { cookie: owner }), 200)
const keyBody = { label: '0.3 test key', permission_preset: 'workspace_admin', expires_at: null }

// Off by default: preserve the previous API-key behavior.
assert.equal(expect(await request('/orgs/current/api-key-phone-policy', { cookie: owner }), 200).required, false)
const offKey = expect(await request('/orgs/current/api-keys', { method: 'POST', cookie: owner, body: keyBody }), 201)
assert.ok(offKey.raw_key?.startsWith('rooiam_'))
expect(await request('/orgs/current/api-keys/' + offKey.key.id, { method: 'DELETE', cookie: owner }), 200)

// Test-only fake signer. Marking this fixture verified is allowed solely in this
// dedicated disposable DB; it is not Play Integrity evidence.
const identity = generateIdentity(origin)
const device = expect(await request('/identity/me/devices', { method: 'POST', cookie: owner,
  body: { device_label: '0.3 isolated fake phone', platform: 'android', device_token: identity.device_token, device_public_key: identity.device_public_key } }), 200)
assert.match(device.id, /^[\da-f-]{36}$/)
sql(`UPDATE user_trusted_devices SET attestation_status = 'verified', attestation_verified_at = NOW() WHERE id = '${device.id}' AND user_id = '${me.id}'`)
expect(await request('/orgs/current/api-key-phone-policy', { method: 'PUT', cookie: owner, body: { required: true } }), 200)
reject(await request('/orgs/current/api-keys', { method: 'POST', cookie: owner, body: keyBody }))

async function start(label = keyBody.label) {
  const result = expect(await request('/orgs/current/action-approvals', { method: 'POST', cookie: owner, body: { ...keyBody, label } }), 201)
  assert.ok(result.qr_value.startsWith('rooiam://action-approval?'))
  assert.equal(new URL(result.qr_value).searchParams.get('v'), '1')
  assert.ok(!result.qr_value.includes(result.browser_proof))
  assert.equal(result.display_code.length, 6)
  return result
}
async function phonePreview(action) { return expect(await request('/identity/action-approvals/' + action.id, { cookie: owner }), 200) }
function signedDecision(action, preview) {
  return { id: action.id, display_code: action.display_code, device_token: identity.device_token,
    approval_signature: sign(null, Buffer.from(preview.approval_payload, 'utf8'), createPrivateKey(identity.private_key)).toString('base64url') }
}
const approval = await start()
const browser = { id: approval.id, browser_proof: approval.browser_proof }
expect(await request('/orgs/current/action-approvals/status', { method: 'POST', cookie: owner, body: browser }), 200)
reject(await request('/orgs/current/action-approvals/status', { method: 'POST', cookie: owner, body: { ...browser, browser_proof: 'bad' } }))
const otherUser = await request('/test/login', { method: 'POST', body: { email: `other-${suffix}@other-${suffix}.test` } })
expect(otherUser, 200)
expect(await request('/identity/action-approvals/' + approval.id, { cookie: otherUser.cookie }), 404)
const secondLogin = await request('/test/login', { method: 'POST', body: { email: ownerEmail } })
expect(secondLogin, 200)
expect(await request('/orgs/current/action-approvals/status', { method: 'POST', cookie: secondLogin.cookie, body: browser }), 404)
const preview = await phonePreview(approval)
assert.equal(preview.action, 'workspace.api_key.create')
assert.equal(preview.server_origin, origin)
assert.equal(preview.label, keyBody.label)
assert.equal(preview.permission_preset, keyBody.permission_preset)
assert.ok(preview.allowed_permissions.includes('workspace.read'))
reject(await request('/identity/action-approvals/approve', { method: 'POST', cookie: otherUser.cookie, body: signedDecision(approval, preview) }))
const loginPurposeSignature = sign(null, Buffer.from('rooiam-device-login/v1\n' + approval.id), createPrivateKey(identity.private_key)).toString('base64url')
reject(await request('/identity/action-approvals/approve', { method: 'POST', cookie: owner, body: { ...signedDecision(approval, preview), approval_signature: loginPurposeSignature } }))
reject(await request('/identity/action-approvals/approve', { method: 'POST', cookie: owner, body: { ...signedDecision(approval, preview), approval_signature: 'invalid' } }))
reject(await request('/identity/action-approvals/approve', { method: 'POST', cookie: owner, body: { ...signedDecision(approval, preview), display_code: '000000' === approval.display_code ? '999999' : '000000' } }))
const wrongOriginPayload = preview.approval_payload.replace(origin, 'https://another.example')
reject(await request('/identity/action-approvals/approve', { method: 'POST', cookie: owner, body: { ...signedDecision(approval, preview), approval_signature: sign(null, Buffer.from(wrongOriginPayload, 'utf8'), createPrivateKey(identity.private_key)).toString('base64url') } }))
expect(await request('/identity/action-approvals/approve', { method: 'POST', cookie: owner, body: signedDecision(approval, preview) }), 200)
reject(await request('/orgs/current/api-keys', { method: 'POST', cookie: owner, body: { ...keyBody, label: 'changed', approval_id: approval.id, browser_proof: approval.browser_proof } }))
reject(await request('/orgs/current/api-keys', { method: 'POST', cookie: secondLogin.cookie, body: { ...keyBody, approval_id: approval.id, browser_proof: approval.browser_proof } }))
const created = expect(await request('/orgs/current/api-keys', { method: 'POST', cookie: owner, body: { ...keyBody, approval_id: approval.id, browser_proof: approval.browser_proof } }), 201)
assert.ok(created.raw_key?.startsWith('rooiam_'))
assert.equal(expect(await request('/orgs/current/action-approvals/status', { method: 'POST', cookie: owner, body: browser }), 200).status, 'consumed')
reject(await request('/orgs/current/api-keys', { method: 'POST', cookie: owner, body: { ...keyBody, approval_id: approval.id, browser_proof: approval.browser_proof } }))

const denied = await start('denied key')
expect(await request('/identity/action-approvals/deny', { method: 'POST', cookie: owner, body: { id: denied.id, device_token: identity.device_token } }), 200)
reject(await request('/orgs/current/api-keys', { method: 'POST', cookie: owner, body: { ...keyBody, label: 'denied key', approval_id: denied.id, browser_proof: denied.browser_proof } }))
const cancelled = await start('cancelled key')
expect(await request('/orgs/current/action-approvals/cancel', { method: 'POST', cookie: owner, body: { id: cancelled.id, browser_proof: cancelled.browser_proof } }), 200)
reject(await request('/identity/action-approvals/approve', { method: 'POST', cookie: owner, body: signedDecision(cancelled, await phonePreview(cancelled)) }))

const raced = await start('concurrent key')
const racePreview = await phonePreview(raced)
expect(await request('/identity/action-approvals/approve', { method: 'POST', cookie: owner, body: signedDecision(raced, racePreview) }), 200)
const raceBody = { ...keyBody, label: 'concurrent key', approval_id: raced.id, browser_proof: raced.browser_proof }
const raceResults = await Promise.all([0, 1].map(() => request('/orgs/current/api-keys', { method: 'POST', cookie: owner, body: raceBody })))
assert.deepEqual(raceResults.map(r => r.status === 201).sort(), [false, true])
const racedKey = raceResults.find(r => r.status === 201).data.key.id
expect(await request('/orgs/current/api-keys/' + racedKey, { method: 'DELETE', cookie: owner }), 200)

const stale = await start('policy changed key')
expect(await request('/identity/action-approvals/approve', { method: 'POST', cookie: owner, body: signedDecision(stale, await phonePreview(stale)) }), 200)
expect(await request('/orgs/current/api-key-phone-policy', { method: 'PUT', cookie: owner, body: { required: false } }), 200)
expect(await request('/orgs/current/api-key-phone-policy', { method: 'PUT', cookie: owner, body: { required: true } }), 200)
reject(await request('/orgs/current/api-keys', { method: 'POST', cookie: owner, body: { ...keyBody, label: 'policy changed key', approval_id: stale.id, browser_proof: stale.browser_proof } }))

const removedRole = await start('removed-role key')
expect(await request('/identity/action-approvals/approve', { method: 'POST', cookie: owner, body: signedDecision(removedRole, await phonePreview(removedRole)) }), 200)
const orgId = sql(`SELECT org_id FROM workspace_action_approvals WHERE id = '${removedRole.id}'`)
assert.match(orgId, /^[\da-f-]{36}$/)
sql(`UPDATE organization_members SET status = 'inactive' WHERE organization_id = '${orgId}' AND user_id = '${me.id}'`)
reject(await request('/orgs/current/api-keys', { method: 'POST', cookie: owner, body: { ...keyBody, label: 'removed-role key', approval_id: removedRole.id, browser_proof: removedRole.browser_proof } }))
sql(`UPDATE organization_members SET status = 'active' WHERE organization_id = '${orgId}' AND user_id = '${me.id}'`)

// An approved request cannot exceed the workspace's ten-active-key limit.
// The existing successful key accounts for one; add nine disposable fixtures.
sql(`INSERT INTO tenant_api_keys (org_id, created_by, label, key_hash, key_prefix, permission_preset, allowed_permissions)
  SELECT '${orgId}', '${me.id}', 'limit-fixture-${suffix}-' || g.n,
    md5('limit-fixture-${suffix}-' || g.n), 'limit-fixt', 'workspace_admin', ARRAY['workspace.read']
  FROM generate_series(1, 9) AS g(n)`)
const atLimit = await start('limit key')
expect(await request('/identity/action-approvals/approve', { method: 'POST', cookie: owner, body: signedDecision(atLimit, await phonePreview(atLimit)) }), 200)
reject(await request('/orgs/current/api-keys', { method: 'POST', cookie: owner, body: { ...keyBody, label: 'limit key', approval_id: atLimit.id, browser_proof: atLimit.browser_proof } }))
assert.equal(sql(`SELECT COUNT(*) FROM tenant_api_keys WHERE org_id = '${orgId}' AND revoked = FALSE`), '10')
assert.equal(expect(await request('/orgs/current/action-approvals/status', { method: 'POST', cookie: owner, body: { id: atLimit.id, browser_proof: atLimit.browser_proof } }), 200).status, 'approved')
sql(`DELETE FROM tenant_api_keys WHERE org_id = '${orgId}' AND label LIKE 'limit-fixture-${suffix}-%'`)

const expired = await start('expired key')
sql(`UPDATE workspace_action_approvals SET expires_at = NOW() - interval '1 second' WHERE id = '${expired.id}'`)
assert.equal(expect(await request('/orgs/current/action-approvals/status', { method: 'POST', cookie: owner, body: { id: expired.id, browser_proof: expired.browser_proof } }), 200).status, 'expired')
reject(await request('/identity/action-approvals/approve', { method: 'POST', cookie: owner, body: signedDecision(expired, await phonePreview(expired)) }))

const revoked = await start('revoked-device key')
expect(await request('/identity/action-approvals/approve', { method: 'POST', cookie: owner, body: signedDecision(revoked, await phonePreview(revoked)) }), 200)
sql(`UPDATE sessions SET created_at = NOW() - interval '11 minutes' WHERE user_id = '${me.id}'`)
expect(await request('/identity/me/devices/' + device.id, { method: 'DELETE', cookie: owner }), 403)
sql(`UPDATE sessions SET created_at = NOW() WHERE user_id = '${me.id}'`)
const pendingAtRevoke = await start('pending-at-revoke key')
const racingAtRevoke = await start('racing-at-revoke key')
const racingPreview = await phonePreview(racingAtRevoke)
const approvedLoginAtRevoke = sql(`INSERT INTO device_login_intents (public_id,browser_binding_hash,nonce_hash,display_code,match_number,status,approved_user_id,approved_device_id,expires_at)
  VALUES (gen_random_uuid(),'recovery-test','recovery-test','123456',1,'approved','${me.id}','${device.id}',NOW() + interval '5 minutes') RETURNING public_id`).split('\n')[0]
expect(await request('/identity/me/devices/' + device.id, { method: 'DELETE', cookie: otherUser.cookie }), 404)
const [racingDecision, revokeResult] = await Promise.all([
  request('/identity/action-approvals/approve', { method: 'POST', cookie: owner, body: signedDecision(racingAtRevoke, racingPreview) }),
  request('/identity/me/devices/' + device.id, { method: 'DELETE', cookie: owner }),
])
expect(revokeResult, 200)
assert.ok(racingDecision.status === 200 || (racingDecision.status >= 400 && racingDecision.status < 500))
assert.notEqual(sql(`SELECT status FROM workspace_action_approvals WHERE id = '${racingAtRevoke.id}'`), 'approved')
assert.equal(sql(`SELECT status FROM workspace_action_approvals WHERE id = '${revoked.id}'`), 'cancelled')
assert.equal(sql(`SELECT status FROM workspace_action_approvals WHERE id = '${pendingAtRevoke.id}'`), 'cancelled')
assert.equal(sql(`SELECT status FROM device_login_intents WHERE public_id = '${approvedLoginAtRevoke}'`), 'rejected')
assert.equal(sql(`SELECT revoked_at IS NOT NULL FROM user_trusted_devices WHERE id = '${device.id}'`), 't')
assert.equal(sql(`SELECT push_token IS NULL FROM user_trusted_devices WHERE id = '${device.id}'`), 't')
expect(await request('/identity/me/devices/' + device.id, { method: 'DELETE', cookie: owner }), 404)
reject(await request('/identity/action-approvals/approve', { method: 'POST', cookie: owner, body: signedDecision(pendingAtRevoke, await phonePreview(pendingAtRevoke)) }))
reject(await request('/orgs/current/api-keys', { method: 'POST', cookie: owner, body: { ...keyBody, label: 'revoked-device key', approval_id: revoked.id, browser_proof: revoked.browser_proof } }))

const keys = expect(await request('/orgs/current/api-keys', { cookie: owner }), 200)
assert.equal(keys.filter(k => k.id === created.key.id).length, 1)
assert.ok(keys.every(k => !Object.hasOwn(k, 'raw_key')))
expect(await request('/orgs/current/api-keys/' + created.key.id, { method: 'DELETE', cookie: owner }), 200)
expect(await request('/orgs/current/api-key-phone-policy', { method: 'PUT', cookie: owner, body: { required: false } }), 200)
console.log('PASS: policy-off behavior, direct-route enforcement, bindings, signature purpose, exact payload, replay, deny, cancel, race, key limit, policy/role change, expiry, recent-sign-in device revocation, and one-time key')
