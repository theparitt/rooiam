import { describe, it, expect } from 'vitest'
import {
  RooiamBrowser,
  RooiamError,
  generateCodeVerifier,
  deriveCodeChallenge,
  createPkcePair,
} from './index.js'

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

const opts = (fetch: typeof fetch) => ({ apiBase: 'https://auth.example.com/v1', fetch })

describe('RooiamBrowser construction', () => {
  it('requires apiBase', () => {
    expect(() => new RooiamBrowser({ apiBase: '' } as never)).toThrow(/apiBase/)
  })
  it('strips trailing slashes from apiBase', async () => {
    const { fetch, calls } = mockFetch(200, {})
    await new RooiamBrowser({ apiBase: 'https://x/v1//', fetch }).me()
    expect(calls[0].url).toBe('https://x/v1/identity/me')
  })
})

describe('always sends credentials (cookie auth), never a secret', () => {
  it('includes credentials on every request', async () => {
    const { fetch, calls } = mockFetch(200, {})
    await new RooiamBrowser(opts(fetch)).me()
    expect((calls[0].init as RequestInit).credentials).toBe('include')
  })
  it('never sets an Authorization header', async () => {
    const { fetch, calls } = mockFetch(200, {})
    await new RooiamBrowser(opts(fetch)).startLogin({ email: 'a@b.com' })
    const headers = (calls[0].init.headers ?? {}) as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })
})

describe('public login flow', () => {
  it('authMethods() passes the workspace lookup query', async () => {
    const { fetch, calls } = mockFetch(200, {})
    await new RooiamBrowser(opts(fetch)).authMethods({ workspace_id: 'ws1' })
    const u = new URL(calls[0].url)
    expect(u.pathname).toBe('/v1/setup/auth-methods')
    expect(u.searchParams.get('workspace_id')).toBe('ws1')
  })

  it('loginBootstrap() hits the bootstrap path with slug lookup', async () => {
    const { fetch, calls } = mockFetch(200, {})
    await new RooiamBrowser(opts(fetch)).loginBootstrap({ org: 'roochoco' })
    const u = new URL(calls[0].url)
    expect(u.pathname).toBe('/v1/setup/login-bootstrap')
    expect(u.searchParams.get('org')).toBe('roochoco')
  })

  it('startLogin() POSTs the email body', async () => {
    const { fetch, calls } = mockFetch(200, {})
    await new RooiamBrowser(opts(fetch)).startLogin({ email: 'a@b.com', redirect_uri: '/app' })
    expect(new URL(calls[0].url).pathname).toBe('/v1/auth/magic-link/start')
    expect(calls[0].init.method).toBe('POST')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      email: 'a@b.com',
      redirect_uri: '/app',
    })
  })

  it('verifyLogin() POSTs the token body', async () => {
    const { fetch, calls } = mockFetch(200, {})
    await new RooiamBrowser(opts(fetch)).verifyLogin('tok123')
    expect(new URL(calls[0].url).pathname).toBe('/v1/auth/magic-link/verify')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ token: 'tok123' })
  })
})

describe('session self-service', () => {
  it('me() GETs /identity/me', async () => {
    const { fetch, calls } = mockFetch(200, { id: 'u1' })
    const out = await new RooiamBrowser(opts(fetch)).me()
    expect(new URL(calls[0].url).pathname).toBe('/v1/identity/me')
    expect(out).toEqual({ id: 'u1' })
  })

  it('updateProfile() PATCHes /identity/me/profile', async () => {
    const { fetch, calls } = mockFetch(200, {})
    await new RooiamBrowser(opts(fetch)).updateProfile({ display_name: 'Neo' })
    expect(new URL(calls[0].url).pathname).toBe('/v1/identity/me/profile')
    expect(calls[0].init.method).toBe('PATCH')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ display_name: 'Neo' })
  })

  it('logout() POSTs /auth/logout', async () => {
    const { fetch, calls } = mockFetch(200, {})
    await new RooiamBrowser(opts(fetch)).logout()
    expect(new URL(calls[0].url).pathname).toBe('/v1/auth/logout')
    expect(calls[0].init.method).toBe('POST')
  })
})

describe('pre-session login flows', () => {
  it('passkeyStart() POSTs the email to webauthn login/start', async () => {
    const { fetch, calls } = mockFetch(200, {})
    await new RooiamBrowser(opts(fetch)).login.passkeyStart({ email: 'a@b.com' })
    expect(new URL(calls[0].url).pathname).toBe('/v1/webauthn/login/start')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ email: 'a@b.com' })
  })

  it('passkeyFinish() POSTs challenge_id + credential', async () => {
    const { fetch, calls } = mockFetch(200, {})
    await new RooiamBrowser(opts(fetch)).login.passkeyFinish({
      challenge_id: 'ch1',
      credential: { id: 'x' },
    })
    expect(new URL(calls[0].url).pathname).toBe('/v1/webauthn/login/finish')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      challenge_id: 'ch1',
      credential: { id: 'x' },
    })
  })

  it('mfaVerify() POSTs challenge_id + code to mfa/login/verify', async () => {
    const { fetch, calls } = mockFetch(200, {})
    await new RooiamBrowser(opts(fetch)).login.mfaVerify('ch1', '123456')
    expect(new URL(calls[0].url).pathname).toBe('/v1/mfa/login/verify')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      challenge_id: 'ch1',
      code: '123456',
    })
  })

  it('mfaEnrollStart/Finish hit the enroll paths', async () => {
    const a = mockFetch(200, {})
    await new RooiamBrowser(opts(a.fetch)).login.mfaEnrollStart('ch1')
    expect(new URL(a.calls[0].url).pathname).toBe('/v1/mfa/login/enroll/start')
    const b = mockFetch(200, {})
    await new RooiamBrowser(opts(b.fetch)).login.mfaEnrollFinish('ch1', '000000')
    expect(new URL(b.calls[0].url).pathname).toBe('/v1/mfa/login/enroll/finish')
  })

  it('reportFailure() POSTs stage + reason', async () => {
    const { fetch, calls } = mockFetch(200, {})
    await new RooiamBrowser(opts(fetch)).login.reportFailure({ stage: 'assert', reason: 'cancelled' })
    expect(new URL(calls[0].url).pathname).toBe('/v1/webauthn/login/report-failure')
  })
})

describe('avatar upload (multipart)', () => {
  it('wraps a Blob in FormData and does NOT force JSON content-type', async () => {
    const { fetch, calls } = mockFetch(200, { url: '/a.png', user: {} })
    const blob = new Blob(['x'], { type: 'image/png' })
    await new RooiamBrowser(opts(fetch)).account.uploadAvatar(blob)
    expect(new URL(calls[0].url).pathname).toBe('/v1/identity/me/avatar/upload')
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].init.body).toBeInstanceOf(FormData)
    const headers = (calls[0].init.headers ?? {}) as Record<string, string>
    expect(headers['Content-Type']).toBeUndefined()
  })

  it('passes a caller-supplied FormData through unchanged', async () => {
    const { fetch, calls } = mockFetch(200, {})
    const fd = new FormData()
    fd.append('file', new Blob(['y']), 'me.png')
    await new RooiamBrowser(opts(fetch)).account.uploadAvatar(fd)
    expect(calls[0].init.body).toBe(fd)
  })
})

describe('oidc extras', () => {
  it('revoke() + introspect() send form-encoded bodies', async () => {
    const a = mockFetch(200, {})
    await new RooiamBrowser(opts(a.fetch)).oidc.revoke({ token: 't', clientId: 'c' })
    expect(new URL(a.calls[0].url).pathname).toBe('/v1/oidc/revoke')
    expect((a.calls[0].init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    )
    expect(new URLSearchParams(a.calls[0].init.body as string).get('token')).toBe('t')

    const b = mockFetch(200, { active: true })
    await new RooiamBrowser(opts(b.fetch)).oidc.introspect({ token: 't', clientId: 'c' })
    expect(new URL(b.calls[0].url).pathname).toBe('/v1/oidc/introspect')
  })

  it('endSessionUrl() builds an RP-initiated logout URL', () => {
    const r = new RooiamBrowser({ apiBase: 'https://auth.example.com/v1' })
    const url = new URL(
      r.oidc.endSessionUrl({ idTokenHint: 'idt', postLogoutRedirectUri: 'https://app/bye' }),
    )
    expect(url.pathname).toBe('/v1/oidc/end-session')
    expect(url.searchParams.get('id_token_hint')).toBe('idt')
    expect(url.searchParams.get('post_logout_redirect_uri')).toBe('https://app/bye')
  })
})

describe('sessions', () => {
  it('list/revoke/revokeAll hit the right paths + methods', async () => {
    const a = mockFetch(200, {})
    await new RooiamBrowser(opts(a.fetch)).sessions.list()
    expect(new URL(a.calls[0].url).pathname).toBe('/v1/identity/me/sessions')

    const b = mockFetch(200, {})
    await new RooiamBrowser(opts(b.fetch)).sessions.revoke('s1')
    expect(b.calls[0].init.method).toBe('DELETE')
    expect(new URL(b.calls[0].url).pathname).toBe('/v1/identity/me/sessions/s1')

    const c = mockFetch(200, {})
    await new RooiamBrowser(opts(c.fetch)).sessions.revokeAll()
    expect(c.calls[0].init.method).toBe('POST')
    expect(new URL(c.calls[0].url).pathname).toBe('/v1/identity/me/sessions/revoke-all')
  })
})

describe('account self-service', () => {
  it('startLink() POSTs the redirect_uri when given', async () => {
    const { fetch, calls } = mockFetch(200, {})
    await new RooiamBrowser(opts(fetch)).account.startLink('google', '/back')
    expect(new URL(calls[0].url).pathname).toBe(
      '/v1/identity/me/linked-accounts/google/start',
    )
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ redirect_uri: '/back' })
  })

  it('unlink() DELETEs the provider path', async () => {
    const { fetch, calls } = mockFetch(200, {})
    await new RooiamBrowser(opts(fetch)).account.unlink('microsoft')
    expect(calls[0].init.method).toBe('DELETE')
    expect(new URL(calls[0].url).pathname).toBe('/v1/identity/me/linked-accounts/microsoft')
  })

  it('auditLogs() passes pagination params', async () => {
    const { fetch, calls } = mockFetch(200, { items: [], total: 0 })
    await new RooiamBrowser(opts(fetch)).account.auditLogs({ page: 2, page_size: 10 })
    const u = new URL(calls[0].url)
    expect(u.pathname).toBe('/v1/identity/me/audit-logs')
    expect(u.searchParams.get('page')).toBe('2')
    expect(u.searchParams.get('page_size')).toBe('10')
  })

  it('requestEmailChange() POSTs new_email', async () => {
    const { fetch, calls } = mockFetch(200, {})
    await new RooiamBrowser(opts(fetch)).account.requestEmailChange('new@x.com')
    expect(new URL(calls[0].url).pathname).toBe('/v1/identity/me/email-change/request')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ new_email: 'new@x.com' })
  })

  it('confirmDelete() DELETEs with the token', async () => {
    const { fetch, calls } = mockFetch(200, {})
    await new RooiamBrowser(opts(fetch)).account.confirmDelete('tok')
    expect(calls[0].init.method).toBe('DELETE')
    expect(new URL(calls[0].url).pathname).toBe('/v1/identity/me/delete/confirm')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ token: 'tok' })
  })
})

describe('passkeys', () => {
  it('registerStart() POSTs the start path', async () => {
    const { fetch, calls } = mockFetch(200, {})
    await new RooiamBrowser(opts(fetch)).passkeys.registerStart()
    expect(calls[0].init.method).toBe('POST')
    expect(new URL(calls[0].url).pathname).toBe('/v1/webauthn/register/start')
  })

  it('registerFinish() POSTs challenge_id + credential', async () => {
    const { fetch, calls } = mockFetch(200, {})
    await new RooiamBrowser(opts(fetch)).passkeys.registerFinish({
      challenge_id: 'ch1',
      credential: { id: 'x' },
      name: 'Yubikey',
    })
    expect(new URL(calls[0].url).pathname).toBe('/v1/webauthn/register/finish')
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      challenge_id: 'ch1',
      credential: { id: 'x' },
      name: 'Yubikey',
    })
  })

  it('rename() PATCHes; delete() DELETEs', async () => {
    const a = mockFetch(200, {})
    await new RooiamBrowser(opts(a.fetch)).passkeys.rename('p1', 'Phone')
    expect(a.calls[0].init.method).toBe('PATCH')
    expect(JSON.parse(a.calls[0].init.body as string)).toEqual({ name: 'Phone' })

    const b = mockFetch(200, {})
    await new RooiamBrowser(opts(b.fetch)).passkeys.delete('p1')
    expect(b.calls[0].init.method).toBe('DELETE')
    expect(new URL(b.calls[0].url).pathname).toBe('/v1/webauthn/passkeys/p1')
  })
})

describe('mfa', () => {
  it('totpStart() POSTs; totpFinish() sends challenge_id + code', async () => {
    const a = mockFetch(200, {})
    await new RooiamBrowser(opts(a.fetch)).mfa.totpStart()
    expect(a.calls[0].init.method).toBe('POST')
    expect(new URL(a.calls[0].url).pathname).toBe('/v1/mfa/totp/start')

    const b = mockFetch(200, {})
    await new RooiamBrowser(opts(b.fetch)).mfa.totpFinish('ch1', '123456')
    expect(new URL(b.calls[0].url).pathname).toBe('/v1/mfa/totp/finish')
    expect(JSON.parse(b.calls[0].init.body as string)).toEqual({
      challenge_id: 'ch1',
      code: '123456',
    })
  })

  it('disableTotp() DELETEs /mfa/totp', async () => {
    const { fetch, calls } = mockFetch(200, {})
    await new RooiamBrowser(opts(fetch)).mfa.disableTotp()
    expect(calls[0].init.method).toBe('DELETE')
    expect(new URL(calls[0].url).pathname).toBe('/v1/mfa/totp')
  })
})

describe('PKCE helpers', () => {
  it('generateCodeVerifier() is URL-safe and 43+ chars', () => {
    const v = generateCodeVerifier()
    expect(v.length).toBeGreaterThanOrEqual(43)
    expect(v).toMatch(/^[A-Za-z0-9\-_]+$/)
  })

  it('deriveCodeChallenge() is deterministic S256 of the verifier', async () => {
    // Known RFC 7636 Appendix B test vector.
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    const challenge = await deriveCodeChallenge(verifier)
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('createPkcePair() returns a verifier + matching challenge', async () => {
    const { verifier, challenge } = await createPkcePair()
    expect(await deriveCodeChallenge(verifier)).toBe(challenge)
  })
})

describe('OIDC client flow', () => {
  it('authorizeUrl() builds a PKCE S256 authorize URL', () => {
    const r = new RooiamBrowser({ apiBase: 'https://auth.example.com/v1' })
    const url = new URL(
      r.oidc.authorizeUrl({
        clientId: 'app1',
        redirectUri: 'https://app/cb',
        codeChallenge: 'CHAL',
        state: 'xyz',
      }),
    )
    expect(url.pathname).toBe('/v1/oidc/authorize')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('app1')
    expect(url.searchParams.get('redirect_uri')).toBe('https://app/cb')
    expect(url.searchParams.get('code_challenge')).toBe('CHAL')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('scope')).toBe('openid profile email')
    expect(url.searchParams.get('state')).toBe('xyz')
  })

  it('exchangeCode() POSTs form-encoded with the PKCE verifier', async () => {
    const { fetch, calls } = mockFetch(200, { access_token: 'at', id_token: 'it' })
    const out = await new RooiamBrowser(opts(fetch)).oidc.exchangeCode({
      clientId: 'app1',
      code: 'auth_code',
      redirectUri: 'https://app/cb',
      codeVerifier: 'VERIFIER',
    })
    expect(new URL(calls[0].url).pathname).toBe('/v1/oidc/token')
    expect(calls[0].init.method).toBe('POST')
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    const form = new URLSearchParams(calls[0].init.body as string)
    expect(form.get('grant_type')).toBe('authorization_code')
    expect(form.get('code')).toBe('auth_code')
    expect(form.get('code_verifier')).toBe('VERIFIER')
    expect(form.get('client_id')).toBe('app1')
    // public client — no secret is ever sent
    expect(form.get('client_secret')).toBeNull()
    expect(out).toEqual({ access_token: 'at', id_token: 'it' })
  })

  it('userinfo() sends the access token as a Bearer header', async () => {
    const { fetch, calls } = mockFetch(200, { sub: 'u1' })
    await new RooiamBrowser(opts(fetch)).oidc.userinfo('the_access_token')
    expect(new URL(calls[0].url).pathname).toBe('/v1/oidc/userinfo')
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(
      'Bearer the_access_token',
    )
  })

  it('discovery() + jwks() hit the ORIGIN well-known paths (no /v1)', async () => {
    const a = mockFetch(200, {})
    await new RooiamBrowser(opts(a.fetch)).oidc.discovery()
    expect(new URL(a.calls[0].url).pathname).toBe('/.well-known/openid-configuration')
    const b = mockFetch(200, {})
    await new RooiamBrowser(opts(b.fetch)).oidc.jwks()
    expect(new URL(b.calls[0].url).pathname).toBe('/.well-known/jwks.json')
  })
})

describe('error handling', () => {
  it('me() throws RooiamError(401) when not signed in', async () => {
    const { fetch } = mockFetch(401, { error: { message: 'Not authenticated' } })
    const r = new RooiamBrowser(opts(fetch))
    await expect(r.me()).rejects.toMatchObject({
      name: 'RooiamError',
      status: 401,
      message: 'Not authenticated',
    })
  })

  it('RooiamError exposes the raw body', async () => {
    const { fetch } = mockFetch(400, { error: { message: 'bad token' } })
    try {
      await new RooiamBrowser(opts(fetch)).verifyLogin('nope')
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(RooiamError)
      expect((e as RooiamError).body).toEqual({ error: { message: 'bad token' } })
    }
  })
})

// ---------------------------------------------------------------------------
// LIVE integration — the stability bar. Skipped unless a real server is given.
// Only the PUBLIC endpoints are exercised (no session needed); session calls
// would require a logged-in cookie which a headless test can't easily mint.
//   ROOIAM_TEST_API_BASE=http://localhost:5180/v1 \
//   ROOIAM_TEST_WORKSPACE_SLUG=roochoco npm test
// ---------------------------------------------------------------------------
const liveBase = process.env.ROOIAM_TEST_API_BASE
const liveSlug = process.env.ROOIAM_TEST_WORKSPACE_SLUG
const live = liveBase ? describe : describe.skip

live('LIVE integration (real rooiam-server, public endpoints)', () => {
  const r = () => new RooiamBrowser({ apiBase: liveBase! })

  it('authMethods() returns enabled login methods', async () => {
    const out = await r().authMethods(liveSlug ? { org: liveSlug } : {})
    expect(out).toBeTypeOf('object')
  })

  it('loginBootstrap() returns widget config', async () => {
    const out = await r().loginBootstrap(liveSlug ? { org: liveSlug } : {})
    expect(out).toBeTypeOf('object')
  })

  it('me() returns 401 with no session cookie', async () => {
    await expect(r().me()).rejects.toMatchObject({ status: 401 })
  })

  it('oidc.discovery() returns the issuer metadata', async () => {
    const doc: any = await r().oidc.discovery()
    expect(doc).toHaveProperty('issuer')
    expect(doc).toHaveProperty('authorization_endpoint')
    expect(doc).toHaveProperty('token_endpoint')
  })

  it('oidc.jwks() returns a key set', async () => {
    const jwks: any = await r().oidc.jwks()
    expect(jwks).toHaveProperty('keys')
    expect(Array.isArray(jwks.keys)).toBe(true)
  })

  it('pre-session login endpoints parse input + reject cleanly (4xx, not 5xx)', async () => {
    const c = r()
    const results = await Promise.allSettled([
      c.login.passkeyStart({ email: 'nobody@example.invalid' }),
      c.login.passkeyFinish({ challenge_id: '00000000-0000-0000-0000-000000000000', credential: {} }),
      c.login.mfaVerify('00000000-0000-0000-0000-000000000000', '000000'),
    ])
    for (const res of results) {
      // Either a 2xx (unlikely with bogus input) or a clean 4xx RooiamError —
      // never a 5xx / unparsed body. Proves the route + body shape are wired.
      if (res.status === 'rejected') {
        expect(res.reason.status).toBeGreaterThanOrEqual(400)
        expect(res.reason.status).toBeLessThan(500)
      }
    }
  })

  it('security self-service endpoints all require a session (401 without a cookie)', async () => {
    const c = r()
    const results = await Promise.allSettled([
      c.sessions.list(),
      c.account.linkedAccounts(),
      c.account.auditLogs(),
      c.passkeys.list(),
      c.mfa.status(),
    ])
    for (const res of results) {
      expect(res.status).toBe('rejected')
      if (res.status === 'rejected') expect(res.reason.status).toBe(401)
    }
  })
})
