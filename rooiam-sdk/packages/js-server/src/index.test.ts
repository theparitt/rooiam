import { describe, it, expect } from 'vitest'
import { RooiamServer, RooiamError } from './index.js'

// A mock fetch that records the request and returns a canned response.
function mockFetch(
  status: number,
  body: unknown,
): { fetch: typeof fetch; calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as unknown as typeof fetch
  return { fetch: fetchImpl, calls }
}

const opts = (fetch: typeof fetch) => ({
  apiBase: 'https://demo-api.rooiam.com/v1',
  apiKey: 'wsk_test_key',
  fetch,
})

describe('RooiamServer construction', () => {
  it('requires apiBase', () => {
    expect(() => new RooiamServer({ apiBase: '', apiKey: 'k' } as any)).toThrow(/apiBase/)
  })
  it('requires apiKey', () => {
    expect(() => new RooiamServer({ apiBase: 'x', apiKey: '' } as any)).toThrow(/apiKey/)
  })
  it('strips trailing slashes from apiBase', async () => {
    const { fetch, calls } = mockFetch(200, {})
    const r = new RooiamServer({ apiBase: 'https://x/v1//', apiKey: 'k', fetch })
    await r.workspace()
    expect(calls[0].url).toBe('https://x/v1/orgs/integrations/workspace')
  })
})

describe('auth + request shape', () => {
  it('sends the API key as a Bearer token', async () => {
    const { fetch, calls } = mockFetch(200, {})
    await new RooiamServer(opts(fetch)).workspace()
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer wsk_test_key')
  })

  it('builds the workspace URL', async () => {
    const { fetch, calls } = mockFetch(200, { workspace_id: 'abc' })
    const out = await new RooiamServer(opts(fetch)).workspace()
    expect(calls[0].url).toBe('https://demo-api.rooiam.com/v1/orgs/integrations/workspace')
    expect(out).toEqual({ workspace_id: 'abc' })
  })
})

describe('members', () => {
  it('list() passes query params', async () => {
    const { fetch, calls } = mockFetch(200, { items: [], total: 0 })
    await new RooiamServer(opts(fetch)).members.list({ page: 2, page_size: 50, role: 'admin' })
    const u = new URL(calls[0].url)
    expect(u.pathname).toBe('/v1/orgs/integrations/members')
    expect(u.searchParams.get('page')).toBe('2')
    expect(u.searchParams.get('page_size')).toBe('50')
    expect(u.searchParams.get('role')).toBe('admin')
  })

  it('list() omits undefined params', async () => {
    const { fetch, calls } = mockFetch(200, { items: [], total: 0 })
    await new RooiamServer(opts(fetch)).members.list({ page: 1 })
    const u = new URL(calls[0].url)
    expect(u.searchParams.has('role')).toBe(false)
    expect(u.searchParams.has('page_size')).toBe(false)
  })

  it('get() encodes the member id in the path', async () => {
    const { fetch, calls } = mockFetch(200, { id: 'm1' })
    await new RooiamServer(opts(fetch)).members.get('m 1/x')
    expect(new URL(calls[0].url).pathname).toBe('/v1/orgs/integrations/members/m%201%2Fx')
  })

  it('setRole() sends a PATCH with the role_code body', async () => {
    const { fetch, calls } = mockFetch(200, {})
    await new RooiamServer(opts(fetch)).members.setRole('m1', 'admin')
    expect(calls[0].init.method).toBe('PATCH')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ role_code: 'admin' })
    expect((calls[0].init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('revokeSessions() sends a DELETE', async () => {
    const { fetch, calls } = mockFetch(200, {})
    await new RooiamServer(opts(fetch)).members.revokeSessions('m1')
    expect(calls[0].init.method).toBe('DELETE')
    expect(new URL(calls[0].url).pathname).toBe('/v1/orgs/integrations/members/m1/sessions')
  })

  it('updateProfile() sends a PATCH with the profile body', async () => {
    const { fetch, calls } = mockFetch(200, {})
    await new RooiamServer(opts(fetch)).members.updateProfile('m1', { display_name: 'Neo' })
    expect(calls[0].init.method).toBe('PATCH')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ display_name: 'Neo' })
  })
})

describe('clients + activity', () => {
  it('clients.list() hits the clients path with filters', async () => {
    const { fetch, calls } = mockFetch(200, { items: [], total: 0 })
    await new RooiamServer(opts(fetch)).clients.list({ status: 'active', app_type: 'spa' })
    const u = new URL(calls[0].url)
    expect(u.pathname).toBe('/v1/orgs/integrations/clients')
    expect(u.searchParams.get('status')).toBe('active')
    expect(u.searchParams.get('app_type')).toBe('spa')
  })

  it('activity() hits the activity path with action filter', async () => {
    const { fetch, calls } = mockFetch(200, { items: [], total: 0 })
    await new RooiamServer(opts(fetch)).activity({ action: 'auth.login.suspicious' })
    const u = new URL(calls[0].url)
    expect(u.pathname).toBe('/v1/orgs/integrations/activity')
    expect(u.searchParams.get('action')).toBe('auth.login.suspicious')
  })
})

describe('branding + authConfig', () => {
  it('branding.get() hits the branding path', async () => {
    const { fetch, calls } = mockFetch(200, {})
    await new RooiamServer(opts(fetch)).branding.get()
    expect(new URL(calls[0].url).pathname).toBe('/v1/orgs/integrations/branding')
  })

  it('branding.update() PATCHes the branding body', async () => {
    const { fetch, calls } = mockFetch(200, {})
    await new RooiamServer(opts(fetch)).branding.update({ brand_color: '#abc' })
    expect(calls[0].init.method).toBe('PATCH')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ brand_color: '#abc' })
  })

  it('authConfig.update() PATCHes the auth-config body', async () => {
    const { fetch, calls } = mockFetch(200, {})
    await new RooiamServer(opts(fetch)).authConfig.update({ clear_google: true })
    expect(new URL(calls[0].url).pathname).toBe('/v1/orgs/integrations/auth-config')
    expect(calls[0].init.method).toBe('PATCH')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ clear_google: true })
  })
})

describe('clients write surface', () => {
  it('create() POSTs the client body', async () => {
    const { fetch, calls } = mockFetch(200, {})
    await new RooiamServer(opts(fetch)).clients.create({
      app_name: 'App',
      app_type: 'spa',
      redirect_uris: ['https://x/cb'],
    })
    expect(calls[0].init.method).toBe('POST')
    expect(JSON.parse(calls[0].init.body as string)).toMatchObject({ app_name: 'App' })
  })

  it('update() PATCHes the client path', async () => {
    const { fetch, calls } = mockFetch(200, {})
    await new RooiamServer(opts(fetch)).clients.update('c1', {
      app_name: 'App2',
      redirect_uris: ['https://x/cb'],
    })
    expect(calls[0].init.method).toBe('PATCH')
    expect(new URL(calls[0].url).pathname).toBe('/v1/orgs/integrations/clients/c1')
  })

  it('delete() DELETEs the client path', async () => {
    const { fetch, calls } = mockFetch(200, {})
    await new RooiamServer(opts(fetch)).clients.delete('c1')
    expect(calls[0].init.method).toBe('DELETE')
  })

  it('setStatus() PATCHes the status path with the status body', async () => {
    const { fetch, calls } = mockFetch(200, {})
    await new RooiamServer(opts(fetch)).clients.setStatus('c1', 'disabled')
    expect(new URL(calls[0].url).pathname).toBe('/v1/orgs/integrations/clients/c1/status')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ status: 'disabled' })
  })

  it('rotateSecret() POSTs the rotate-secret path', async () => {
    const { fetch, calls } = mockFetch(200, {})
    await new RooiamServer(opts(fetch)).clients.rotateSecret('c1')
    expect(calls[0].init.method).toBe('POST')
    expect(new URL(calls[0].url).pathname).toBe('/v1/orgs/integrations/clients/c1/rotate-secret')
  })
})

describe('invites + meta getters', () => {
  it('invites.send() POSTs the email body', async () => {
    const { fetch, calls } = mockFetch(200, {})
    await new RooiamServer(opts(fetch)).invites.send('new@x.com')
    expect(new URL(calls[0].url).pathname).toBe('/v1/orgs/integrations/invites')
    expect(calls[0].init.method).toBe('POST')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ email: 'new@x.com' })
  })

  it('invites.revoke() DELETEs the invite path', async () => {
    const { fetch, calls } = mockFetch(200, {})
    await new RooiamServer(opts(fetch)).invites.revoke('i1')
    expect(calls[0].init.method).toBe('DELETE')
    expect(new URL(calls[0].url).pathname).toBe('/v1/orgs/integrations/invites/i1')
  })

  it('meta getters hit their GET paths', async () => {
    for (const [name, expected] of [
      ['auditActions', '/v1/orgs/integrations/audit/actions'],
      ['effectivePolicy', '/v1/orgs/integrations/effective-policy'],
      ['policySummary', '/v1/orgs/integrations/policy-summary'],
      ['roles', '/v1/orgs/integrations/roles'],
      ['permissions', '/v1/orgs/integrations/permissions'],
      ['apiKeyMe', '/v1/orgs/integrations/api-keys/me'],
      ['widgetPreviewConfig', '/v1/orgs/integrations/widget-preview-config'],
    ] as const) {
      const { fetch, calls } = mockFetch(200, {})
      const r = new RooiamServer(opts(fetch))
      await (r[name] as () => Promise<unknown>)()
      expect(calls[0].init.method ?? 'GET').toBe('GET')
      expect(new URL(calls[0].url).pathname).toBe(expected)
    }
  })
})

describe('error handling', () => {
  it('throws RooiamError with status + parsed body on non-2xx', async () => {
    const { fetch } = mockFetch(403, { error: { message: 'API key lacks members.read' } })
    const r = new RooiamServer(opts(fetch))
    await expect(r.members.list()).rejects.toMatchObject({
      name: 'RooiamError',
      status: 403,
      message: 'API key lacks members.read',
    })
  })

  it('RooiamError exposes the raw body', async () => {
    const { fetch } = mockFetch(400, { error: { message: 'bad' }, detail: 'x' })
    try {
      await new RooiamServer(opts(fetch)).members.setRole('m1', 'nope')
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(RooiamError)
      expect((e as RooiamError).body).toEqual({ error: { message: 'bad' }, detail: 'x' })
    }
  })
})

// ---------------------------------------------------------------------------
// LIVE integration test — the "stability bar". Skipped unless a real server +
// API key are provided via env. Run with:
//   ROOIAM_TEST_API_BASE=http://localhost:5180/v1 \
//   ROOIAM_TEST_API_KEY=wsk_xxx \
//   npm test
// ---------------------------------------------------------------------------
const liveBase = process.env.ROOIAM_TEST_API_BASE
const liveKey = process.env.ROOIAM_TEST_API_KEY
const live = liveBase && liveKey ? describe : describe.skip

live('LIVE integration (real rooiam-server)', () => {
  const r = () => new RooiamServer({ apiBase: liveBase!, apiKey: liveKey! })

  it('workspace() returns this workspace', async () => {
    const ws = await r().workspace()
    expect(ws).toHaveProperty('workspace_id')
  })

  it('members.list() returns a paginated result', async () => {
    const out: any = await r().members.list({ page: 1, page_size: 5 })
    expect(out).toHaveProperty('items')
    expect(Array.isArray(out.items)).toBe(true)
  })

  it('activity() returns the audit log', async () => {
    const out: any = await r().activity({ page: 1, page_size: 5 })
    expect(out).toHaveProperty('items')
  })

  it('read-only meta endpoints all return 200', async () => {
    const c = r()
    await Promise.all([
      c.branding.get(),
      c.authConfig.get(),
      c.clients.list(),
      c.invites.list({ page: 1, page_size: 5 }),
      c.auditActions(),
      c.effectivePolicy(),
      c.policySummary(),
      c.roles(),
      c.permissions(),
      c.apiKeyMe(),
      c.widgetPreviewConfig(),
    ])
    // No throw == every endpoint returned 2xx.
    expect(true).toBe(true)
  })

  it('rejects a bad API key with a 4xx RooiamError', async () => {
    // The server treats an invalid/missing key as a validation error (400),
    // not 401 — it returns AppError::Validation("Invalid, revoked, or expired
    // API key."). Assert the SDK surfaces it as a RooiamError with a 4xx status.
    const bad = new RooiamServer({ apiBase: liveBase!, apiKey: 'rooiam_definitely_invalid' })
    await expect(bad.workspace()).rejects.toMatchObject({ name: 'RooiamError' })
    await bad.workspace().catch((e) => {
      expect(e.status).toBeGreaterThanOrEqual(400)
      expect(e.status).toBeLessThan(500)
    })
  })
})
