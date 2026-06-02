// @rooiam/sdk-browser — browser-side TypeScript SDK for Rooiam.
//
// Scope: the PUBLIC login flow (auth-methods, login-bootstrap, magic-link) and
// the SESSION-COOKIE self-service surface (who-am-I, profile, logout). It carries
// NO secrets — auth is the opaque session cookie the browser sends automatically
// (every request uses `credentials: 'include'`). Never put an API key here; that's
// what @rooiam/sdk-server is for.
//
// Wire types in ./generated/schema.ts are generated from the server's OpenAPI spec
// (rooiam-sdk/spec/openapi.json), so request/response shapes cannot drift.

import type { paths } from './generated/schema.js'

export interface RooiamBrowserOptions {
  /** Rooiam API base, INCLUDING the /v1 segment. e.g. https://auth.example.com/v1 */
  apiBase: string
  /** Optional fetch override (for tests / SSR). */
  fetch?: typeof fetch
}

/** Error thrown for any non-2xx response, carrying the HTTP status + parsed body. */
export class RooiamError extends Error {
  readonly status: number
  readonly body: unknown
  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = 'RooiamError'
    this.status = status
    this.body = body
  }
}

type Query = Record<string, string | number | boolean | undefined | null>

// ---- pull response types out of the generated paths map ----
type Ok200<T> = T extends { responses: { 200: { content: { 'application/json': infer B } } } }
  ? B
  : unknown
type GetOp<P extends keyof paths> = paths[P] extends { get: infer O } ? O : never
type GetResp<P extends keyof paths> = Ok200<GetOp<P>>

/** Query params for the public login-bootstrap / auth-methods endpoints. */
export interface WorkspaceLookupQuery {
  /** Workspace UUID (preferred — system identity). */
  workspace_id?: string
  /** Workspace slug (display lookup). */
  org?: string
  workspace?: string
  client_id?: string
  widget_embed_origin?: string
}

export interface StartLoginInput {
  email: string
  redirect_uri?: string
  widget_login_context?: string
  widget_embed_origin?: string
  surface?: string
}

export interface ProfileUpdate {
  display_name?: string | null
  avatar_url?: string | null
}

// ---------------------------------------------------------------------------
// PKCE helpers (RFC 7636). Use the Web Crypto API; works in browsers and in any
// runtime that exposes `globalThis.crypto.subtle` (modern Node, Deno, workers).
// ---------------------------------------------------------------------------

function base64UrlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let str = ''
  for (const b of arr) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** A random, URL-safe PKCE `code_verifier` (RFC 7636 §4.1, 43–128 chars). */
export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32)
  globalThis.crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes)
}

/** The S256 `code_challenge` for a given verifier. */
export async function deriveCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data)
  return base64UrlEncode(digest)
}

/** A `verifier` + its S256 `challenge`, ready for an authorize request. */
export async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = generateCodeVerifier()
  const challenge = await deriveCodeChallenge(verifier)
  return { verifier, challenge }
}

export interface AuthorizeUrlInput {
  clientId: string
  redirectUri: string
  /** S256 PKCE challenge from {@link createPkcePair}. */
  codeChallenge: string
  scope?: string
  state?: string
  nonce?: string
}

export interface TokenExchangeInput {
  clientId: string
  code: string
  redirectUri: string
  /** The PKCE `code_verifier` paired with the challenge used at authorize time. */
  codeVerifier: string
}

export class RooiamBrowser {
  private readonly apiBase: string
  private readonly fetchImpl: typeof fetch

  /** Origin of {@link apiBase} (no /v1) — where root-level `/.well-known/*` lives. */
  private readonly origin: string

  constructor(opts: RooiamBrowserOptions) {
    if (!opts.apiBase) throw new Error('RooiamBrowser: apiBase is required (include /v1)')
    this.apiBase = opts.apiBase.replace(/\/+$/, '')
    this.origin = new URL(this.apiBase).origin
    this.fetchImpl = opts.fetch ?? globalThis.fetch
    if (!this.fetchImpl) throw new Error('RooiamBrowser: no fetch available; pass opts.fetch')
  }

  private async request<T>(
    path: string,
    init?: RequestInit & { query?: Query; base?: string },
  ): Promise<T> {
    const { query, base, headers, ...rest } = init ?? {}
    const url = new URL((base ?? this.apiBase) + path)
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
      }
    }
    const res = await this.fetchImpl(url.toString(), {
      // The session cookie is the only credential — always include it.
      credentials: 'include',
      ...rest,
      headers: {
        ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
        ...(headers as Record<string, string> | undefined),
      },
    })
    const text = await res.text()
    let body: unknown
    try {
      body = text ? JSON.parse(text) : {}
    } catch {
      body = text
    }
    if (!res.ok) {
      const msg =
        (body as { error?: { message?: string }; message?: string })?.error?.message ||
        (body as { message?: string })?.message ||
        `Rooiam request failed: ${res.status}`
      throw new RooiamError(msg, res.status, body)
    }
    return body as T
  }

  // ---- public login flow (no session required) ----

  /** GET /setup/auth-methods — which login methods the workspace has enabled. */
  authMethods(query: WorkspaceLookupQuery = {}): Promise<GetResp<'/v1/setup/auth-methods'>> {
    return this.request('/setup/auth-methods', { query: query as Query })
  }

  /** GET /setup/login-bootstrap — auth methods + branding for rendering the widget. */
  loginBootstrap(query: WorkspaceLookupQuery = {}): Promise<GetResp<'/v1/setup/login-bootstrap'>> {
    return this.request('/setup/login-bootstrap', { query: query as Query })
  }

  /** POST /auth/magic-link/start — send the passwordless login email. */
  startLogin(input: StartLoginInput) {
    return this.request('/auth/magic-link/start', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  }

  /** POST /auth/magic-link/verify — complete login; the server sets the session cookie. */
  verifyLogin(token: string) {
    return this.request('/auth/magic-link/verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
  }

  // ---- session-cookie self-service ----

  /** GET /identity/me — the signed-in user, or a RooiamError(401) if not logged in. */
  me(): Promise<GetResp<'/v1/identity/me'>> {
    return this.request('/identity/me')
  }

  /** PATCH /identity/me/profile — update the signed-in user's profile. */
  updateProfile(patch: ProfileUpdate) {
    return this.request('/identity/me/profile', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
  }

  /** POST /auth/logout — revoke the session and clear the cookie (idempotent). */
  logout() {
    return this.request('/auth/logout', { method: 'POST' })
  }

  // ---- OIDC client flow (discovery + PKCE) ----

  readonly oidc = {
    // Discovery + JWKS live at the ORIGIN root (no /v1), so override the base.
    /** GET /.well-known/openid-configuration — issuer metadata + endpoint URLs. */
    discovery: (): Promise<GetResp<'/.well-known/openid-configuration'>> =>
      this.request('/.well-known/openid-configuration', { base: this.origin }),

    /** GET /.well-known/jwks.json — keys for verifying issued ID tokens. */
    jwks: (): Promise<GetResp<'/.well-known/jwks.json'>> =>
      this.request('/.well-known/jwks.json', { base: this.origin }),

    /**
     * Build the `/oidc/authorize` URL to redirect the browser to. Pure string
     * building — no network call. Pass a `codeChallenge` from {@link createPkcePair}
     * and keep its `verifier` for {@link RooiamBrowser.oidc.exchangeCode}.
     */
    authorizeUrl: (input: AuthorizeUrlInput): string => {
      const url = new URL(this.apiBase + '/oidc/authorize')
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', input.clientId)
      url.searchParams.set('redirect_uri', input.redirectUri)
      url.searchParams.set('code_challenge', input.codeChallenge)
      url.searchParams.set('code_challenge_method', 'S256')
      url.searchParams.set('scope', input.scope ?? 'openid profile email')
      if (input.state) url.searchParams.set('state', input.state)
      if (input.nonce) url.searchParams.set('nonce', input.nonce)
      return url.toString()
    },

    /**
     * POST /oidc/token — exchange an authorization code for tokens using PKCE.
     * Sends `application/x-www-form-urlencoded` per the OAuth2 spec. No client
     * secret (public client); the `code_verifier` proves possession.
     */
    exchangeCode: (input: TokenExchangeInput): Promise<GetResp<'/v1/oidc/token'>> => {
      const form = new URLSearchParams({
        grant_type: 'authorization_code',
        code: input.code,
        redirect_uri: input.redirectUri,
        client_id: input.clientId,
        code_verifier: input.codeVerifier,
      })
      return this.request('/oidc/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      })
    },

    /** GET /oidc/userinfo — claims for the bearer access token. */
    userinfo: (accessToken: string): Promise<GetResp<'/v1/oidc/userinfo'>> =>
      this.request('/oidc/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
  }
}

export type { paths } from './generated/schema.js'
