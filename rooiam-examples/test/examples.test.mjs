import test, { before, after } from 'node:test'
import { createServer } from 'node:http'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { escapeHtml, scriptJson, buildHostedWidgetUrl, parseCookies } from '../shared/example-helpers.mjs'

let upstream, upstreamBase
before(async () => {
  upstream = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json')
    if (req.url.endsWith('/clients')) {
      res.statusCode = 403
      res.end(JSON.stringify({ error: { message: 'Insufficient permission' } }))
    } else {
      res.end(JSON.stringify({ path: req.url, authorization: req.headers.authorization }))
    }
  })
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))
  upstreamBase = `http://127.0.0.1:${upstream.address().port}/v1`
})
after(async () => { await new Promise(resolve => upstream.close(resolve)) })

test('shared helpers safely encode HTML, inline JSON, malformed cookies, and workspace slug', () => {
  const payload = '</script><img src=x onerror="alert(1)">'
  assert.equal(escapeHtml(payload).includes('<'), false)
  assert.equal(scriptJson(payload).includes('<'), false)
  assert.equal(JSON.parse(scriptJson(payload)), payload)
  assert.equal(parseCookies('bad=%ZZ; good=hello%20world').good, 'hello world')
  assert.equal(new URL(buildHostedWidgetUrl({ workspace_slug: 'tenant', client_id: 'client' })).searchParams.get('workspace'), 'tenant')
})

for (const name of ['example-1-widget', 'example-2-account', 'example-3-backend']) {
  test(`${name} serves safe HTML and valid browser scripts`, async t => {
    const child = spawn(process.execPath, ['server.mjs'], {
      cwd: fileURLToPath(new URL(`../${name}/`, import.meta.url)),
      env: { ...process.env, PORT: '0', ROOIAM_API_BASE: upstreamBase, ROOIAM_API_KEY: '', EXAMPLE_APP_NAME: '<img src=x onerror=alert(1)>', EXAMPLE_WIDGET_BASE_URL: 'https://login.example/login-widget' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    // The server reports its actual bound port for ephemeral test listeners.
    t.after(async () => { child.kill(); if (child.exitCode === null) await once(child, 'exit') })
    const base = await new Promise((resolve, reject) => {
      let output = ''
      child.stdout.on('data', chunk => {
        output += chunk
        const match = output.match(/running on http:\/\/localhost:(\d+)/)
        if (match) resolve(`http://127.0.0.1:${match[1]}`)
      })
      child.once('exit', code => reject(new Error(`Example exited: ${code}`)))
      child.once('error', reject)
    })
    if (name === 'example-3-backend') {
      const headers = { 'x-example-api-key': 'test-key' }
      const forbidden = await fetch(base + '/api/rooiam/clients', { headers })
      assert.equal(forbidden.status, 403)
      assert.equal((await forbidden.json()).error.message, 'Insufficient permission')
      const branding = await fetch(base + '/api/rooiam/branding', { headers })
      assert.equal(branding.status, 200)
      const result = await branding.json()
      assert.equal(result.data.authorization, 'Bearer test-key')
      assert.equal(result.data.path, '/v1/orgs/integrations/branding')
    }
    const paths = name === 'example-3-backend' ? ['/'] : ['/', '/callback?error=bad&error_description=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E', ...(name === 'example-2-account' ? ['/dashboard'] : [])]
    for (const path of paths) {
      const response = await fetch(base + path)
      const html = await response.text()
      assert.equal(html.includes('<img src=x onerror=alert(1)>'), false)
      if (path.startsWith('/callback')) assert.ok(html.includes('&lt;img'))
      if (path === '/dashboard') {
        const context = vm.createContext({})
        const start = html.indexOf('const escapeHtml =')
        const end = html.indexOf('function renderProfile()', start)
        vm.runInContext(html.slice(start, end), context)
        const attack = '<img src=x onerror=alert(1)>'
        const sessionCard = context.sessionCard({ user_agent: attack, id: attack, login_app_name: attack }, false)
        const auditCard = context.auditCard({ action: attack, target_type: attack })
        assert.ok(sessionCard.includes('&lt;img'))
        assert.equal(sessionCard.includes(attack), false)
        assert.equal(auditCard.includes(attack), false)
        context.passkeyList = { querySelectorAll: () => [] }
        context.passkeyEmpty = { style: {} }
        const renderStart = html.indexOf('function renderPasskeys(')
        const renderEnd = html.indexOf('function renderMfaStatus()', renderStart)
        vm.runInContext(html.slice(renderStart, renderEnd), context)
        context.renderPasskeys([{ name: attack, id: attack }])
        assert.equal(context.passkeyList.innerHTML.includes(attack), false)
        assert.ok(context.passkeyList.innerHTML.includes('&lt;img'))
      }
      for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
        new vm.Script(match[1])
        if (path === '/' && name !== 'example-3-backend') {
          let listener
          const frame = { src: 'https://login.example/login-widget', contentWindow: {}, style: {} }
          vm.runInNewContext(match[1], { URL, document: { getElementById: () => frame }, window: { addEventListener: (_type, handler) => { listener = handler } } })
          const data = { type: 'rooiam-login-widget:size', height: 500, width: 400 }
          listener({ source: {}, origin: 'https://login.example', data })
          assert.equal(frame.style.height, undefined)
          listener({ source: frame.contentWindow, origin: 'https://evil.example', data })
          assert.equal(frame.style.height, undefined)
          listener({ source: frame.contentWindow, origin: 'https://login.example', data })
          assert.equal(frame.style.height, '500px')
        }
      }
    }
  })
}
