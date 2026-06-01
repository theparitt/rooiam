import { getApiBase } from './config'

export class RateLimitError extends Error {
  status = 429
  raw: unknown
  constructor(message: string, raw: unknown) {
    super(message)
    this.name = 'RateLimitError'
    this.raw = raw
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })

  let data: unknown
  try {
    data = await res.json()
  } catch {
    data = {}
  }

  if (!res.ok) {
    const message = (data as { error?: { message?: string } })?.error?.message || `${res.status} ${res.statusText}`
    if (res.status === 429) throw new RateLimitError(message, data)
    throw Object.assign(new Error(message), { status: res.status })
  }

  return data as T
}

const API = getApiBase()

export type DemoUser = {
  id: string
  email: string | null
  display_name: string | null
  avatar_url?: string | null
  status?: string
  created_at?: string
  updated_at?: string
}

export type DemoOrg = {
  id: string
  name: string
  slug: string
  login_display_name: string | null
  logo_url: string | null
  brand_color: string | null
  require_mfa: boolean
  allow_magic_link: boolean
  allow_google: boolean
  allow_microsoft: boolean
  allow_passkey: boolean
}

export type DemoPortal = {
  current_org: DemoOrg | null
  organizations: DemoOrg[]
  permissions: string[]
}

export type DemoAppConfig = {
  workspace_id: string
  workspace_slug: string
  app_id: string
  app_name: string
  app_icon_url: string | null
  redirect_uri: string
  authorization_endpoint: string
  token_endpoint: string
  userinfo_endpoint: string
  scopes: string[]
  demo_email: string
}

export type DemoAppCatalogItem = {
  workspace_id: string
  workspace_slug: string
  app_id: string
  label: string
  app_name: string
  app_icon_url: string | null
  demo_email: string
}

export type DemoPasskey = {
  id: string
  name: string
  aaguid: string | null
  transports: unknown[]
  sign_count: number
  last_used_at: string | null
  created_at: string
}

export type DemoMfaStatus = {
  totp_enabled: boolean
  backup_codes_remaining: number
}

export type DemoSessionEntry = {
  id: string
  current_org_id: string | null
  login_app_name: string | null
  login_workspace_slug: string | null
  user_agent: string | null
  ip: string | null
  created_at: string
  last_seen_at: string
  expires_at: string
  is_current: boolean
}

export type DemoAuditLog = {
  id: number
  action: string
  target_type: string
  target_id: string | null
  ip: string | null
  user_agent: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export type DemoLinkedProvider = {
  provider: string
  linked: boolean
  linked_email: string | null
}

export type DemoLinkedAccounts = {
  primary_email: string | null
  magic_link: {
    enabled: boolean
  }
  providers: DemoLinkedProvider[]
  passkeys: number
  totp_enabled: boolean
}

export const demoApi = {
  me: () => apiFetch<{ rooiam_user_id: string; email: string | null; display_name: string | null }>('/me'),
  updateProfile: (payload: { display_name?: string | null }) =>
    apiFetch<{ ok: boolean; display_name: string | null }>('/me/profile', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  linkedAccounts: () => apiFetch<DemoLinkedAccounts>('/identity/me/linked-accounts'),
  requestEmailChange: (newEmail: string) =>
    apiFetch<{ ok: boolean; message: string }>('/identity/me/email-change/request', {
      method: 'POST',
      body: JSON.stringify({ new_email: newEmail }),
    }),
  portal: () => apiFetch<DemoPortal>('/orgs/current/portal'),
  demoAppCatalog: () => apiFetch<DemoAppCatalogItem[]>('/demo/app-catalog'),
  demoAppConfig: (workspaceId: string, workspaceSlug: string, appId: string, origin: string) => {
    const params = new URLSearchParams({ app_id: appId, origin })
    if (workspaceId.trim()) {
      params.set('workspace_id', workspaceId)
    } else if (workspaceSlug.trim()) {
      params.set('workspace', workspaceSlug)
    }
    return apiFetch<DemoAppConfig>(`/demo/app-config?${params.toString()}`)
  },
  authExchange: (payload: {
    code: string
    redirect_uri: string
    client_id: string
    code_verifier: string
    workspace: string
    workspace_id: string
    app_name: string
    app_id: string
  }) =>
    apiFetch<{ ok: boolean; userinfo: Record<string, unknown>; workspace: string; workspace_id: string; token_type: string; expires_in: number; has_refresh_token: boolean; has_id_token: boolean }>(
      '/auth/exchange',
      { method: 'POST', body: JSON.stringify(payload) },
    ),
  authSession: () =>
    apiFetch<{ ok: boolean; userinfo: Record<string, unknown>; workspace: string; workspace_id: string; app_id: string; app_name: string; token_type: string; expires_in: number; has_refresh_token: boolean; has_id_token: boolean }>(
      '/auth/session',
    ),
  authToken: () =>
    apiFetch<{ access_token: string; token_type: string }>(
      '/auth/token',
    ),
  passkeys: () => apiFetch<DemoPasskey[]>('/webauthn/passkeys'),
  startPasskeyRegistration: () =>
    apiFetch<{ challenge_id: string; creation_options: { publicKey: unknown } }>('/webauthn/register/start', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  finishPasskeyRegistration: (payload: { challenge_id: string; name: string; credential: unknown }) =>
    apiFetch<{ ok: boolean; id: string; name: string }>('/webauthn/register/finish', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deletePasskey: (id: string) =>
    apiFetch<{ ok: boolean; message: string }>(`/webauthn/passkeys/${id}`, { method: 'DELETE' }),
  mfaStatus: () => apiFetch<DemoMfaStatus>('/mfa/status'),
  startTotpEnrollment: () =>
    apiFetch<{ challenge_id: string; secret: string; otpauth_uri: string }>('/mfa/totp/start', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  finishTotpEnrollment: (payload: { challenge_id: string; code: string }) =>
    apiFetch<{ ok: boolean }>('/mfa/totp/finish', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  disableTotp: () =>
    apiFetch<{ ok: boolean; disabled: boolean }>('/mfa/totp', { method: 'DELETE' }),
  regenerateRecoveryCodes: () =>
    apiFetch<{ codes: string[]; remaining: number }>('/mfa/recovery-codes/regenerate', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  sessions: () => apiFetch<DemoSessionEntry[]>('/identity/me/sessions'),
  revokeSession: (id: string) =>
    apiFetch<{ ok: boolean; message: string }>(`/identity/me/sessions/${id}`, { method: 'DELETE' }),
  revokeOtherSessions: () =>
    apiFetch<{ ok: boolean; message: string; revoked_count: number }>('/identity/me/sessions/revoke-all', {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  auditLogs: (page = 1, pageSize = 10) =>
    apiFetch<{ items: DemoAuditLog[]; total: number; page: number; page_size: number }>(
      `/identity/me/audit-logs?page=${page}&page_size=${pageSize}`
    ),
  demoLogin: (orgSlug: string, appName: string) =>
    apiFetch('/demo/login', {
      method: 'POST',
      body: JSON.stringify({
        org_slug: orgSlug,
        app_name: appName,
      }),
    }),
  logout: () => apiFetch('/auth/logout', { method: 'POST', body: '{}' }),
}