import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { generateIdentity, approval } from '../rooiam-examples/device-login/fake-phone.mjs'

// Run against the isolated test API and Vite frontend from device-login.md.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const origin = 'http://127.0.0.1:15470'
const api = async (path, body, cookie) => {
  const r = await fetch(origin + '/v1' + path, { method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, body: body ? JSON.stringify(body) : undefined })
  assert.equal(r.status, 200)
  return { body: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0] }
}
const phone = await api('/test/login', { email: `browser-${randomUUID().slice(0,8)}@device.test` })
const user = (await api('/identity/me', null, phone.cookie)).body
const identity = generateIdentity(origin)
await api('/identity/me/devices', { device_label: 'Browser regression', platform: 'android', device_token: identity.device_token, device_public_key: identity.device_public_key }, phone.cookie)
const reset = spawnSync('redis-cli', ['-h', '127.0.0.1', '-p', '15479', 'EVAL', "for _,k in ipairs(redis.call('KEYS','rl:*')) do redis.call('DEL',k) end return 1", '0'])
assert.equal(reset.status, 0)
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {}) })
try {
  const context = await browser.newContext()
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  const start = async () => {
    await page.goto('http://127.0.0.1:15472/')
    await page.getByRole('button', { name: 'Sign in with your phone', exact: true }).click()
    const response = page.waitForResponse(r => r.url().endsWith('/auth/device-login/start'))
    await page.getByRole('button', { name: 'Show QR code' }).click()
    const r = await response; assert.equal(r.status(), 200)
    const intent = await r.json()
    await page.getByRole('img', { name: 'Scan this sign-in request with Rooiam Android' }).waitFor()
    assert.ok(await page.getByText(intent.display_code, { exact: true }).isVisible())
    return intent
  }
  await start()
  await page.getByRole('button', { name: 'Cancel sign-in' }).click()
  await page.getByText('Sign-in cancelled.', { exact: true }).waitFor()
  let intent = await start()
  await api('/identity/device-login/reject', { public_id: intent.public_id, device_token: identity.device_token }, phone.cookie)
  await page.getByText('Your phone denied this request.', { exact: true }).waitFor()
  intent = await start()
  const preview = (await api('/identity/device-login/intents/' + intent.public_id, null, phone.cookie)).body
  await api('/identity/device-login/approve', approval(identity, preview, preview.match_number), phone.cookie)
  await page.waitForURL(url => url.pathname !== '/', { timeout: 20000 })
  const me = await context.request.get(origin + '/v1/identity/me')
  assert.equal(me.status(), 200); assert.equal((await me.json()).id, user.id)
  assert.deepEqual(errors, [])
  console.log('PASS Chromium hosted QR render, cancel, denial, real signed approval, browser completion and exact session identity.')
} finally { await browser.close() }
