import React from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, Check, Eye, EyeOff, Globe, Key, Loader2, Settings } from 'lucide-react'
import PortalPageHeader from '../../components/portal/PortalPageHeader'
import PortalHelpTooltip from '../../components/portal/PortalHelpTooltip'
import PortalSectionCard from '../../components/portal/PortalSectionCard'
import PortalTabBar from '../../components/portal/PortalTabBar'
import PortalToggleRow from '../../components/portal/PortalToggleRow'
import { apiFetch, getApiBase } from '../../lib/api-base'

// ── Types ─────────────────────────────────────────────────────────────────────

type AuthConfig = {
    google_configured: boolean
    google_client_id: string | null
    microsoft_configured: boolean
    microsoft_client_id: string | null
    microsoft_tenant_id: string | null
}

type GoogleForm = { client_id: string; client_secret: string }
type MicrosoftForm = { client_id: string; client_secret: string; tenant_id: string }
type Tab = 'google' | 'microsoft'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getOAuthCallbackUrl(provider: 'google' | 'microsoft', issuerUrl: string): string {
    return `${issuerUrl.replace(/\/+$/, '')}/api/v1/auth/${provider}/callback`
}


function Field({
    label, value, onChange, placeholder, type = 'text', mono = false, disabled = false,
}: {
    label: string; value: string; onChange: (v: string) => void
    placeholder?: string; type?: string; mono?: boolean; disabled?: boolean
}) {
    return (
        <div className="space-y-1">
            <label className="text-xs font-black text-gray-600">{label}</label>
            <input
                type={type}
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                disabled={disabled}
                className={`w-full rounded-2xl border-2 border-border bg-card px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary transition-all disabled:opacity-40 disabled:cursor-not-allowed ${mono ? 'font-mono' : 'font-medium'}`}
            />
        </div>
    )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PortalTenantSettings() {
    const API = getApiBase()
    const [searchParams, setSearchParams] = useSearchParams()

    const [tab, setTab] = React.useState<Tab>(() =>
        (localStorage.getItem('rooiam_tab_tenant_settings') as Tab) || 'google'
    )
    const [loading, setLoading] = React.useState(true)
    const [testing, setTesting] = React.useState<'google' | 'microsoft' | null>(null)
    const [clearing, setClearing] = React.useState<'google' | 'microsoft' | null>(null)
    const [error, setError] = React.useState('')
    const [successMsg, setSuccessMsg] = React.useState('')

    // Derive issuer URL from API base (strip trailing /v1 path segment)
    const issuerUrl = React.useMemo(() => {
        try { return new URL('..', API).toString().replace(/\/+$/, '') } catch { return window.location.origin }
    }, [API])
    const portalAppUrl = window.location.origin

    const [config, setConfig] = React.useState<AuthConfig | null>(null)

    // Override toggles
    const [googleOverride, setGoogleOverride] = React.useState(false)
    const [microsoftOverride, setMicrosoftOverride] = React.useState(false)

    // Form state
    const [google, setGoogle] = React.useState<GoogleForm>({ client_id: '', client_secret: '' })
    const [microsoft, setMicrosoft] = React.useState<MicrosoftForm>({ client_id: '', client_secret: '', tenant_id: 'common' })

    // Saved state — used for dirty detection
    const [savedGoogle, setSavedGoogle] = React.useState<GoogleForm>({ client_id: '', client_secret: '' })
    const [savedMicrosoft, setSavedMicrosoft] = React.useState<MicrosoftForm>({ client_id: '', client_secret: '', tenant_id: 'common' })

    const [showGoogleSecret, setShowGoogleSecret] = React.useState(false)
    const [showMsSecret, setShowMsSecret] = React.useState(false)

    const handleTabChange = (t: Tab) => {
        setTab(t)
        localStorage.setItem('rooiam_tab_tenant_settings', t)
        setError('')
        setSuccessMsg('')
    }

    // ── Load ──────────────────────────────────────────────────────────────────

    const loadConfig = React.useCallback(async () => {
        setLoading(true)
        setError('')
        try {
            const configRes = await apiFetch(`${API}/orgs/current/auth-config`)
            if (!configRes.ok) {
                const d = await configRes.json().catch(() => ({}))
                throw new Error((d as { error?: { message?: string } }).error?.message || `Could not load settings (${configRes.status}).`)
            }
            const configData = await configRes.json() as AuthConfig
            setConfig(configData)

            const gForm: GoogleForm = { client_id: configData.google_client_id || '', client_secret: '' }
            const mForm: MicrosoftForm = { client_id: configData.microsoft_client_id || '', client_secret: '', tenant_id: configData.microsoft_tenant_id || 'common' }
            setGoogle(gForm)
            setSavedGoogle(gForm)
            setMicrosoft(mForm)
            setSavedMicrosoft(mForm)
            setGoogleOverride(configData.google_configured)
            setMicrosoftOverride(configData.microsoft_configured)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not load OAuth settings.')
        } finally {
            setLoading(false)
        }
    }, [API])

    React.useEffect(() => { void loadConfig() }, [loadConfig])

    // ── Handle OAuth callback return ──────────────────────────────────────────
    // After "Test & Save", Google/Microsoft redirects back to:
    // /tenant/settings?oauth_test_provider=google&oauth_test_result=success

    React.useEffect(() => {
        const provider = searchParams.get('oauth_test_provider')
        const result = searchParams.get('oauth_test_result')
        if (!provider || (provider !== 'google' && provider !== 'microsoft')) return

        const next = new URLSearchParams(searchParams)
        next.delete('oauth_test_provider')
        next.delete('oauth_test_result')
        setSearchParams(next, { replace: true })

        if (result === 'success') {
            setSuccessMsg(`${provider === 'google' ? 'Google' : 'Microsoft'} verification passed — credentials saved.`)
            setTab(provider as Tab)
            void loadConfig()
        } else {
            setError(`${provider === 'google' ? 'Google' : 'Microsoft'} verification failed. Check your credentials and try again.`)
            setTab(provider as Tab)
        }
        setTesting(null)
    }, [searchParams, setSearchParams, loadConfig])

    // ── Dirty detection ───────────────────────────────────────────────────────
    // Secret field is always blank on load (server never returns it).
    // Any typing in the secret field = dirty.

    const googleDirty =
        google.client_id !== savedGoogle.client_id ||
        google.client_secret.length > 0

    const microsoftDirty =
        microsoft.client_id !== savedMicrosoft.client_id ||
        microsoft.client_secret.length > 0 ||
        microsoft.tenant_id !== savedMicrosoft.tenant_id

    // "Can test" = override on + client_id filled + (new secret typed OR secret already saved)
    const googleCanTest =
        googleOverride &&
        google.client_id.trim().length > 0 &&
        (google.client_secret.trim().length > 0 || (config?.google_configured ?? false))

    const msCanTest =
        microsoftOverride &&
        microsoft.client_id.trim().length > 0 &&
        (microsoft.client_secret.trim().length > 0 || (config?.microsoft_configured ?? false))

    // Test & Save button active only when dirty AND inputs are valid
    const googleTestEnabled = googleDirty && googleCanTest
    const msTestEnabled = microsoftDirty && msCanTest

    // ── Test & Save ───────────────────────────────────────────────────────────

    const startTest = async (provider: 'google' | 'microsoft') => {
        setError('')
        setSuccessMsg('')
        setTesting(provider)

        const returnUrl = (() => {
            const base = (portalAppUrl || window.location.origin).replace(/\/+$/, '')
            const url = new URL(`${base}/tenant/settings`)
            url.searchParams.set('oauth_test_provider', provider)
            return url.toString()
        })()

        try {
            const body = provider === 'google'
                ? { provider, client_id: google.client_id.trim(), client_secret: google.client_secret.trim(), redirect_uri: returnUrl }
                : { provider, client_id: microsoft.client_id.trim(), client_secret: microsoft.client_secret.trim(), tenant_id: microsoft.tenant_id.trim() || 'common', redirect_uri: returnUrl }

            const res = await apiFetch(`${API}/orgs/current/auth-config/prepare-oauth-verification`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            if (!res.ok) {
                const d = await res.json().catch(() => ({}))
                throw new Error((d as { error?: { message?: string } }).error?.message || `Could not start verification (${res.status}).`)
            }
            const data = await res.json() as { authorization_url: string }
            window.location.href = data.authorization_url
        } catch (err) {
            setTesting(null)
            setError(err instanceof Error ? err.message : 'Could not start OAuth verification.')
        }
    }

    // ── Remove override ───────────────────────────────────────────────────────

    const clearProvider = async (provider: 'google' | 'microsoft') => {
        setClearing(provider)
        setError('')
        setSuccessMsg('')
        try {
            const body = provider === 'google' ? { clear_google: true } : { clear_microsoft: true }
            const res = await apiFetch(`${API}/orgs/current/auth-config`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            if (!res.ok) {
                const d = await res.json().catch(() => ({}))
                throw new Error((d as { error?: { message?: string } }).error?.message || `Clear failed (${res.status}).`)
            }
            setSuccessMsg(`${provider === 'google' ? 'Google' : 'Microsoft'} override removed. Platform default will be used.`)
            await loadConfig()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Clear failed.')
        } finally {
            setClearing(null)
        }
    }

    const handleToggle = (provider: 'google' | 'microsoft', enabled: boolean) => {
        if (provider === 'google') {
            setGoogleOverride(enabled)
            if (!enabled && config?.google_configured) void clearProvider('google')
        } else {
            setMicrosoftOverride(enabled)
            if (!enabled && config?.microsoft_configured) void clearProvider('microsoft')
        }
        setError('')
        setSuccessMsg('')
    }

    // ── Derived ───────────────────────────────────────────────────────────────

    const googleCallbackUrl = getOAuthCallbackUrl('google', issuerUrl)
    const microsoftCallbackUrl = getOAuthCallbackUrl('microsoft', issuerUrl)

    const VerifiedBadge = ({ configured }: { configured: boolean }) => configured
        ? <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-black text-green-700"><Check className="h-3.5 w-3.5" /> Verified &amp; saved</span>
        : <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">Using platform default</span>

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PortalPageHeader
                eyebrow="Tenant"
                title={<>Tenant Settings <PortalHelpTooltip text="Override platform-level OAuth credentials for this tenant. Only workspace owners can see this section." /></>}
                description="Set custom Google or Microsoft OAuth credentials. When set, your workspaces use your own registered app instead of the platform default."
            />

            <PortalSectionCard
                icon={Settings}
                title="OAuth Provider Overrides"
                subtitle="Enable the override toggle to enter credentials. Test & Save runs a live verification — credentials are saved only after a successful test."
                action={<span className="cute-badge border border-amber-200 bg-amber-50 font-bold text-amber-700">Owner only</span>}
                bodyClassName=""
            >
                <div className="px-4 py-3 sm:px-5">
                    <PortalTabBar
                        active={tab}
                        onChange={handleTabChange}
                        items={[
                            { id: 'google', label: 'Google' },
                            { id: 'microsoft', label: 'Microsoft' },
                        ]}
                    />
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-16 text-muted-foreground">
                        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading OAuth settings…
                    </div>
                ) : (
                    <div className="px-4 pb-5 sm:px-5 space-y-5">

                        {/* ── Google ── */}
                        {tab === 'google' && (
                            <div className="rounded-3xl border border-border bg-white p-5 shadow-sm space-y-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-center gap-2.5">
                                        <Globe className="w-5 h-5 text-blue-500" />
                                        <span className="font-black text-gray-800">Google OAuth2</span>
                                    </div>
                                    <VerifiedBadge configured={config?.google_configured ?? false} />
                                </div>

                                {/* Toggle */}
                                <PortalToggleRow
                                    label="Override platform credentials"
                                    hint="Use your own Google OAuth app instead of the shared platform app."
                                    checked={googleOverride}
                                    onChange={v => handleToggle('google', v)}
                                    disabled={testing !== null || clearing !== null}
                                />

                                {/* Fields shown only when override is on */}
                                {googleOverride && (
                                    <div className="space-y-3">
                                        <Field
                                            label="Client ID"
                                            value={google.client_id}
                                            onChange={v => setGoogle(g => ({ ...g, client_id: v }))}
                                            placeholder="xxxx.apps.googleusercontent.com"
                                            mono
                                        />
                                        <Field
                                            label="Client Secret"
                                            value={google.client_secret}
                                            onChange={v => setGoogle(g => ({ ...g, client_secret: v }))}
                                            placeholder={config?.google_configured ? '••••••••  (leave blank to keep existing)' : 'GOCSPX-...'}
                                            type={showGoogleSecret ? 'text' : 'password'}
                                            mono
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowGoogleSecret(v => !v)}
                                            className="inline-flex items-center gap-2 text-xs font-black text-gray-500 hover:text-gray-700"
                                        >
                                            {showGoogleSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            {showGoogleSecret ? 'Hide secret' : 'Show secret'}
                                        </button>

                                        <p className="text-xs font-semibold text-gray-400">
                                            Register this callback URL in Google Cloud Console:{' '}
                                            <code className="font-mono text-pink-500 text-xs break-all">{googleCallbackUrl}</code>
                                        </p>

                                        <div className="flex flex-wrap items-center gap-2 pt-1">
                                            <button
                                                type="button"
                                                onClick={() => void startTest('google')}
                                                disabled={!googleTestEnabled || testing !== null}
                                                title={
                                                    !googleOverride ? 'Enable override first' :
                                                    !googleDirty ? 'No changes to test — edit fields first' :
                                                    !googleCanTest ? 'Fill in Client ID and Client Secret first' : ''
                                                }
                                                className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-black text-white shadow-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                {testing === 'google'
                                                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Redirecting to Google…</>
                                                    : <><Check className="h-4 w-4" /> Test &amp; Save</>
                                                }
                                            </button>

                                            {config?.google_configured && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggle('google', false)}
                                                    disabled={clearing !== null || testing !== null}
                                                    className="inline-flex items-center gap-2 rounded-2xl border-2 border-rose-200 bg-rose-50 px-5 py-2.5 text-sm font-black text-rose-700 hover:bg-rose-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                >
                                                    {clearing === 'google' ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                                                    Remove override
                                                </button>
                                            )}
                                        </div>

                                        {!googleDirty && config?.google_configured && (
                                            <p className="text-[11px] font-semibold text-gray-400">
                                                No changes detected. Edit Client ID or Secret to enable Test &amp; Save.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── Microsoft ── */}
                        {tab === 'microsoft' && (
                            <div className="rounded-3xl border border-border bg-white p-5 shadow-sm space-y-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-center gap-2.5">
                                        <Key className="w-5 h-5 text-blue-600" />
                                        <span className="font-black text-gray-800">Microsoft OAuth2</span>
                                    </div>
                                    <VerifiedBadge configured={config?.microsoft_configured ?? false} />
                                </div>

                                {/* Toggle */}
                                <PortalToggleRow
                                    label="Override platform credentials"
                                    hint="Use your own Microsoft Entra app instead of the shared platform app."
                                    checked={microsoftOverride}
                                    onChange={v => handleToggle('microsoft', v)}
                                    disabled={testing !== null || clearing !== null}
                                />

                                {microsoftOverride && (
                                    <div className="space-y-3">
                                        <Field
                                            label="Application (Client) ID"
                                            value={microsoft.client_id}
                                            onChange={v => setMicrosoft(m => ({ ...m, client_id: v }))}
                                            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                                            mono
                                        />
                                        <Field
                                            label="Client Secret"
                                            value={microsoft.client_secret}
                                            onChange={v => setMicrosoft(m => ({ ...m, client_secret: v }))}
                                            placeholder={config?.microsoft_configured ? '••••••••  (leave blank to keep existing)' : 'xxx~xxxxx'}
                                            type={showMsSecret ? 'text' : 'password'}
                                            mono
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowMsSecret(v => !v)}
                                            className="inline-flex items-center gap-2 text-xs font-black text-gray-500 hover:text-gray-700"
                                        >
                                            {showMsSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            {showMsSecret ? 'Hide secret' : 'Show secret'}
                                        </button>
                                        <Field
                                            label="Directory (Tenant) ID"
                                            value={microsoft.tenant_id}
                                            onChange={v => setMicrosoft(m => ({ ...m, tenant_id: v }))}
                                            placeholder="common"
                                            mono
                                        />
                                        <p className="text-xs font-semibold text-gray-400">
                                            Use <code className="font-mono text-pink-500">common</code> to allow any Microsoft account, or enter your Azure tenant ID to restrict to your organisation only.
                                        </p>

                                        <p className="text-xs font-semibold text-gray-400">
                                            Register this callback URL in Azure App Registration:{' '}
                                            <code className="font-mono text-pink-500 text-xs break-all">{microsoftCallbackUrl}</code>
                                        </p>

                                        <div className="flex flex-wrap items-center gap-2 pt-1">
                                            <button
                                                type="button"
                                                onClick={() => void startTest('microsoft')}
                                                disabled={!msTestEnabled || testing !== null}
                                                title={
                                                    !microsoftOverride ? 'Enable override first' :
                                                    !microsoftDirty ? 'No changes to test — edit fields first' :
                                                    !msCanTest ? 'Fill in Client ID and Client Secret first' : ''
                                                }
                                                className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-black text-white shadow-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                {testing === 'microsoft'
                                                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Redirecting to Microsoft…</>
                                                    : <><Check className="h-4 w-4" /> Test &amp; Save</>
                                                }
                                            </button>

                                            {config?.microsoft_configured && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggle('microsoft', false)}
                                                    disabled={clearing !== null || testing !== null}
                                                    className="inline-flex items-center gap-2 rounded-2xl border-2 border-rose-200 bg-rose-50 px-5 py-2.5 text-sm font-black text-rose-700 hover:bg-rose-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                >
                                                    {clearing === 'microsoft' ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                                                    Remove override
                                                </button>
                                            )}
                                        </div>

                                        {!microsoftDirty && config?.microsoft_configured && (
                                            <p className="text-[11px] font-semibold text-gray-400">
                                                No changes detected. Edit Client ID or Secret to enable Test &amp; Save.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── Feedback ── */}
                        {error && (
                            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-bold text-rose-700">{error}</p>
                        )}
                        {successMsg && (
                            <p className="rounded-2xl border border-green-200 bg-green-50 px-4 py-2.5 text-xs font-bold text-green-700">{successMsg}</p>
                        )}

                        {/* ── Footer ── */}
                        <div className="rounded-2xl border border-border bg-white px-4 py-3 text-xs font-semibold text-gray-500 shadow-sm">
                            These credentials apply to all workspaces under your tenant. Workspace admins and members cannot see or change these settings. To enable or disable Google / Microsoft sign-in per workspace, use <strong>Workspace → Access → Sign-In Policy</strong>.
                        </div>
                    </div>
                )}
            </PortalSectionCard>
        </div>
    )
}
