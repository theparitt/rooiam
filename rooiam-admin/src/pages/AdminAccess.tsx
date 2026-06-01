import { useEffect, useState } from 'react'
import { Globe, Key, Loader2, Lock, Shield } from 'lucide-react'
import { apiFetch, getApiBase } from '@/lib/api-base'
import { setupApi } from '@/lib/api'
import { getSetupAuthHeaders } from '@/lib/setup-token'
import { useAuthStore } from '@/lib/store'
import PageHeader from '@/components/ui/PageHeader'
import HintBox from '@/components/ui/HintBox'
import ContentCard from '@/components/ui/ContentCard'
import SaveActionFooter from '@/components/ui/SaveActionFooter'
import TabBar from '@/components/ui/TabBar'
import ToggleRow from '@/components/ui/ToggleRow'

type AccessTab = 'providers' | 'passkeys' | 'totp'

// ── Toggle ────────────────────────────────────────────────────────────────────

function PolicyToggle({
    checked, disabled, onChange, label, hint,
}: {
    checked: boolean; disabled?: boolean
    onChange: (v: boolean) => void; label: string; hint: string
}) {
    return (
        <ToggleRow
            checked={checked}
            disabled={disabled}
            onChange={onChange}
            label={label}
            hint={hint}
            tone="emerald"
        />
    )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminAccess() {
    const apiBase = getApiBase()
    const { user } = useAuthStore()
    const isPlatformOwner = Boolean(user?.is_platform_owner)

    const savedTab = localStorage.getItem('rooiam_tab_admin_access') as AccessTab | null
    const validTabs: AccessTab[] = ['providers', 'passkeys', 'totp']
    const [tab, setTab] = useState<AccessTab>(
        validTabs.includes(savedTab as AccessTab) ? savedTab as AccessTab : 'providers'
    )
    const handleTabChange = (t: AccessTab) => {
        setTab(t)
        localStorage.setItem('rooiam_tab_admin_access', t)
    }

    const [loading, setLoading] = useState(true)
    const [demoMode, setDemoMode] = useState(false)

    // Provider login
    const [googleConfigured, setGoogleConfigured] = useState(false)
    const [googleVerifiedAt, setGoogleVerifiedAt] = useState('')
    const [googleAdminEnabled, setGoogleAdminEnabled] = useState(false)
    const [microsoftConfigured, setMicrosoftConfigured] = useState(false)
    const [microsoftVerifiedAt, setMicrosoftVerifiedAt] = useState('')
    const [microsoftAdminEnabled, setMicrosoftAdminEnabled] = useState(false)
    const [providerDirty, setProviderDirty] = useState(false)
    const [providerSaving, setProviderSaving] = useState(false)
    const [providerError, setProviderError] = useState('')

    // Admin access policy
    const [adminPasskeyAllowed, setAdminPasskeyAllowed] = useState(true)
    const [adminRequireMfa, setAdminRequireMfa] = useState(false)
    const [policyDirty, setPolicyDirty] = useState(false)
    const [policySaving, setPolicySaving] = useState(false)
    const [policyError, setPolicyError] = useState('')

    const [loadError, setLoadError] = useState('')

    useEffect(() => {
        const load = async () => {
            try {
                const statusRes = await apiFetch(`${apiBase}/setup/status`, {
                    headers: { ...getSetupAuthHeaders() },
                })
                let isDemoMode = false
                if (statusRes.ok) {
                    const s = await statusRes.json()
                    isDemoMode = Boolean(s?.demo_mode)
                    setDemoMode(isDemoMode)
                }

                const auth = await setupApi.adminAccess()
                setGoogleConfigured(Boolean(auth.google_admin_login_enabled) || isDemoMode)
                setGoogleVerifiedAt(Boolean(auth.google_admin_login_enabled) ? 'configured' : '')
                setGoogleAdminEnabled(Boolean(auth.google_admin_login_enabled))
                setMicrosoftConfigured(Boolean(auth.microsoft_admin_login_enabled) || isDemoMode)
                setMicrosoftVerifiedAt(Boolean(auth.microsoft_admin_login_enabled) ? 'configured' : '')
                setMicrosoftAdminEnabled(Boolean(auth.microsoft_admin_login_enabled))
                setAdminPasskeyAllowed(auth.admin_passkey_allowed !== false)
                setAdminRequireMfa(Boolean(auth.admin_require_mfa))
            } catch (err) {
                setLoadError(err instanceof Error ? err.message : 'Failed to load admin access settings.')
            } finally {
                setLoading(false)
            }
        }
        void load()
    }, [apiBase])

    const saveProviderAccess = async () => {
        setPolicySaving(false)
        setProviderSaving(true)
        setProviderError('')
        try {
            const res = await apiFetch(`${apiBase}/setup/configure-oauth`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getSetupAuthHeaders() },
                body: JSON.stringify({
                    google_admin_login_enabled: googleAdminEnabled,
                    microsoft_admin_login_enabled: microsoftAdminEnabled,
                }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data?.error?.message || 'Failed to save provider access.')
            setProviderDirty(false)
        } catch (err) {
            setProviderError(err instanceof Error ? err.message : 'Failed to save provider access.')
        } finally {
            setProviderSaving(false)
        }
    }

    const saveAdminPolicy = async () => {
        setProviderSaving(false)
        setPolicySaving(true)
        setPolicyError('')
        try {
            const res = await apiFetch(`${apiBase}/setup/configure-admin-access`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getSetupAuthHeaders() },
                body: JSON.stringify({
                    admin_passkey_allowed: adminPasskeyAllowed,
                    admin_require_mfa: adminRequireMfa,
                }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data?.error?.message || 'Failed to save admin access policy.')
            setPolicyDirty(false)
        } catch (err) {
            setPolicyError(err instanceof Error ? err.message : 'Failed to save admin access policy.')
        } finally {
            setPolicySaving(false)
        }
    }

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PageHeader
                title="Admin Access"
                description="Configure how platform admins sign into the admin console. Only the platform owner can change these settings."
            />

            {/* Tab bar */}
            <TabBar
                active={tab}
                onChange={handleTabChange}
                items={[
                    { id: 'providers', label: 'Provider Login', icon: <Globe className="w-4 h-4" /> },
                    { id: 'passkeys', label: 'Passkeys', icon: <Key className="w-4 h-4" /> },
                    { id: 'totp', label: 'TOTP MFA', icon: <Shield className="w-4 h-4" /> },
                ]}
            />

            <div className="space-y-4">
                {loading ? (
                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-400 py-4">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                    </div>
                ) : loadError ? (
                    <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm font-semibold text-red-700">
                        {loadError}
                    </div>
                ) : (
                    <>
                        {demoMode && (
                            <HintBox title="Sign-in methods are locked in demo mode" tone="amber">
                                Seeded login flows and demo accounts remain stable.
                            </HintBox>
                        )}

                        {!isPlatformOwner && (
                            <div className="rounded-2xl border border-border bg-white px-4 py-3 shadow-sm flex items-center gap-3">
                                <Lock className="w-4 h-4 text-slate-400 shrink-0" />
                                <p className="text-xs font-semibold text-slate-500">
                                    These settings are managed by the platform owner. You can view them but not change them.
                                </p>
                            </div>
                        )}

                        {/* Provider Login */}
                        {tab === 'providers' && (
                            <ContentCard
                                title="Provider Login"
                                subtitle="Allow Google or Microsoft sign-in on the admin console login page. OAuth credentials are configured in Platform Settings."
                                icon={Globe}
                                className="space-y-4"
                            >
                                <div className="space-y-3">
                                    <PolicyToggle
                                        checked={googleAdminEnabled}
                                        disabled={!isPlatformOwner || demoMode || !googleConfigured || !googleVerifiedAt}
                                        onChange={v => { setGoogleAdminEnabled(v); setProviderDirty(true) }}
                                        label="Allow Google sign-in"
                                        hint={demoMode
                                            ? 'Demo mode keeps Google sign-in enabled on the admin login page.'
                                            : !googleConfigured
                                            ? 'Enable Google in Platform Settings > OAuth Providers first.'
                                            : !googleVerifiedAt
                                                ? 'Google is not ready yet.'
                                                : 'Google is verified and ready for admin console sign-in.'}
                                    />
                                    <PolicyToggle
                                        checked={microsoftAdminEnabled}
                                        disabled={!isPlatformOwner || demoMode || !microsoftConfigured || !microsoftVerifiedAt}
                                        onChange={v => { setMicrosoftAdminEnabled(v); setProviderDirty(true) }}
                                        label="Allow Microsoft sign-in"
                                        hint={demoMode
                                            ? 'Demo mode keeps Microsoft sign-in enabled on the admin login page.'
                                            : !microsoftConfigured
                                            ? 'Enable Microsoft in Platform Settings > OAuth Providers first.'
                                            : !microsoftVerifiedAt
                                                ? 'Microsoft is not ready yet.'
                                                : 'Microsoft is verified and ready for admin console sign-in.'}
                                    />
                                </div>
                                {isPlatformOwner && (
                                    <SaveActionFooter
                                        error={providerError}
                                        loading={providerSaving}
                                        dirty={providerDirty}
                                        onClick={saveProviderAccess}
                                        disabled={demoMode || providerSaving}
                                    />
                                )}
                            </ContentCard>
                        )}

                        {/* Passkeys */}
                        {tab === 'passkeys' && (
                            <ContentCard
                                title="Passkeys"
                                subtitle="Control whether platform admins can register and use passkeys to sign in. When allowed, each admin sets up their own passkey in MY > Account."
                                icon={Key}
                                className="space-y-4"
                            >
                                <PolicyToggle
                                    checked={adminPasskeyAllowed}
                                    disabled={!isPlatformOwner || demoMode}
                                    onChange={v => { setAdminPasskeyAllowed(v); setPolicyDirty(true) }}
                                    label="Allow passkey sign-in for admin console"
                                    hint="When enabled, admins can add their own passkeys in MY > Account. When disabled, passkeys are blocked on the admin login page."
                                />
                                <HintBox tone="sky" title="How passkey policy works">
                                    This toggle controls whether passkeys are accepted on the admin login page.
                                    Disabling it blocks passkey sign-in immediately for everyone.
                                    Each admin manages their own passkeys under <strong>MY &gt; Account</strong> — removing a passkey there permanently deletes that credential.
                                </HintBox>
                                {isPlatformOwner && (
                                    <SaveActionFooter
                                        error={policyError}
                                        loading={policySaving}
                                        dirty={policyDirty}
                                        onClick={saveAdminPolicy}
                                        disabled={demoMode || policySaving}
                                    />
                                )}
                            </ContentCard>
                        )}

                        {/* TOTP MFA */}
                        {tab === 'totp' && (
                            <ContentCard
                                title="TOTP MFA"
                                subtitle="Control whether TOTP MFA is required for admin console sign-in. Each admin sets up their own TOTP authenticator in MY > Account."
                                icon={Shield}
                                className="space-y-4"
                            >
                                <PolicyToggle
                                    checked={adminRequireMfa}
                                    disabled={!isPlatformOwner || demoMode}
                                    onChange={v => { setAdminRequireMfa(v); setPolicyDirty(true) }}
                                    label="Require MFA for admin console"
                                    hint="When enabled, all platform admins must complete TOTP verification every time they sign in. They will be prompted to enroll if not set up yet."
                                />
                                <HintBox tone="sky" title="How TOTP policy works">
                                    This toggle controls whether MFA is <strong>required</strong> at login.
                                    Turning it off stops forcing new admins to enroll, but admins who already have TOTP set up will still be prompted — their authenticator app is a personal credential, not removed by this policy.
                                    To fully remove TOTP from a specific account, that admin must go to <strong>MY &gt; Security</strong> and remove their authenticator app.
                                </HintBox>
                                {isPlatformOwner && (
                                    <SaveActionFooter
                                        error={policyError}
                                        loading={policySaving}
                                        dirty={policyDirty}
                                        onClick={saveAdminPolicy}
                                        disabled={demoMode || policySaving}
                                    />
                                )}
                            </ContentCard>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
