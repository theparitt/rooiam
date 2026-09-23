import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

// Dedicated local production-mode process, never a remote deployment.
const base = 'http://127.0.0.1:15473/v1'
const probe = async (path, method = 'GET', body) => fetch(base + path, {
  method, redirect: 'error', signal: AbortSignal.timeout(10000),
  headers: body ? { 'Content-Type': 'application/json' } : {},
  body: body ? JSON.stringify(body) : undefined,
})
assert.equal((await probe('/test/login', 'POST', {})).status, 404, 'Production must not expose test login')
const reset = spawnSync('redis-cli', ['-h', '127.0.0.1', '-p', '15479', '-n', '2', 'EVAL', "for _,k in ipairs(redis.call('KEYS','rl:*')) do redis.call('DEL',k) end return 1", '0'], { encoding: 'utf8' })
assert.equal(reset.status, 0)
assert.equal((await probe('/identity/me')).status, 401, 'Existing identity routes must still work')
for (let i = 0; i < 11; i++) {
  const r = await probe('/auth/device-login/start', 'POST', { surface: 'admin' })
  assert.equal(r.status, i < 10 ? 400 : 429, `Start attempt ${i + 1}`)
}
const path = '/auth/device-login/00000000-0000-0000-0000-000000000000/status?browser_nonce=' + 'x'.repeat(43)
for (let i = 0; i < 121; i++) {
  const r = await probe(path)
  assert.equal(r.status, i < 120 ? 404 : 429, `Status attempt ${i + 1}`)
}
console.log('PASS production-mode test-login absent; identity route reachable; start 10/min and status 120/min limits enforced.')
