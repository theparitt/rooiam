import { apiFetch, getApiBase } from './api-base'
import { RooiamBrowser, RooiamError } from '@rooiam/sdk-browser'

// --- SDK transport ----------------------------------------------------------
// Every tenantAuthApi method runs over @rooiam/sdk-browser (cookie session).
// `viaSdk` maps the SDK's RooiamError back to the error sentinels the existing
// call sites already catch, so the public contract is unchanged:
//   401 -> Error('UNAUTHORIZED'),  429 -> Error('RATE_LIMITED'),
//   other non-2xx -> Error(server message),  network -> Error('Could not reach ...').

let _sdk: RooiamBrowser | null = null
function sdk(): RooiamBrowser {
    if (!_sdk) _sdk = new RooiamBrowser({ apiBase: getApiBase() })
    return _sdk
}

/** Run an SDK call, mapping RooiamError back to the legacy error sentinels. */
async function viaSdk<T>(call: (s: RooiamBrowser) => Promise<T>): Promise<T> {
    try {
        return await call(sdk())
    } catch (err) {
        if (err instanceof RooiamError) {
            if (err.status === 401) throw new Error('UNAUTHORIZED')
            if (err.status === 429) throw new Error('RATE_LIMITED')
            throw new Error(err.message || 'Request failed')
        }
        if (err instanceof TypeError) {
            throw new Error(`Could not reach ${getApiBase()}. Check that the Rooiam API is running.`)
        }
        throw err
    }
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
    updateProfile: async (payload: { display_name?: string | null; avatar_url?: string | null }): Promise<TenantProfile> => {
        try {
            const res = await apiFetch(`${getApiBase()}/identity/me/profile`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })

            const data = await res.json().catch(() => ({})) as
                | (TenantProfile & { error?: { message?: string } })
                | { error?: { message?: string } }
                | undefined

            if (res.status === 401) {
                throw new Error('UNAUTHORIZED')
            }
            if (res.status === 429) {
                throw new Error('RATE_LIMITED')
            }
            if (!res.ok || !data || typeof data !== 'object' || !('id' in data)) {
                throw new Error(data?.error?.message || 'Could not save profile.')
            }

            return data as TenantProfile
        } catch (err) {
            if (err instanceof TypeError) {
                throw new Error(`Could not reach ${getApiBase()}. The browser blocked the profile update request before the API responded.`)
            }
            throw err
        }
    },
    uploadAvatar: async (file: File): Promise<{ url: string; user: TenantProfile }> => {
        const formData = new FormData()
        formData.append('file', file, file.name)

        try {
            const res = await apiFetch(`${getApiBase()}/identity/me/avatar/upload`, {
                method: 'POST',
                body: formData,
            })

            const data = await res.json().catch(() => ({})) as
                | { url?: string; user?: TenantProfile; error?: { message?: string } }
                | undefined

            if (res.status === 401) {
                throw new Error('UNAUTHORIZED')
            }
            if (res.status === 429) {
                throw new Error('RATE_LIMITED')
            }
            if (!res.ok || !data?.url || !data.user) {
                throw new Error(data?.error?.message || 'Could not upload avatar.')
            }

            return { url: data.url, user: data.user }
        } catch (err) {
            if (err instanceof TypeError) {
                throw new Error(`Could not upload to ${getApiBase()}. The API, proxy, or browser blocked this upload request.`)
            }
            throw err
        }
    },
    passkeys: () => viaSdk((s) => s.passkeys.list() as Promise<TenantPasskey[]>),
    startPasskeyRegistration: () =>
        viaSdk((s) => s.passkeys.registerStart() as Promise<{ challenge_id: string; creation_options: { publicKey: unknown } }>),
    finishPasskeyRegistration: (payload: { challenge_id: string; name: string; credential: unknown }) =>
        viaSdk((s) => s.passkeys.registerFinish(payload) as Promise<{ ok: boolean; id: string; name: string }>),
    deletePasskey: (id: string) =>
        viaSdk((s) => s.passkeys.delete(id) as Promise<{ ok: boolean; message: string }>),
    renamePasskey: (id: string, name: string) =>
        viaSdk((s) => s.passkeys.rename(id, name) as Promise<{ ok: boolean; name: string }>),
    mfaStatus: () => viaSdk((s) => s.mfa.status() as Promise<TenantMfaStatus>),
    startTotpEnrollment: () =>
        viaSdk((s) => s.mfa.totpStart() as Promise<{ challenge_id: string; secret: string; otpauth_uri: string }>),
    finishTotpEnrollment: (payload: { challenge_id: string; code: string }) =>
        viaSdk((s) => s.mfa.totpFinish(payload.challenge_id, payload.code) as Promise<{ ok: boolean; backup_codes: string[] }>),
    disableTotp: () =>
        viaSdk((s) => s.mfa.disableTotp() as Promise<{ ok: boolean; disabled: boolean }>),
    regenerateRecoveryCodes: () =>
        viaSdk((s) => s.mfa.regenerateBackupCodes() as Promise<{ codes: string[]; remaining: number }>),
    linkedAccounts: () => viaSdk((s) => s.account.linkedAccounts() as Promise<TenantLinkedAccounts>),
    startLinkProvider: (provider: 'google' | 'microsoft', redirect_uri?: string) =>
        viaSdk((s) => s.account.startLink(provider, redirect_uri) as Promise<{ authorization_url: string }>),
    unlinkProvider: (provider: 'google' | 'microsoft') =>
        viaSdk((s) => s.account.unlink(provider) as Promise<{ ok: boolean; message: string }>),
    sessions: () => viaSdk((s) => s.sessions.list() as Promise<TenantSession[]>),
    revokeSession: (id: string) =>
        viaSdk((s) => s.sessions.revoke(id) as Promise<{ ok: boolean; message: string }>),
    revokeOtherSessions: () =>
        viaSdk((s) => s.sessions.revokeAll() as Promise<{ ok: boolean; revoked_count: number }>),
    auditLogs: (page = 1, pageSize = 25) =>
        viaSdk((s) => s.account.auditLogs({ page, page_size: pageSize }) as Promise<{ items: TenantAuditLog[]; total: number }>),
    requestEmailChange: (new_email: string) =>
        viaSdk((s) => s.account.requestEmailChange(new_email) as Promise<{ ok: boolean; message: string }>),
    verifyEmailChange: (token: string) =>
        viaSdk((s) => s.account.verifyEmailChange(token) as Promise<{ ok: boolean; message: string; new_email: string }>),
    requestDeleteAccount: () =>
        viaSdk((s) => s.account.requestDelete() as Promise<{ ok: boolean; message: string }>),
    confirmDeleteAccount: (token: string) =>
        viaSdk((s) => s.account.confirmDelete(token) as Promise<{ ok: boolean; message: string }>),
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
