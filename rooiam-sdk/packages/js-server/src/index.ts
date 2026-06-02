// @rooiam/sdk-server — server-side TypeScript SDK for the Rooiam workspace
// integration API. Uses a workspace API KEY (a secret) — server-side only,
// never ship this in a browser bundle.
//
// The wire types in ./generated/schema.d.ts are generated from the server's
// OpenAPI spec (rooiam-sdk/spec/openapi.json), so request/response shapes cannot
// drift from the server. This file adds the ergonomic surface on top.

import type { paths } from './generated/schema.js'

export interface RooiamServerOptions {
  /** Rooiam API base, INCLUDING the /v1 segment. e.g. https://demo-api.rooiam.com/v1 */
  apiBase: string
  /** Workspace API key (secret). Sent as Authorization: Bearer <key>. */
  apiKey: string
  /** Optional fetch override (for tests / custom agents). */
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

// ---- helpers to pull response/param types out of the generated paths map ----
type Ok200<T> = T extends { responses: { 200: { content: { 'application/json': infer B } } } }
  ? B
  : unknown
type GetOp<P extends keyof paths> = paths[P] extends { get: infer O } ? O : never
type GetResp<P extends keyof paths> = Ok200<GetOp<P>>

// Common query param sets (subset the SDK exposes ergonomically)
export interface ListQuery {
  page?: number
  page_size?: number
  q?: string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}
export interface MemberListQuery extends ListQuery {
  role?: string
  status?: string
}
export interface ActivityQuery {
  page?: number
  page_size?: number
  search?: string
  q?: string
  action?: string
  date_from?: string
  date_to?: string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}
export interface ClientListQuery extends ListQuery {
  status?: string
  app_type?: string
}
export interface InviteListQuery {
  page?: number
  page_size?: number
  q?: string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

// ---- request body shapes (mirror the server DTOs) ----
export interface BrandingUpdate {
  name?: string
  login_display_name?: string
  login_title?: string
  login_subtitle?: string
  icon_url?: string
  login_logo_url?: string
  brand_color?: string
  show_login_logo?: boolean
  show_login_title?: boolean
  show_login_subtitle?: boolean
  show_powered_by?: boolean
  widget_radius?: string
  widget_shadow?: string
  icon_container?: string
  login_logo_container?: string
  login_logo_size?: string
  card_radius?: string
  button_style?: string
  card_bg_style?: string
  card_bg_color2?: string
  card_border_width?: string
  card_border_color?: string
  login_method_order?: string[]
}
export interface AuthConfigUpdate {
  google_client_id?: string | null
  google_client_secret?: string | null
  clear_google?: boolean
  microsoft_client_id?: string | null
  microsoft_client_secret?: string | null
  microsoft_tenant_id?: string | null
  clear_microsoft?: boolean
  smtp_host?: string | null
  smtp_port?: number | null
  smtp_user?: string | null
  smtp_password?: string | null
  smtp_from?: string | null
  smtp_security?: string | null
  clear_smtp?: boolean
}
export interface CreateClientInput {
  app_name: string
  app_type: string
  redirect_uris: string[]
  allowed_embed_origins?: string[]
  confirm_multi_origin?: boolean
}
export interface UpdateClientInput {
  app_name: string
  redirect_uris: string[]
  allowed_embed_origins?: string[]
  confirm_multi_origin?: boolean
}

export class RooiamServer {
  private readonly apiBase: string
  private readonly apiKey: string
  private readonly fetchImpl: typeof fetch

  constructor(opts: RooiamServerOptions) {
    if (!opts.apiBase) throw new Error('RooiamServer: apiBase is required (include /v1)')
    if (!opts.apiKey) throw new Error('RooiamServer: apiKey is required')
    this.apiBase = opts.apiBase.replace(/\/+$/, '')
    this.apiKey = opts.apiKey
    this.fetchImpl = opts.fetch ?? globalThis.fetch
    if (!this.fetchImpl) throw new Error('RooiamServer: no fetch available; pass opts.fetch')
  }

  private async request<T>(path: string, init?: RequestInit & { query?: Query }): Promise<T> {
    const url = new URL(this.apiBase + path)
    if (init?.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
      }
    }
    const res = await this.fetchImpl(url.toString(), {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers as Record<string, string> | undefined),
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

  /** GET /orgs/integrations/workspace — info for the authenticated API key. */
  workspace(): Promise<GetResp<'/v1/orgs/integrations/workspace'>> {
    return this.request('/orgs/integrations/workspace')
  }

  /** GET /orgs/integrations/activity — workspace audit log. */
  activity(query: ActivityQuery = {}): Promise<GetResp<'/v1/orgs/integrations/activity'>> {
    return this.request('/orgs/integrations/activity', { query: query as Query })
  }

  /** GET /orgs/integrations/audit/actions — distinct audit action codes for filtering. */
  auditActions(): Promise<GetResp<'/v1/orgs/integrations/audit/actions'>> {
    return this.request('/orgs/integrations/audit/actions')
  }

  /** GET /orgs/integrations/effective-policy — resolved auth/security policy. */
  effectivePolicy(): Promise<GetResp<'/v1/orgs/integrations/effective-policy'>> {
    return this.request('/orgs/integrations/effective-policy')
  }

  /** GET /orgs/integrations/policy-summary — human-readable login-method summary. */
  policySummary(): Promise<GetResp<'/v1/orgs/integrations/policy-summary'>> {
    return this.request('/orgs/integrations/policy-summary')
  }

  /** GET /orgs/integrations/roles — roles assignable to members. */
  roles(): Promise<GetResp<'/v1/orgs/integrations/roles'>> {
    return this.request('/orgs/integrations/roles')
  }

  /** GET /orgs/integrations/permissions — permission catalog. */
  permissions(): Promise<GetResp<'/v1/orgs/integrations/permissions'>> {
    return this.request('/orgs/integrations/permissions')
  }

  /** GET /orgs/integrations/api-keys/me — metadata + permissions for the calling key. */
  apiKeyMe(): Promise<GetResp<'/v1/orgs/integrations/api-keys/me'>> {
    return this.request('/orgs/integrations/api-keys/me')
  }

  /** GET /orgs/integrations/widget-preview-config — hosted login widget preview config. */
  widgetPreviewConfig(): Promise<GetResp<'/v1/orgs/integrations/widget-preview-config'>> {
    return this.request('/orgs/integrations/widget-preview-config')
  }

  readonly branding = {
    /** GET /orgs/integrations/branding — current branding config. */
    get: (): Promise<GetResp<'/v1/orgs/integrations/branding'>> =>
      this.request('/orgs/integrations/branding'),

    /** PATCH /orgs/integrations/branding — update branding (requires branding.write). */
    update: (patch: BrandingUpdate) =>
      this.request('/orgs/integrations/branding', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
  }

  readonly authConfig = {
    /** GET /orgs/integrations/auth-config — auth provider + SMTP config (secrets redacted). */
    get: (): Promise<GetResp<'/v1/orgs/integrations/auth-config'>> =>
      this.request('/orgs/integrations/auth-config'),

    /** PATCH /orgs/integrations/auth-config — update auth provider + SMTP config. */
    update: (patch: AuthConfigUpdate) =>
      this.request('/orgs/integrations/auth-config', {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
  }

  readonly invites = {
    list: (query: InviteListQuery = {}): Promise<GetResp<'/v1/orgs/integrations/invites'>> =>
      this.request('/orgs/integrations/invites', { query: query as Query }),

    get: (inviteId: string): Promise<GetResp<'/v1/orgs/integrations/invites/{invite_id}'>> =>
      this.request(`/orgs/integrations/invites/${encodeURIComponent(inviteId)}`),

    /** POST /orgs/integrations/invites — invite an email to the workspace. */
    send: (email: string) =>
      this.request('/orgs/integrations/invites', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),

    revoke: (inviteId: string) =>
      this.request(`/orgs/integrations/invites/${encodeURIComponent(inviteId)}`, {
        method: 'DELETE',
      }),
  }

  readonly members = {
    list: (query: MemberListQuery = {}): Promise<GetResp<'/v1/orgs/integrations/members'>> =>
      this.request('/orgs/integrations/members', { query: query as Query }),

    get: (memberId: string): Promise<GetResp<'/v1/orgs/integrations/members/{member_id}'>> =>
      this.request(`/orgs/integrations/members/${encodeURIComponent(memberId)}`),

    activity: (memberId: string, query: ActivityQuery = {}) =>
      this.request(`/orgs/integrations/members/${encodeURIComponent(memberId)}/activity`, {
        query: query as Query,
      }),

    sessions: (memberId: string) =>
      this.request(`/orgs/integrations/members/${encodeURIComponent(memberId)}/sessions`),

    revokeSessions: (memberId: string) =>
      this.request(`/orgs/integrations/members/${encodeURIComponent(memberId)}/sessions`, {
        method: 'DELETE',
      }),

    setRole: (memberId: string, role_code: string) =>
      this.request(`/orgs/integrations/members/${encodeURIComponent(memberId)}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role_code }),
      }),

    updateProfile: (
      memberId: string,
      profile: { display_name?: string | null; avatar_url?: string | null },
    ) =>
      this.request(`/orgs/integrations/members/${encodeURIComponent(memberId)}/profile`, {
        method: 'PATCH',
        body: JSON.stringify(profile),
      }),

    remove: (memberId: string) =>
      this.request(`/orgs/integrations/members/${encodeURIComponent(memberId)}`, {
        method: 'DELETE',
      }),
  }

  readonly clients = {
    list: (query: ClientListQuery = {}): Promise<GetResp<'/v1/orgs/integrations/clients'>> =>
      this.request('/orgs/integrations/clients', { query: query as Query }),

    get: (clientId: string): Promise<GetResp<'/v1/orgs/integrations/clients/{client_id}'>> =>
      this.request(`/orgs/integrations/clients/${encodeURIComponent(clientId)}`),

    /** POST /orgs/integrations/clients — create an app. Response includes the one-time secret. */
    create: (input: CreateClientInput) =>
      this.request('/orgs/integrations/clients', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    update: (clientId: string, input: UpdateClientInput) =>
      this.request(`/orgs/integrations/clients/${encodeURIComponent(clientId)}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),

    delete: (clientId: string) =>
      this.request(`/orgs/integrations/clients/${encodeURIComponent(clientId)}`, {
        method: 'DELETE',
      }),

    setStatus: (clientId: string, status: string) =>
      this.request(`/orgs/integrations/clients/${encodeURIComponent(clientId)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),

    secretMetadata: (clientId: string) =>
      this.request(`/orgs/integrations/clients/${encodeURIComponent(clientId)}/secret-metadata`),

    /** POST .../rotate-secret — returns the new one-time client secret. */
    rotateSecret: (clientId: string) =>
      this.request(`/orgs/integrations/clients/${encodeURIComponent(clientId)}/rotate-secret`, {
        method: 'POST',
      }),
  }
}

export type { paths } from './generated/schema.js'
