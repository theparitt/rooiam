import { getApiBase } from './api-base'
import { getSetupAuthHeaders } from './setup-token'

// Terminology note:
// The UI standard is Workspace / App / Login.
// API payloads still expose org / organization / tenant / client field names where that
// matches the server contract. Keep transport names stable unless the backend changes too.

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const apiBase = getApiBase()
  let res: Response
  try {
    res = await fetch(`${apiBase}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...getSetupAuthHeaders(),
        ...(options.headers || {}),
      },
    })
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(`Could not reach ${apiBase}. Check VITE_API_URL, CORS, and whether the Rooiam API is running.`)
    }
    throw err
  }

  if (res.status === 401) {
    throw new Error('UNAUTHORIZED')
  }

  if (res.status === 429) {
    throw new Error('RATE_LIMITED')
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    const message =
      err?.error?.message ||
      err?.message ||
      res.statusText ||
      'API Error'
    throw new Error(message)
  }

  if (res.status === 204) return {} as T
  return res.json()
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
}

export type PaginatedResult<T> = {
  items: T[]
  total: number
  page: number
  page_size: number
}

// Typed API helpers
export type ApiUser = {
  id: string
  email: string | null
  display_name: string | null
  avatar_url: string | null
  status: string
  is_platform_owner: boolean
  is_superuser: boolean
  created_at: string
  updated_at: string
}

export type ApiOrganization = {
  id: string
  name: string
  slug: string
  logo_url: string | null
  status: string
  created_at: string
  updated_at: string
  allow_client_management?: boolean
  allow_web_clients?: boolean
  allow_spa_clients?: boolean
  allow_native_clients?: boolean
}

export type PlatformClientGovernance = {
  tenant_client_management_enabled: boolean
  tenant_web_clients_enabled: boolean
  tenant_spa_clients_enabled: boolean
  tenant_native_clients_enabled: boolean
}

export type PlatformIpPolicy = {
  tenant_ip_policy_editable: boolean
  default_allowlist: string
  default_blocklist: string
}

export type StorageBackend = 'local' | 'minio'

export type PlatformStorageConfig = {
  backend: StorageBackend
  backend_configured: boolean
  local_path: string
  minio_endpoint: string
  minio_bucket: string
  minio_access_key: string
  minio_secret_key: string
  minio_secret_key_configured: boolean
  minio_use_ssl: boolean
}

export type PlatformStorageConfigUpdate = {
  backend: StorageBackend
  local_path: string
  minio_endpoint: string
  minio_bucket: string
  minio_access_key: string
  minio_secret_key?: string
  minio_use_ssl: boolean
}

export type TestStorageRequest = {
  backend: StorageBackend
  local_path?: string
  minio_endpoint?: string
  minio_bucket?: string
  minio_access_key?: string
  minio_secret_key?: string
  minio_use_ssl?: boolean
}

export type TenantAccessPolicy = {
  allow_magic_link: boolean
  allow_google: boolean
  allow_microsoft: boolean
  allow_passkey: boolean
}

export type PlatformWorkspaceGovernance = {
  max_workspaces_per_user: number | null
  max_apps_per_workspace: number | null
  max_redirect_uris_per_app_default: number | null
  max_redirect_uris_per_app_limit: number | null
  max_allowed_embed_origins_per_app_default: number | null
  max_allowed_embed_origins_per_app_limit: number | null
  hard_cap_workspaces_per_user: number
  hard_cap_apps_per_workspace: number
  hard_cap_redirect_uris_per_app: number
  hard_cap_allowed_embed_origins_per_app: number
}

export type TenantWorkspaceAppGovernance = {
  platform_default_max_redirect_uris_per_app: number
  platform_max_redirect_uris_per_app: number
  platform_default_max_allowed_embed_origins_per_app: number
  platform_max_allowed_embed_origins_per_app: number
  tenant_max_redirect_uris_per_app: number | null
  tenant_max_allowed_embed_origins_per_app: number | null
  effective_max_redirect_uris_per_app: number
  effective_max_allowed_embed_origins_per_app: number
}

export type RiskPolicy = {
  enabled: boolean
  new_ip_enabled: boolean
  new_ip_lookback: number
  rapid_ip_change_enabled: boolean
  rapid_ip_change_window_minutes: number
  new_user_agent_enabled: boolean
  new_user_agent_lookback: number
  operator_email_enabled: boolean
}

export type SecurityAlertReview = {
  alert_key: string
  reviewed_by_user_id: string | null
  reviewed_by_display_name?: string | null
  reviewed_by_email?: string | null
  reviewed_at: string
}

export type SessionPolicy = {
  session_duration_days: number
  magic_link_expiry_minutes: number
  oidc_access_token_ttl_minutes: number
  refresh_token_ttl_days: number
  idle_timeout_minutes: number
  magic_link_rate_limit: number
  magic_link_rate_window_seconds: number
}

export type TenantSessionPolicy = {
  session_duration_days: number
  magic_link_expiry_minutes: number
  idle_timeout_minutes: number
}

export type OrgSessionPolicy = {
  // Platform defaults (upper bounds)
  platform_session_duration_days: number
  platform_magic_link_expiry_minutes: number
  platform_oidc_access_token_ttl_minutes: number
  platform_refresh_token_ttl_days: number
  platform_idle_timeout_minutes: number
  platform_magic_link_rate_limit: number
  platform_magic_link_rate_window_seconds: number
  // Org overrides (null = inherit platform)
  session_duration_days: number | null
  magic_link_expiry_minutes: number | null
  oidc_access_token_ttl_minutes: number | null
  refresh_token_ttl_days: number | null
  idle_timeout_minutes: number | null
  magic_link_rate_limit: number | null
  magic_link_rate_window_seconds: number | null
}

export type TenantClientPolicy = {
  allow_client_management: boolean
  allow_web_clients: boolean
  allow_spa_clients: boolean
  allow_native_clients: boolean
}

export type EffectiveClientPolicy = {
  allow_client_management: boolean
  allow_web_clients: boolean
  allow_spa_clients: boolean
  allow_native_clients: boolean
}

export type OrgClientPolicyResponse = {
  platform: PlatformClientGovernance
  tenant: TenantClientPolicy
  effective: EffectiveClientPolicy
}

export type CurrentPortalResponse = {
  current_org: ApiOrganization | null
  organizations: ApiOrganization[]
  permissions: string[]
  available_roles: { code: string; name: string }[]
  max_logo_bytes: number
  demo_mode: boolean
}

export type OAuthClient = {
  id: string
  client_id: string
  app_name: string
  app_type: string
  status: string
  is_first_party: boolean
  created_at: string
}

export type ClientResponse = {
  client: OAuthClient
  redirect_uris: string[]
  client_secret?: string
}

export type RotateClientSecretResponse = {
  client_id: string
  client_secret: string
}

export type ApiMember = {
  id: string
  organization_id: string
  user_id: string
  status: string
  created_at: string
}

export type OrgMemberView = {
  id: string
  organization_id: string
  user_id: string
  status: string
  created_at: string
  display_name: string | null
  avatar_url: string | null
  email: string | null
  role_names: string[]
  role_codes: string[]
}

export type ApiSession = {
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

export type ApiPasskey = {
  id: string
  name: string
  aaguid: string | null
  transports: unknown[]
  sign_count: number
  last_used_at: string | null
  created_at: string
}

export type ApiMfaStatus = {
  totp_enabled: boolean
  backup_codes_remaining: number
}

export type ApiLinkedProvider = {
  provider: string
  linked: boolean
  linked_email: string | null
  is_signup_provider: boolean
}

export type ApiLinkedAccounts = {
  primary_email: string | null
  magic_link: {
    enabled: boolean
  }
  providers: ApiLinkedProvider[]
  passkeys: number
  totp_enabled: boolean
}

export type PublicUrls = {
  issuer_url: string
  frontend_url: string
  admin_url: string
  google_callback_url: string
  microsoft_callback_url: string
}

export type SetupStatus = {
  initialized: boolean
  has_admin_user: boolean
  has_smtp: boolean
  has_google_oauth: boolean
  has_microsoft_oauth: boolean
  demo_mode: boolean
}

export type AdminAccessPolicy = {
  demo_mode: boolean
  google_admin_login_enabled: boolean
  microsoft_admin_login_enabled: boolean
  admin_passkey_allowed: boolean
  admin_require_mfa: boolean
}

export type SetupConfig = PublicUrls & {
  admin_email: string
  admin_display_name: string
  platform_owner_exists: boolean
  smtp_verified_email: string
  smtp_verified_at: string
  demo_mailbox_url: string | null
  redis_url: string
  redis_url_masked: string
  database_url_masked: string
  database_name: string
  database_host: string
  database_port: number
  database_username: string
  database_mode_target: string
  database_connection_ready: boolean
  database_migration_count: number
  database_latest_migration: string
  smtp_host: string
  smtp_port: string
  smtp_security: string
  smtp_insecure_tls: boolean
  smtp_username: string
  smtp_password: string
  smtp_password_configured: boolean
  smtp_from_email: string
  google_client_id: string
  google_client_secret: string
  google_client_secret_configured: boolean
  google_oauth_verified_at: string
  google_admin_login_enabled: boolean
  microsoft_client_id: string
  microsoft_client_secret: string
  microsoft_client_secret_configured: boolean
  microsoft_tenant_id: string
  microsoft_oauth_verified_at: string
  microsoft_admin_login_enabled: boolean
  setup_access_mode: string
}

export type DatabaseStatus = {
  ok: boolean
  message: string
  database_url_masked: string
  database_name: string
  database_host: string
  database_port: number
  database_username: string
  database_mode_target: string
  database_connection_ready: boolean
  database_migration_count: number
  database_latest_migration: string
}

export type AdminAuditLog = {
  id: number
  actor_user_id: string | null
  actor_email: string | null
  actor_display_name: string | null
  organization_id: string | null
  action: string
  target_type: string
  target_id: string | null
  ip: string | null
  user_agent: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export type TenantAuditLog = {
  id: number
  actor_user_id: string | null
  actor_email: string | null
  actor_display_name: string | null
  action: string
  target_type: string
  target_id: string | null
  ip: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export type AdminTenantMember = {
  id: string
  organization_id: string
  organization_name: string
  organization_slug: string
  user_id: string
  status: string
  membership_status: string
  created_at: string
  last_seen_at: string | null
  display_name: string | null
  avatar_url: string | null
  email: string | null
  role_names: string[]
  role_codes: string[]
}

export const authApi = {
  me: () => api.get<ApiUser>('/identity/me'),
  sendMagicLink: (email: string, options?: { redirect_uri?: string; surface?: 'admin' | 'user' }) =>
    api.post('/auth/magic-link/start', {
      email,
      redirect_uri: options?.redirect_uri,
      surface: options?.surface,
    }),
  logout: () => api.post<{ ok: boolean; message: string }>('/auth/logout', {}),
  sessions: () => api.get<ApiSession[]>('/identity/me/sessions'),
  myAuditLogs: (page = 1, pageSize = 25) =>
    api.get<{ items: unknown[]; total: number; page: number; page_size: number }>(`/identity/me/audit-logs?page=${page}&page_size=${pageSize}`),
  revokeSession: (id: string) => api.delete<{ ok: boolean; message: string }>(`/identity/me/sessions/${id}`),
  revokeOtherSessions: () => api.post<{ ok: boolean; revoked_count: number }>('/identity/me/sessions/revoke-all', {}),
  passkeys: () => api.get<ApiPasskey[]>('/webauthn/passkeys'),
  startPasskeyRegistration: () => api.post<{ challenge_id: string; creation_options: { publicKey: unknown } }>('/webauthn/register/start', {}),
  finishPasskeyRegistration: (payload: { challenge_id: string; name: string; credential: unknown }) =>
    api.post<{ ok: boolean; id: string; name: string }>('/webauthn/register/finish', payload),
  deletePasskey: (id: string) => api.delete<{ ok: boolean; message: string }>(`/webauthn/passkeys/${id}`),
  mfaStatus: () => api.get<ApiMfaStatus>('/mfa/status'),
  startTotpEnrollment: () => api.post<{ challenge_id: string; secret: string; otpauth_uri: string }>('/mfa/totp/start', {}),
  finishTotpEnrollment: (payload: { challenge_id: string; code: string }) => api.post<{ ok: boolean }>('/mfa/totp/finish', payload),
  disableTotp: () => api.delete<{ ok: boolean; disabled: boolean }>('/mfa/totp'),
  regenerateRecoveryCodes: () => api.post<{ codes: string[]; remaining: number }>('/mfa/recovery-codes/regenerate', {}),
  linkedAccounts: () => api.get<ApiLinkedAccounts>('/identity/me/linked-accounts'),
  startLinkProvider: (provider: 'google' | 'microsoft', redirect_uri?: string) =>
    api.post<{ authorization_url: string }>(`/identity/me/linked-accounts/${provider}/start`, { redirect_uri }),
  unlinkProvider: (provider: 'google' | 'microsoft') =>
    api.delete<{ ok: boolean; message: string }>(`/identity/me/linked-accounts/${provider}`),
  updateProfile: (payload: { display_name?: string | null; avatar_url?: string | null }) =>
    api.patch<ApiUser>('/identity/me/profile', payload),
  uploadAvatar: async (file: File) => {
    const apiBase = getApiBase()
    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch(`${apiBase}/identity/me/avatar/upload`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        ...getSetupAuthHeaders(),
      },
      body: formData,
    })

    if (res.status === 401) {
      window.location.href = '/login'
      throw new Error('Unauthorized')
    }

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data?.error?.message || data?.message || 'Could not upload avatar.')
    }

    return data as { url: string; user: ApiUser }
  },
  requestEmailChange: (new_email: string) =>
    api.post<{ ok: boolean; message: string }>('/identity/me/email-change/request', { new_email, surface: 'admin' }),
}

export const orgApi = {
  list: () => api.get<{ organizations: ApiOrganization[] }>('/orgs'),
  create: (name: string, slug: string) =>
    api.post<ApiOrganization>('/orgs', { name, slug }),
  switch: (organizationId: string) =>
    api.post<{ ok: boolean; message: string; current_org_id: string }>('/orgs/switch', { organization_id: organizationId }),
  currentPortal: () => api.get<CurrentPortalResponse>('/orgs/current/portal'),
  currentClientPolicy: () => api.get<OrgClientPolicyResponse>('/orgs/current/client-policy'),
  updateCurrentClientPolicy: (payload: TenantClientPolicy) =>
    api.patch<OrgClientPolicyResponse>('/orgs/current/client-policy', payload),
  currentClients: () => api.get<ClientResponse[]>('/orgs/current/clients'),
  createCurrentClient: (payload: { app_name: string; app_type: string; redirect_uris: string[] }) =>
    api.post<ClientResponse>('/orgs/current/clients', payload),
  rotateCurrentClientSecret: (clientId: string) =>
    api.post<RotateClientSecretResponse>(`/orgs/current/clients/${clientId}/rotate-secret`, {}),
  members: (orgId: string) =>
    api.get<{ members: ApiMember[] }>(`/orgs/${orgId}/members`),
  sendInvite: (orgId: string, email: string) =>
    api.post(`/orgs/${orgId}/invites`, { email }),
  currentMembers: () => api.get<OrgMemberView[]>('/orgs/current/members'),
  workspaceActivity: (params?: { page?: number; page_size?: number; search?: string; action?: string }) =>
    api.get<PaginatedResult<TenantAuditLog>>(`/orgs/workspace/activity?${new URLSearchParams(
      Object.entries({
        page: params?.page?.toString() || '',
        page_size: params?.page_size?.toString() || '',
        search: params?.search || '',
        action: params?.action || '',
      }).filter(([, value]) => value !== '')
    ).toString()}`),
}

export type AdminUser = {
  id: string
  email: string
  display_name: string | null
  avatar_url: string | null
  created_at: string
  last_seen_at: string | null
  status: string
  is_platform_owner: boolean
  is_superuser: boolean
  workspace_count: number
  primary_workspace_name: string | null
  primary_workspace_slug: string | null
  primary_workspace_icon_url: string | null
  primary_workspace_icon_container: 'square' | 'circle' | 'wide' | null
  highest_workspace_role: 'owner' | 'admin' | 'member' | null
}
export type AdminOrg = {
  id: string
  name: string
  slug: string
  icon_url: string | null
  icon_container: 'square' | 'circle' | 'wide'
  member_count: number
  status: string
  created_at: string
}
export type AdminOrganizationSummary = {
  id: string
  name: string
  slug: string
  status: string
  platform_locked: boolean
  member_count: number
  app_count: number
  allow_magic_link: boolean
  allow_google: boolean
  allow_microsoft: boolean
  allow_passkey: boolean
  require_mfa: boolean
  created_at: string
}
export type AdminOrganizationMember = {
  id: string
  user_id: string
  status: string
  display_name: string | null
  email: string | null
  role_names: string[]
  role_codes: string[]
}
export type AdminClient = {
  id: string
  client_id: string
  app_name: string
  app_type: string
  status: string
  owner_user_id: string | null
  owner_email: string | null
  org_id: string | null
  organization_name: string | null
  organization_slug: string | null
  is_first_party: boolean
  created_at: string
  redirect_uris: string[]
}

export type AdminClientDetail = {
  id: string
  client_id: string
  app_name: string
  app_type: string
  status: string
  owner_user_id: string | null
  owner_email: string | null
  owner_display_name: string | null
  org_id: string | null
  organization_name: string | null
  organization_slug: string | null
  organization_status: string | null
  is_first_party: boolean
  created_at: string
  redirect_uris: string[]
  recent_activity: AdminAuditLog[]
}
export type AdminOrganizationDetail = {
  organization: AdminOrganizationSummary
  owner: AdminOrganizationMember | null
  admins: AdminOrganizationMember[]
  members: AdminOrganizationMember[]
  clients: AdminClient[]
  recent_activity: AdminAuditLog[]
}

export type AdminUserWorkspaceMembership = {
  membership_id: string
  organization_id: string
  organization_name: string
  organization_slug: string
  organization_icon_url: string | null
  organization_icon_container: 'square' | 'circle' | 'wide'
  membership_status: string
  role_names: string[]
  role_codes: string[]
}

export type AdminUserDetail = {
  user: AdminUser
  workspace_memberships: AdminUserWorkspaceMembership[]
  recent_activity: AdminAuditLog[]
}

export type AdminSession = {
  id: string
  user_agent: string | null
  ip: string | null
  last_seen_at: string | null
  created_at: string
}

export const sysAdminApi = {
  users: (params?: { page?: number; page_size?: number; search?: string; role?: 'all' | 'platform' | 'workspace_admin' | 'user' }) =>
    api.get<PaginatedResult<AdminUser>>(`/admin/users?${new URLSearchParams(
      Object.entries({
        page: params?.page?.toString() || '',
        page_size: params?.page_size?.toString() || '',
        search: params?.search || '',
        role: params?.role || '',
      }).filter(([, value]) => value !== '')
    ).toString()}`),
  userDetail: (userId: string) => api.get<AdminUserDetail>(`/admin/users/${userId}`),
  updateUserStatus: (userId: string, status: 'active' | 'suspended') =>
    api.patch<AdminUser>(`/admin/users/${userId}/status`, { status }),
  userSessions: (userId: string) => api.get<AdminSession[]>(`/admin/users/${userId}/sessions`),
  revokeUserSessions: (userId: string) => api.delete<{ ok: boolean; revoked_count: number }>(`/admin/users/${userId}/sessions`),
  userAuditLogs: (userId: string, params?: { page?: number; page_size?: number; search?: string; date_from?: string; date_to?: string }) =>
    api.get<PaginatedResult<AdminAuditLog>>(`/admin/users/${userId}/audit-logs?${new URLSearchParams(
      Object.entries({ page: params?.page?.toString() || '', page_size: params?.page_size?.toString() || '', search: params?.search || '', date_from: params?.date_from || '', date_to: params?.date_to || '' })
        .filter(([, v]) => v !== '')
    ).toString()}`),
  updateOrgStatus: (orgId: string, status: 'active' | 'suspended') =>
    api.patch<{ id: string; status: string }>(`/admin/organizations/${orgId}/status`, { status }),
  organizations: (params?: { page?: number; page_size?: number; search?: string }) =>
    api.get<PaginatedResult<AdminOrg>>(`/admin/organizations?${new URLSearchParams(
      Object.entries({
        page: params?.page?.toString() || '',
        page_size: params?.page_size?.toString() || '',
        search: params?.search || '',
      }).filter(([, value]) => value !== '')
    ).toString()}`),
  organizationDetail: (organizationId: string) => api.get<AdminOrganizationDetail>(`/admin/organizations/${organizationId}`),
  clients: (params?: { page?: number; page_size?: number; search?: string; scope?: string }) =>
    api.get<PaginatedResult<AdminClient>>(`/admin/clients?${new URLSearchParams(
      Object.entries({
        page: params?.page?.toString() || '',
        page_size: params?.page_size?.toString() || '',
        search: params?.search || '',
        scope: params?.scope || '',
      }).filter(([, value]) => value !== '')
    ).toString()}`),
  clientDetail: (clientId: string) => api.get<AdminClientDetail>(`/admin/clients/${clientId}`),
  rotateClientSecret: (clientId: string) =>
    api.post<RotateClientSecretResponse>(`/admin/clients/${clientId}/rotate-secret`, {}),
  updateClientStatus: (clientId: string, status: 'active' | 'suspended') =>
    api.patch<AdminClient>(`/admin/clients/${clientId}/status`, { status }),
  deleteClient: (clientId: string) =>
    api.delete<{ ok: boolean }>(`/admin/clients/${clientId}`),
  updateUserRole: (userId: string, role: 'platform_admin' | 'user') =>
    api.patch<AdminUser>(`/admin/users/${userId}/role`, { role }),
  auditLogs: (params?: { page?: number; page_size?: number; search?: string; action?: string; date_from?: string; date_to?: string }) =>
    api.get<PaginatedResult<AdminAuditLog>>(`/admin/audit-logs?${new URLSearchParams(
      Object.entries({
        page: params?.page?.toString() || '',
        page_size: params?.page_size?.toString() || '',
        search: params?.search || '',
        action: params?.action || '',
        date_from: params?.date_from || '',
        date_to: params?.date_to || '',
      }).filter(([, value]) => value !== '')
    ).toString()}`),
  tenantMembers: (params?: { page?: number; page_size?: number; search?: string; role?: 'all' | 'admin' | 'user' }) =>
    api.get<PaginatedResult<AdminTenantMember>>(`/admin/tenant/members?${new URLSearchParams(
      Object.entries({
        page: params?.page?.toString() || '',
        page_size: params?.page_size?.toString() || '',
        search: params?.search || '',
        role: params?.role || '',
      }).filter(([, value]) => value !== '')
    ).toString()}`),
  workspaceAuditLogs: (orgId: string, params?: { page?: number; page_size?: number; search?: string; action?: string; date_from?: string; date_to?: string }) =>
    api.get<PaginatedResult<AdminAuditLog>>(`/admin/organizations/${orgId}/audit-logs?${new URLSearchParams(
      Object.entries({
        page: params?.page?.toString() || '',
        page_size: params?.page_size?.toString() || '',
        search: params?.search || '',
        action: params?.action || '',
        date_from: params?.date_from || '',
        date_to: params?.date_to || '',
      }).filter(([, value]) => value !== '')
    ).toString()}`),
  tenantAuditLogs: (params?: { page?: number; page_size?: number; search?: string; action?: string; date_from?: string; date_to?: string }) =>
    api.get<PaginatedResult<AdminAuditLog>>(`/admin/tenant/audit-logs?${new URLSearchParams(
      Object.entries({
        page: params?.page?.toString() || '',
        page_size: params?.page_size?.toString() || '',
        search: params?.search || '',
        action: params?.action || '',
        date_from: params?.date_from || '',
        date_to: params?.date_to || '',
      }).filter(([, value]) => value !== '')
    ).toString()}`),
  tenantAccess: () => api.get<TenantAccessPolicy>('/admin/tenant-access'),
  updateTenantAccess: (payload: TenantAccessPolicy) =>
    api.patch<TenantAccessPolicy>('/admin/tenant-access', payload),
  clientGovernance: () => api.get<PlatformClientGovernance>('/admin/client-governance'),
  updateClientGovernance: (payload: PlatformClientGovernance) =>
    api.patch<PlatformClientGovernance>('/admin/client-governance', payload),
  ipPolicy: () => api.get<PlatformIpPolicy>('/admin/ip-policy'),
  updateIpPolicy: (payload: PlatformIpPolicy) =>
    api.patch<PlatformIpPolicy>('/admin/ip-policy', payload),
  workspaceGovernance: () => api.get<PlatformWorkspaceGovernance>('/admin/workspace-governance'),
  updateWorkspaceGovernance: (payload: PlatformWorkspaceGovernance) =>
    api.patch<PlatformWorkspaceGovernance>('/admin/workspace-governance', payload),
  storageConfig: () => api.get<PlatformStorageConfig>('/admin/storage-config'),
  updateStorageConfig: (payload: PlatformStorageConfigUpdate) =>
    api.patch<PlatformStorageConfig>('/admin/storage-config', payload),
  testStorage: (payload: TestStorageRequest) =>
    api.post<{ ok: boolean; message: string }>('/admin/storage-config/test', payload),
  riskPolicy: () => api.get<RiskPolicy>('/admin/risk-policy'),
  updateRiskPolicy: (payload: Partial<RiskPolicy>) =>
    api.patch<RiskPolicy>('/admin/risk-policy', payload),
  securityAlertReviews: () => api.get<{ items: SecurityAlertReview[] }>('/admin/security-alert-reviews'),
  markSecurityAlertReviewed: (alertKey: string) =>
    api.post<{ ok: boolean }>('/admin/security-alert-reviews', { alert_key: alertKey }),
  resetSecurityAlertReviews: () =>
    api.delete<{ ok: boolean }>('/admin/security-alert-reviews'),
  sessionPolicy: () => api.get<SessionPolicy>('/admin/session-policy'),
  updateSessionPolicy: (payload: Partial<SessionPolicy>) =>
    api.patch<SessionPolicy>('/admin/session-policy', payload),
  tenantSessionPolicy: () => api.get<TenantSessionPolicy>('/admin/tenant-session-policy'),
  updateTenantSessionPolicy: (payload: Partial<TenantSessionPolicy>) =>
    api.patch<TenantSessionPolicy>('/admin/tenant-session-policy', payload),
  orgSessionPolicy: (orgId: string) =>
    api.get<OrgSessionPolicy>(`/admin/organizations/${orgId}/session-policy`),
  updateOrgSessionPolicy: (orgId: string, payload: Partial<OrgSessionPolicy>) =>
    api.patch<OrgSessionPolicy>(`/admin/organizations/${orgId}/session-policy`, payload),
  orgAppGovernance: (orgId: string) =>
    api.get<TenantWorkspaceAppGovernance>(`/admin/organizations/${orgId}/app-governance`),
  updateOrgAppGovernance: (orgId: string, payload: { max_redirect_uris_per_app: number | null; max_allowed_embed_origins_per_app: number | null }) =>
    api.patch<TenantWorkspaceAppGovernance>(`/admin/organizations/${orgId}/app-governance`, payload),
}

export const setupApi = {
  status: () => api.get<SetupStatus>('/setup/status'),
  config: () => api.get<SetupConfig>('/setup/config'),
  adminAccess: () => api.get<AdminAccessPolicy>('/setup/admin-access'),
  saveOwnerDraft: (payload: { email: string; display_name: string }) =>
    api.post<{ ok: boolean; message: string; user_email: string }>('/setup/create-admin', payload),
  testDatabase: () => api.post<DatabaseStatus>('/setup/test-database', {}),
  publicUrls: () => api.get<PublicUrls>('/setup/public-urls'),
  savePublicUrls: (payload: { issuer_url: string; frontend_url: string; admin_url: string }) =>
    api.post<PublicUrls>('/setup/configure-public-urls', payload),
  testRedis: (payload: { url: string }) =>
    api.post<{ ok: boolean; message: string }>('/setup/test-redis', payload),
  storageConfig: () => api.get<PlatformStorageConfig>('/setup/storage-config'),
  saveStorageConfig: (payload: PlatformStorageConfigUpdate) =>
    api.post<PlatformStorageConfig>('/setup/storage-config', payload),
  testStorage: (payload: TestStorageRequest) =>
    api.post<{ ok: boolean; message: string }>('/setup/test-storage', payload),
}
