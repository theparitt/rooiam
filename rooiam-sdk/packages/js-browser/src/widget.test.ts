import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildHostedLoginUrl } from './index.js'

const contract = JSON.parse(readFileSync(new URL('../../../spec/widget-contract.json', import.meta.url), 'utf8'))
describe('hosted widget server contract', () => {
  for (const fixture of contract) {
    it(`generates the server-validated query ${fixture.query}`, () => {
      const url = new URL(buildHostedLoginUrl(fixture.options))
      expect(url.pathname).toBe('/login-widget')
      expect(url.search.slice(1)).toBe(fixture.query)
    })
  }
  it('ignores unsupported runtime options and strips base URL queries', () => {
    const options = { apiOrigin: 'https://iam.test/v1?return_to=bad', workspaceId: 'ws', clientId: 'client', app: 'bad', return_to: 'https://evil.test' }
    expect(buildHostedLoginUrl(options)).toBe('https://iam.test/login-widget?workspace_id=ws&client_id=client')
  })
  it('requires an app for a real embed', () => {
    expect(() => buildHostedLoginUrl({ apiOrigin: 'https://iam.test', workspaceId: 'ws', clientId: ' ' })).toThrow('clientId')
    expect(buildHostedLoginUrl({ apiOrigin: 'https://iam.test', workspaceId: 'ws', preview: true })).toContain('preview=1')
  })
})
