import { getApiBase } from './api-base'

async function authFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const apiBase = getApiBase()
    let response: Response
    try {
        response = await fetch(`${apiBase}${path}`, {
            ...options,
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {}),
            },
        })
    } catch (err) {
        if (err instanceof TypeError) {
            throw new Error(`Could not reach ${apiBase}. Check that the Rooiam API is running.`)
        }
        throw err
    }

    if (response.status === 401) { throw new Error('UNAUTHORIZED') }
    if (response.status === 429) throw new Error('RATE_LIMITED')

    if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.error?.message || data?.message || response.statusText || 'Request failed')
    }

    if (response.status === 204) {
        return {} as T
    }

    return response.json()
}

export type TenantPasskey = {
    id: string
    name: string
    aaguid: string | null
    transports: unknown[]
    sign_count: number
    last_used_at: string | null
    created_at: string
}

export type TenantMfaStatus = {
    totp_enabled: boolean
    backup_codes_remaining: number
}

export type TenantLinkedProvider = {
    provider: string
    linked: boolean
    linked_email: string | null
}

export type TenantLinkedAccounts = {
    primary_email: string | null
    magic_link: {
        enabled: boolean
    }
    providers: TenantLinkedProvider[]
    passkeys: number
    totp_enabled: boolean
}

export type TenantProfile = {
    id: string
    email: string | null
    display_name: string | null
    avatar_url: string | null
    status: string
    created_at: string
    updated_at: string
}

export const tenantAuthApi = {
    updateProfile: (payload: { display_name?: string | null; avatar_url?: string | null }) =>
        authFetch<TenantProfile>('/identity/me/profile', {
            method: 'PATCH',
            body: JSON.stringify(payload),
        }),
    uploadAvatar: async (file: File) => {
        const apiBase = getApiBase()
        const formData = new FormData()
        formData.append('file', file)

        const response = await fetch(`${apiBase}/identity/me/avatar/upload`, {
            method: 'POST',
            credentials: 'include',
            body: formData,
        })

        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
            throw new Error(data?.error?.message || data?.message || 'Could not upload avatar.')
        }

        return data as { url: string; user: TenantProfile }
    },
    passkeys: () => authFetch<TenantPasskey[]>('/webauthn/passkeys'),
    startPasskeyRegistration: () =>
        authFetch<{ challenge_id: string; creation_options: { publicKey: unknown } }>('/webauthn/register/start', {
            method: 'POST',
            body: JSON.stringify({}),
        }),
    finishPasskeyRegistration: (payload: { challenge_id: string; name: string; credential: unknown }) =>
        authFetch<{ ok: boolean; id: string; name: string }>('/webauthn/register/finish', {
            method: 'POST',
            body: JSON.stringify(payload),
        }),
    deletePasskey: (id: string) =>
        authFetch<{ ok: boolean; message: string }>(`/webauthn/passkeys/${id}`, { method: 'DELETE' }),
    renamePasskey: (id: string, name: string) =>
        authFetch<{ ok: boolean; name: string }>(`/webauthn/passkeys/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ name }),
        }),
    mfaStatus: () => authFetch<TenantMfaStatus>('/mfa/status'),
    startTotpEnrollment: () =>
        authFetch<{ challenge_id: string; secret: string; otpauth_uri: string }>('/mfa/totp/start', {
            method: 'POST',
            body: JSON.stringify({}),
        }),
    finishTotpEnrollment: (payload: { challenge_id: string; code: string }) =>
        authFetch<{ ok: boolean; backup_codes: string[] }>('/mfa/totp/finish', {
            method: 'POST',
            body: JSON.stringify(payload),
        }),
    disableTotp: () =>
        authFetch<{ ok: boolean; disabled: boolean }>('/mfa/totp', { method: 'DELETE' }),
    regenerateRecoveryCodes: () =>
        authFetch<{ codes: string[]; remaining: number }>('/mfa/recovery-codes/regenerate', {
            method: 'POST',
            body: JSON.stringify({}),
        }),
    linkedAccounts: () => authFetch<TenantLinkedAccounts>('/identity/me/linked-accounts'),
    startLinkProvider: (provider: 'google' | 'microsoft', redirect_uri?: string) =>
        authFetch<{ authorization_url: string }>(`/identity/me/linked-accounts/${provider}/start`, {
            method: 'POST',
            body: JSON.stringify({ redirect_uri }),
        }),
    unlinkProvider: (provider: 'google' | 'microsoft') =>
        authFetch<{ ok: boolean; message: string }>(`/identity/me/linked-accounts/${provider}`, {
            method: 'DELETE',
        }),
    sessions: () => authFetch<TenantSession[]>('/identity/me/sessions'),
    revokeSession: (id: string) =>
        authFetch<{ ok: boolean; message: string }>(`/identity/me/sessions/${id}`, { method: 'DELETE' }),
    revokeOtherSessions: () =>
        authFetch<{ ok: boolean; revoked_count: number }>('/identity/me/sessions/revoke-all', { method: 'POST' }),
    auditLogs: (page = 1, pageSize = 25) =>
        authFetch<{ items: TenantAuditLog[]; total: number }>(`/identity/me/audit-logs?page=${page}&page_size=${pageSize}`),
    requestEmailChange: (new_email: string) =>
        authFetch<{ ok: boolean; message: string }>('/identity/me/email-change/request', {
            method: 'POST',
            body: JSON.stringify({ new_email }),
        }),
    verifyEmailChange: (token: string) =>
        authFetch<{ ok: boolean; message: string; new_email: string }>('/identity/me/email-change/verify', {
            method: 'POST',
            body: JSON.stringify({ token }),
        }),
    requestDeleteAccount: () =>
        authFetch<{ ok: boolean; message: string }>('/identity/me/delete/request', { method: 'POST' }),
    confirmDeleteAccount: (token: string) =>
        authFetch<{ ok: boolean; message: string }>('/identity/me/delete/confirm', {
            method: 'DELETE',
            body: JSON.stringify({ token }),
        }),
}

export type TenantSession = {
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

export type TenantAuditLog = {
    id: number
    actor_user_id: string | null
    actor_email: string | null
    action: string
    target_type: string
    target_id: string | null
    ip: string | null
    user_agent: string | null
    metadata: Record<string, unknown>
    created_at: string
}
