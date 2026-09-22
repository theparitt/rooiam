import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const source = readFileSync(new URL('../src/lib/widget-message.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } })
const { isTrustedWidgetMessage, getWidgetNavigationUrl } = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'))

test('only the configured iframe can send widget messages', () => {
  const source = {}
  const frame = { contentWindow: source, src: 'https://auth.example/login-widget' }
  assert.equal(isTrustedWidgetMessage({ source, origin: 'https://auth.example' }, frame), true)
  assert.equal(isTrustedWidgetMessage({ source: {}, origin: 'https://auth.example' }, frame), false)
  assert.equal(isTrustedWidgetMessage({ source, origin: 'https://evil.example' }, frame), false)
  assert.equal(isTrustedWidgetMessage({ source, origin: 'null' }, null), false)
})
test('widget navigation permits auth-server redirects but rejects script and external URLs', () => {
  const base = 'https://auth.example/login-widget'
  assert.equal(getWidgetNavigationUrl('/v1/oauth/login?provider=google', base), 'https://auth.example/v1/oauth/login?provider=google')
  for (const value of ['javascript:alert(1)', 'data:text/html,hello', '//evil.example/login', 'https://auth.example.evil.test', 'http://auth.example/login']) {
    assert.equal(getWidgetNavigationUrl(value, base), null)
  }
})
