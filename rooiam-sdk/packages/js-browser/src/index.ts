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

export interface AuditLogQuery {
  page?: number
  page_size?: number
  date_from?: string
  date_to?: string
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
    init?: RequestInit & { query?: Query; base?: string; rawBody?: boolean },
  ): Promise<T> {
    const { query, base, headers, rawBody, ...rest } = init ?? {}
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
        // JSON by default; skip for rawBody (e.g. multipart, form-encoded) so the
        // runtime can set the right Content-Type (and multipart boundary).
        ...(rest.body && !rawBody ? { 'Content-Type': 'application/json' } : {}),
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

  /**
   * Pre-session login flows: passkey (WebAuthn) sign-in, and the MFA steps a
   * magic-link / passkey login may require before the session cookie is set.
   * These run BEFORE a session exists, so they take no cookie.
   */
  readonly login = {
    /** POST /webauthn/login/start — get assertion options + challenge_id for a passkey login. */
    passkeyStart: (input: StartLoginInput): Promise<GetResp<'/v1/webauthn/login/start'>> =>
      this.request('/webauthn/login/start', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    /** POST /webauthn/login/finish — finish a passkey login; sets the session cookie. */
    passkeyFinish: (input: { challenge_id: string; credential: unknown }) =>
      this.request('/webauthn/login/finish', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    /** POST /webauthn/login/report-failure — record a client-side login failure for audit. */
    reportFailure: (input: { stage: string; reason: string; email?: string }) =>
      this.request('/webauthn/login/report-failure', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    /** POST /mfa/login/verify — submit the TOTP/backup code an in-progress login requires. */
    mfaVerify: (challengeId: string, code: string) =>
      this.request('/mfa/login/verify', {
        method: 'POST',
        body: JSON.stringify({ challenge_id: challengeId, code }),
      }),

    /** POST /mfa/login/enroll/start — first-login TOTP enrollment context. */
    mfaEnrollStart: (challengeId: string): Promise<GetResp<'/v1/mfa/login/enroll/start'>> =>
      this.request('/mfa/login/enroll/start', {
        method: 'POST',
        body: JSON.stringify({ challenge_id: challengeId }),
      }),

    /** POST /mfa/login/enroll/finish — finish first-login TOTP enrollment; completes sign-in. */
    mfaEnrollFinish: (challengeId: string, code: string) =>
      this.request('/mfa/login/enroll/finish', {
        method: 'POST',
        body: JSON.stringify({ challenge_id: challengeId, code }),
      }),
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

  // ---- session-cookie security self-service ----

  readonly sessions = {
    /** GET /identity/me/sessions — the user's active sessions. */
    list: (): Promise<GetResp<'/v1/identity/me/sessions'>> =>
      this.request('/identity/me/sessions'),

    /** DELETE /identity/me/sessions/{id} — revoke one session. */
    revoke: (sessionId: string) =>
      this.request(`/identity/me/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
      }),

    /** POST /identity/me/sessions/revoke-all — revoke every other session. */
    revokeAll: () =>
      this.request('/identity/me/sessions/revoke-all', { method: 'POST' }),
  }

  readonly account = {
    /** GET /identity/me/linked-accounts — linked OAuth providers. */
    linkedAccounts: (): Promise<GetResp<'/v1/identity/me/linked-accounts'>> =>
      this.request('/identity/me/linked-accounts'),

    /**
     * POST /identity/me/avatar/upload — upload a new avatar image (multipart).
     * Pass a `File`/`Blob` (wrapped in FormData under the `file` field) or your
     * own `FormData`. Do NOT set Content-Type — the browser sets the multipart
     * boundary automatically.
     */
    uploadAvatar: (file: Blob | FormData) => {
      const form =
        file instanceof FormData
          ? file
          : (() => {
              const f = new FormData()
              f.append('file', file)
              return f
            })()
      // No Content-Type header: the browser/runtime sets the multipart boundary.
      return this.request<{ url: string; user: unknown }>('/identity/me/avatar/upload', {
        method: 'POST',
        body: form as unknown as BodyInit,
        rawBody: true,
      })
    },

    /** POST /identity/me/linked-accounts/{provider}/start — get the link authorization URL. */
    startLink: (provider: string, redirectUri?: string) =>
      this.request(`/identity/me/linked-accounts/${encodeURIComponent(provider)}/start`, {
        method: 'POST',
        body: JSON.stringify(redirectUri ? { redirect_uri: redirectUri } : {}),
      }),

    /** DELETE /identity/me/linked-accounts/{provider} — unlink a provider. */
    unlink: (provider: string) =>
      this.request(`/identity/me/linked-accounts/${encodeURIComponent(provider)}`, {
        method: 'DELETE',
      }),

    /** GET /identity/me/audit-logs — the user's own audit log. */
    auditLogs: (query: AuditLogQuery = {}): Promise<GetResp<'/v1/identity/me/audit-logs'>> =>
      this.request('/identity/me/audit-logs', { query: query as Query }),

    /** POST /identity/me/email-change/request — send a verification link to a new email. */
    requestEmailChange: (newEmail: string) =>
      this.request('/identity/me/email-change/request', {
        method: 'POST',
        body: JSON.stringify({ new_email: newEmail }),
      }),

    /** POST /identity/me/email-change/verify — confirm the email change. */
    verifyEmailChange: (token: string) =>
      this.request('/identity/me/email-change/verify', {
        method: 'POST',
        body: JSON.stringify({ token }),
      }),

    /** POST /identity/me/delete/request — send the account-deletion confirmation email. */
    requestDelete: () =>
      this.request('/identity/me/delete/request', { method: 'POST' }),

    /** DELETE /identity/me/delete/confirm — permanently delete the account. */
    confirmDelete: (token: string) =>
      this.request('/identity/me/delete/confirm', {
        method: 'DELETE',
        body: JSON.stringify({ token }),
      }),
  }

  readonly passkeys = {
    /** GET /webauthn/passkeys — the user's registered passkeys. */
    list: (): Promise<GetResp<'/v1/webauthn/passkeys'>> =>
      this.request('/webauthn/passkeys'),

    /** POST /webauthn/register/start — get WebAuthn creation options + a challenge_id. */
    registerStart: (): Promise<GetResp<'/v1/webauthn/register/start'>> =>
      this.request('/webauthn/register/start', { method: 'POST' }),

    /**
     * POST /webauthn/register/finish — register the credential produced by
     * `navigator.credentials.create()`. Pass the `challenge_id` from registerStart
     * and the raw credential.
     */
    registerFinish: (input: { challenge_id: string; credential: unknown; name?: string }) =>
      this.request('/webauthn/register/finish', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    /** PATCH /webauthn/passkeys/{id} — rename a passkey. */
    rename: (passkeyId: string, name: string) =>
      this.request(`/webauthn/passkeys/${encodeURIComponent(passkeyId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      }),

    /** DELETE /webauthn/passkeys/{id} — delete a passkey. */
    delete: (passkeyId: string) =>
      this.request(`/webauthn/passkeys/${encodeURIComponent(passkeyId)}`, {
        method: 'DELETE',
      }),
  }

  readonly mfa = {
    /** GET /mfa/status — TOTP status + remaining backup codes. */
    status: (): Promise<GetResp<'/v1/mfa/status'>> => this.request('/mfa/status'),

    /** POST /mfa/totp/start — get the TOTP secret + otpauth URI + challenge_id. */
    totpStart: (): Promise<GetResp<'/v1/mfa/totp/start'>> =>
      this.request('/mfa/totp/start', { method: 'POST' }),

    /** POST /mfa/totp/finish — confirm enrollment with a code; returns backup codes. */
    totpFinish: (challengeId: string, code: string) =>
      this.request('/mfa/totp/finish', {
        method: 'POST',
        body: JSON.stringify({ challenge_id: challengeId, code }),
      }),

    /** DELETE /mfa/totp — disable TOTP (revokes other sessions). */
    disableTotp: () => this.request('/mfa/totp', { method: 'DELETE' }),

    /** POST /mfa/recovery-codes/regenerate — issue fresh backup codes. */
    regenerateBackupCodes: () =>
      this.request('/mfa/recovery-codes/regenerate', { method: 'POST' }),
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

    /** POST /oidc/revoke — revoke a token (RFC 7009). Form-encoded; public client. */
    revoke: (input: { token: string; clientId: string; tokenTypeHint?: string }) => {
      const form = new URLSearchParams({ token: input.token, client_id: input.clientId })
      if (input.tokenTypeHint) form.set('token_type_hint', input.tokenTypeHint)
      return this.request('/oidc/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
        rawBody: true,
      })
    },

    /** POST /oidc/introspect — introspect a token (RFC 7662). Form-encoded. */
    introspect: (input: { token: string; clientId: string; tokenTypeHint?: string }) => {
      const form = new URLSearchParams({ token: input.token, client_id: input.clientId })
      if (input.tokenTypeHint) form.set('token_type_hint', input.tokenTypeHint)
      return this.request('/oidc/introspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
        rawBody: true,
      })
    },

    /**
     * Build the `/oidc/end-session` (RP-initiated logout) URL to redirect to.
     * Pure string building — no network call.
     */
    endSessionUrl: (input: {
      idTokenHint?: string
      postLogoutRedirectUri?: string
      state?: string
      clientId?: string
    }): string => {
      const url = new URL(this.apiBase + '/oidc/end-session')
      if (input.idTokenHint) url.searchParams.set('id_token_hint', input.idTokenHint)
      if (input.postLogoutRedirectUri)
        url.searchParams.set('post_logout_redirect_uri', input.postLogoutRedirectUri)
      if (input.state) url.searchParams.set('state', input.state)
      if (input.clientId) url.searchParams.set('client_id', input.clientId)
      return url.toString()
    },
  }
}

export type { paths } from './generated/schema.js'
