import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, Loader2, Eye, EyeOff, Globe, Mail, Key, Shield, AlertTriangle, Link2, HelpCircle, Database, Building2, HardDrive, ChevronDown } from 'lucide-react'
import { authApi, sysAdminApi } from '@/lib/api'
import type { ApiLinkedAccounts, ApiSession, OrgSessionPolicy, PlatformStorageConfig, PlatformStorageConfigUpdate, PlatformWorkspaceGovernance, SessionPolicy, TenantSessionPolicy as TenantSessionPolicyValue, PublicUrls, SetupConfig, StorageBackend, TestStorageRequest } from '@/lib/api'
import { apiFetch, getApiBase, getApiOrigin, getOAuthCallbackUrl } from '@/lib/api-base'
import { getSetupAuthHeaders } from '@/lib/setup-token'
import PaginationControls from '@/components/ui/PaginationControls'
import PageHeader from '@/components/ui/PageHeader'
import HintBox from '@/components/ui/HintBox'
import SectionCard from '@/components/ui/SectionCard'
import ContentCard from '@/components/ui/ContentCard'
import PrimarySaveButton from '@/components/ui/PrimarySaveButton'
import SaveActionFooter from '@/components/ui/SaveActionFooter'

type Tab = 'database' | 'urls' | 'smtp' | 'redis' | 'oauth' | 'storage' | 'workspace' | 'linked' | 'sessions' | 'security' | 'session-policy'

async function fetchSetupConfigForSignedInAdmin(apiBase: string) {
    // Do not use setupApi.* inside authenticated settings tabs.
    // setupApi goes through the global API helper, which redirects to /login on 401.
    // In settings we want to stay on-page and show an inline error instead.
    const res = await apiFetch(`${apiBase}/setup/config`, {
        headers: {
            ...getSetupAuthHeaders(),
        },
    }).catch(() => null)

    if (!res || res.status === 401 || res.status === 403) {
        return null
    }

    if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error?.message || 'Could not load setup configuration.')
    }

    return res.json()
}

async function fetchSetupPublicUrlsForSignedInAdmin(apiBase: string) {
    const res = await apiFetch(`${apiBase}/setup/public-urls`, {
        headers: {
            ...getSetupAuthHeaders(),
        },
    }).catch(() => null)

    if (!res || res.status === 401 || res.status === 403) {
        return null
    }

    if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error?.message || 'Could not load public URLs.')
    }

    return res.json() as Promise<PublicUrls>
}

async function fetchSetupStatusForAdmin(apiBase: string) {
    const res = await apiFetch(`${apiBase}/setup/status`, {
        headers: {
            ...getSetupAuthHeaders(),
        },
    }).catch(() => null)

    if (!res) {
        return null
    }

    if (!res.ok) {
        return null
    }

    return res.json() as Promise<{ demo_mode?: boolean }>
}

async function postSetupForSignedInAdmin<T>(apiBase: string, path: string, body: unknown) {
    const res = await apiFetch(`${apiBase}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...getSetupAuthHeaders(),
        },
        body: JSON.stringify(body),
    }).catch(() => null)

    if (!res) {
        throw new Error(`Could not reach ${apiBase}. Check VITE_API_URL and whether the Rooiam API is running.`)
    }

    const data = await res.json().catch(() => ({}))

    if (res.status === 401 || res.status === 403) {
        throw new Error(data?.error?.message || 'This setup operation is not available from the current admin session.')
    }

    if (!res.ok) {
        throw new Error(data?.error?.message || data?.message || 'Request failed.')
    }

    return data as T
}

// ── Shared input ─────────────────────────────────────────────────────────────

function Field({ label, type = 'text', value, onChange, placeholder, mono = false, disabled = false, maskedWhenEmpty = false }: {
    label: string; type?: string; value: string; placeholder?: string
    onChange: (v: string) => void; mono?: boolean; disabled?: boolean; maskedWhenEmpty?: boolean
})
{
    const [show, setShow] = useState(false)
    const [editingMaskedValue, setEditingMaskedValue] = useState(false)
    const isPass = type === 'password'
    const shouldShowMask = isPass && maskedWhenEmpty && !value && !editingMaskedValue
    const canReveal = isPass && !(maskedWhenEmpty && !value)
    const displayValue = shouldShowMask ? '••••••••••' : value
    return (
        <div>
            {label ? <label className="wizard-label">{label}</label> : null}
            <div className="relative">
                <input
                    type={isPass && !show ? 'password' : 'text'}
                    value={displayValue}
                    onFocus={() => {
                        if (shouldShowMask) {
                            setEditingMaskedValue(true)
                        }
                    }}
                    onBlur={() => {
                        if (!value) {
                            setEditingMaskedValue(false)
                        }
                    }}
                    onChange={e => onChange(e.target.value)}
                    placeholder={placeholder}
                    disabled={disabled}
                    className={`wizard-input ${mono ? 'font-mono' : ''} ${disabled ? 'opacity-60 cursor-not-allowed bg-gray-50' : ''}`}
                />
                {canReveal && (
                    <button type="button" onClick={() => setShow(!show)} disabled={disabled}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed">
                        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                )}
            </div>
        </div>
    )
}

function UrlsTab()
{
    const apiBase = getApiBase()
    const apiOrigin = getApiOrigin()
    const isLocalBrowser =
        typeof window === 'undefined' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1'
    const defaultUrls = {
        issuer_url: apiOrigin,
        admin_url: isLocalBrowser ? 'http://localhost:5171' : '',
        frontend_url: isLocalBrowser ? 'http://localhost:5172' : '',
    }
    const [demoMode, setDemoMode] = useState(false)
    const [form, setForm] = useState(defaultUrls)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        fetchSetupStatusForAdmin(apiBase).then(status => setDemoMode(Boolean(status?.demo_mode))).catch(() => setDemoMode(false))
        fetchSetupPublicUrlsForSignedInAdmin(apiBase)
            .then((data) => {
                if (!data) return
                setForm({
                    issuer_url: data.issuer_url || defaultUrls.issuer_url,
                    frontend_url: data.frontend_url || defaultUrls.frontend_url,
                    admin_url: data.admin_url || defaultUrls.admin_url,
                })
            })
            .catch((err: Error) => setError(err.message))
            .finally(() => setLoading(false))
    }, [apiBase])

    const set = (key: 'issuer_url' | 'frontend_url' | 'admin_url', value: string) => {
        setForm(current => ({ ...current, [key]: value }))
        setSaved(false)
    }

    const submit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (demoMode) return
        setSaving(true)
        setError('')
        try {
            const data = await postSetupForSignedInAdmin<PublicUrls>(apiBase, '/setup/configure-public-urls', form)
            setForm({
                issuer_url: data.issuer_url,
                frontend_url: data.frontend_url,
                admin_url: data.admin_url,
            })
            setSaved(true)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save public URLs.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <SectionCard
            icon={Link2}
            title="Public URLs"
            subtitle="These URLs are used in magic links, OAuth callbacks, and setup guidance. DB settings override env values after first save."
            tone="sky"
            bodyClassName="p-5"
            className="max-w-3xl"
        >
            <form onSubmit={submit} className="space-y-4">
                {demoMode ? (
                    <HintBox title="Public URL settings are locked in demo mode" level="warning">
                        Demo always uses the seeded local URLs.
                    </HintBox>
                ) : null}
                <div className="space-y-4">
                    <div>
                        <HelpLabel
                            label="API Base URL"
                            hint="The public URL of rooiam-server."
                            help="Rooiam uses this server URL as its public identity for OIDC discovery, OAuth provider callbacks, API links, and email links."
                        />
                        <Field label="" value={form.issuer_url} onChange={v => set('issuer_url', v)} disabled={demoMode} />
                    </div>
                    <div>
                        <HelpLabel
                            label="Hosted Auth / Tenant App URL"
                            hint="Where tenant owners, workspace admins, and tenant/workspace users complete sign-in."
                            help="Rooiam uses this URL for non-admin magic links, hosted auth redirects, and tenant/workspace flows. This is not the public landing page URL."
                        />
                        <Field label="" value={form.frontend_url} onChange={v => set('frontend_url', v)} disabled={demoMode} />
                    </div>
                    <div>
                        <HelpLabel
                            label="Admin App URL"
                            hint="Where platform owners and platform admins sign in."
                            help="Rooiam uses this URL when admin magic links and admin verification flows need to return a user to the platform admin console."
                        />
                        <Field label="" value={form.admin_url} onChange={v => set('admin_url', v)} disabled={demoMode} />
                    </div>
                </div>

                <div className="rounded-3xl border border-border bg-white p-5 shadow-sm">
                    <h3 className="font-black text-gray-800 mb-3">Computed OAuth Callbacks</h3>
                    <div className="space-y-2 text-[11px] font-mono text-gray-700 break-all">
                        <p>{getOAuthCallbackUrl('google', form.issuer_url || undefined)}</p>
                        <p>{getOAuthCallbackUrl('microsoft', form.issuer_url || undefined)}</p>
                    </div>
                </div>

                {loading && <p className="text-xs font-semibold text-gray-400">Loading current public URLs…</p>}
                {error && <p className="text-xs font-bold text-red-500 bg-red-50 rounded-xl px-4 py-2">{error}</p>}
                <div className="flex justify-start">
                    <PrimarySaveButton loading={saving} saved={saved && !demoMode} disabled={demoMode || saving} type="submit" />
                </div>
            </form>
        </SectionCard>
    )
}

function DatabaseSettingsTab()
{
    const apiBase = getApiBase()
    const [config, setConfig] = useState<SetupConfig | null>(null)
    const [loading, setLoading] = useState(true)
    const [checking, setChecking] = useState(false)
    const [error, setError] = useState('')
    const [status, setStatus] = useState('')

    useEffect(() => {
        fetchSetupConfigForSignedInAdmin(apiBase)
            .then(data => setConfig(data))
            .catch((err: Error) => setError(err.message))
            .finally(() => setLoading(false))
    }, [apiBase])

    const runCheck = async () => {
        setChecking(true)
        setError('')
        setStatus('')
        try {
            const data = await postSetupForSignedInAdmin<{
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
            }>(apiBase, '/setup/test-database', {})
            setStatus(data.message)
            setConfig(current => current ? {
                ...current,
                database_url_masked: data.database_url_masked,
                database_name: data.database_name,
                database_host: data.database_host,
                database_port: data.database_port,
                database_username: data.database_username,
                database_mode_target: data.database_mode_target,
                database_connection_ready: data.database_connection_ready,
                database_migration_count: data.database_migration_count,
                database_latest_migration: data.database_latest_migration,
            } : current)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Database check failed.')
        } finally {
            setChecking(false)
        }
    }

    return (
        <SectionCard
            icon={Database}
            title="Database"
            subtitle="View the current PostgreSQL target and run a read-only health check. Database connection values are managed outside the admin UI."
            tone="violet"
            bodyClassName="p-5"
            className="max-w-3xl"
        >
            <div className="space-y-4">
                <HintBox level="note" className="rounded-2xl">
                    <p className="text-xs font-bold text-slate-500 mb-3">
                        Configured from <code className="font-mono text-slate-700">ROOIAM_DATABASE_URL</code> before startup.
                    </p>
                    <p className="text-xs font-bold text-gray-400 mb-2">Current connection</p>
                    <p className="text-sm font-black text-gray-800 break-all">{config?.database_url_masked || 'Loading database configuration…'}</p>
                </HintBox>

                <div className="space-y-4">
                    <ContentCard className="p-4">
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 mb-1">Username</p>
                        <p className="text-sm font-black text-gray-800">{config?.database_username || '—'}</p>
                    </ContentCard>
                    <ContentCard className="p-4">
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 mb-1">Host</p>
                        <p className="text-sm font-black text-gray-800">{config?.database_host || '—'}{config?.database_port ? `:${config.database_port}` : ''}</p>
                    </ContentCard>
                    <ContentCard className="p-4">
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 mb-1">Database</p>
                        <p className="text-sm font-black text-gray-800">{config?.database_name || '—'}</p>
                    </ContentCard>
                </div>

                {loading && <p className="text-xs font-semibold text-gray-400">Loading database diagnostics…</p>}
                {status && <p className="text-xs font-bold text-green-700 bg-green-50 rounded-xl px-4 py-2">{status}</p>}
                {error && <p className="text-xs font-bold text-red-500 bg-red-50 rounded-xl px-4 py-2">{error}</p>}

                <div className="flex justify-start">
                    <button
                        type="button"
                        onClick={runCheck}
                        disabled={checking}
                        className="wizard-btn inline-flex items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                        Run connection check
                    </button>
                </div>
            </div>
        </SectionCard>
    )
}

function HelpLabel({ label, help, hint }: { label: string; help: string; hint?: string })
{
    const [open, setOpen] = useState(false)

    return (
        <div>
            <div className="flex items-center gap-2 mb-1.5">
                <label className="wizard-label mb-0">{label}</label>
                <button
                    type="button"
                    onClick={() => setOpen(value => !value)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label={`What is ${label}?`}
                >
                    <HelpCircle className="w-4 h-4" />
                </button>
            </div>
            {hint && <p className="text-[11px] font-semibold text-gray-400 mb-2">{hint}</p>}
            {open && (
                <div className="mb-2 rounded-2xl border border-border bg-white px-3 py-2 shadow-sm">
                    <p className="text-xs font-semibold text-gray-600">{help}</p>
                </div>
            )}
        </div>
    )
}

function StringSelectField({
    value,
    onChange,
    options,
    disabled = false,
}: {
    value: string
    onChange: (value: string) => void
    options: { label: string; value: string }[]
    disabled?: boolean
}) {
    const [open, setOpen] = useState(false)
    const active = options.find(option => option.value === value) ?? options[0]

    return (
        <div
            className="relative"
            tabIndex={disabled ? -1 : 0}
            onBlur={event => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setOpen(false)
                }
            }}
        >
            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen(current => !current)}
                className="wizard-input flex items-center justify-between gap-3 text-left disabled:cursor-not-allowed disabled:opacity-60"
                aria-haspopup="listbox"
                aria-expanded={open}
            >
                <span className="font-semibold text-gray-700">{active?.label ?? value}</span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && !disabled && (
                <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-rose-100 bg-white p-1 shadow-[0_18px_40px_-18px_rgba(15,23,42,0.35)]">
                    <div role="listbox" className="space-y-1">
                        {options.map(option => {
                            const selected = option.value === value
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    role="option"
                                    aria-selected={selected}
                                    onClick={() => {
                                        onChange(option.value)
                                        setOpen(false)
                                    }}
                                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                                        selected
                                            ? 'bg-rose-50 text-rose-700'
                                            : 'text-gray-600 hover:bg-slate-50 hover:text-gray-800'
                                    }`}
                                >
                                    <span>{option.label}</span>
                                    {selected ? <Check className="h-4 w-4 text-rose-400" /> : null}
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}

// ── SMTP Tab ─────────────────────────────────────────────────────────────────

function EmailSmtpTab()
{
    const apiBase = getApiBase()
    const [form, setForm] = useState({
        host: '',
        port: '587',
        security: 'starttls',
        insecure_tls: false,
        username: '',
        password: '',
        from_email: '',
    })
    const [demoMailboxUrl, setDemoMailboxUrl] = useState<string | null>(null)
    const [passwordConfigured, setPasswordConfigured] = useState(false)
    const [demoMode, setDemoMode] = useState(false)
    const [bootstrapping, setBootstrapping] = useState(true)
    const [error, setError] = useState('')
    const [testEmail, setTestEmail] = useState('')

    // Verification flow
    const [phase, setPhase] = useState<'config' | 'verify'>('config')
    const [code, setCode] = useState('')
    const [sending, setSending] = useState(false)
    const [verifying, setVerifying] = useState(false)
    const [saved, setSaved] = useState(false)

    const set = (k: string, v: string) => { setForm(f => ({ ...f, [k]: v })); setSaved(false); setPhase('config') }

    useEffect(() => {
        Promise.all([
            fetchSetupStatusForAdmin(apiBase),
            fetchSetupConfigForSignedInAdmin(apiBase),
        ])
            .then(([status, config]) => {
                const isDemoMode = Boolean(status?.demo_mode)
                setDemoMode(isDemoMode)
                if (config?.demo_mailbox_url?.trim()) {
                    setDemoMailboxUrl(config.demo_mailbox_url.trim())
                }
                if (isDemoMode) {
                    setForm({
                        host: config?.smtp_host || '127.0.0.1',
                        port: config?.smtp_port || '1025',
                        security: config?.smtp_security || 'none',
                        insecure_tls: config?.smtp_insecure_tls ?? false,
                        username: config?.smtp_username || '',
                        password: '',
                        from_email: config?.smtp_from_email || 'demo@rooiam.local',
                    })
                    setPasswordConfigured(false)
                    setTestEmail(current => current.trim() ? current : 'admin@rooiam.demo')
                    return
                }
                if (!config) {
                    setError('Could not load SMTP settings. Make sure you are logged in as a platform owner.')
                    return
                }
                setForm({
                    host: config.smtp_host || '',
                    port: config.smtp_port || '587',
                    security: config.smtp_security || 'starttls',
                    insecure_tls: config.smtp_insecure_tls ?? false,
                    username: config.smtp_username || '',
                    password: '',
                    from_email: config.smtp_from_email || '',
                })
                setPasswordConfigured(Boolean(config.smtp_password_configured))
                setTestEmail(current => current.trim() ? current : (config.admin_email || ''))
            })
            .catch((err) => setError(err instanceof Error ? err.message : 'Could not load SMTP settings.'))
            .finally(() => setBootstrapping(false))
    }, [])

    const sendCode = async () => {
        setSending(true)
        setError('')
        try {
            await postSetupForSignedInAdmin<{ ok: boolean }>(apiBase, '/setup/send-smtp-verification', {
                ...form,
                port: parseInt(form.port),
                test_email: testEmail,
            })
            setPhase('verify')
            setCode('')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to send code. Check your SMTP settings.')
        } finally {
            setSending(false)
        }
    }

    const verifyCode = async () => {
        setVerifying(true)
        setError('')
        try {
            await postSetupForSignedInAdmin<{ ok: boolean }>(apiBase, '/setup/verify-smtp-code', {
                code,
                ...form,
                port: parseInt(form.port),
                test_email: testEmail,
            })
            setSaved(true)
            setPhase('config')
            if (form.password.trim()) {
                setPasswordConfigured(true)
                setForm(current => ({ ...current, password: '' }))
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Incorrect or expired code.')
        } finally {
            setVerifying(false)
        }
    }

    return (
        <SectionCard
            icon={Mail}
            title="SMTP"
            subtitle="Configure outbound email delivery. Changes are saved only after a verification code is confirmed for a test recipient."
            tone="amber"
            bodyClassName="p-5"
            className="max-w-3xl"
        >
        <div className="space-y-4">
                {bootstrapping && (
                    <p className="text-xs font-semibold text-gray-400">Loading saved SMTP settings…</p>
                )}
                {demoMode && (
                    <HintBox title="Demo SMTP is locked" level="warning">
                        Demo mode uses MailHog for all email delivery. SMTP settings are read-only here.
                        <div className="mt-3 grid gap-2 text-xs font-mono sm:grid-cols-2">
                            <p>Host: {form.host || '127.0.0.1'}</p>
                            <p>Port: {form.port || '1025'}</p>
                            <p>From: {form.from_email || 'demo@rooiam.local'}</p>
                            {demoMailboxUrl && (
                                <p className="sm:col-span-2">
                                    Inbox:{' '}
                                    <a href={demoMailboxUrl} target="_blank" rel="noopener noreferrer" className="font-black underline underline-offset-2">
                                        Open MailHog
                                    </a>
                                </p>
                            )}
                        </div>
                    </HintBox>
                )}

                {/* SMTP config fields — always visible, disabled during verify phase */}
                <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                        <Field label="SMTP Host" value={form.host} placeholder="smtp.sendgrid.net"
                            onChange={v => set('host', v)} disabled={demoMode || phase === 'verify'} />
                    </div>
                    <Field label="Port" value={form.port} placeholder="587"
                        onChange={v => set('port', v)} disabled={demoMode || phase === 'verify'} />
                </div>
                <div>
                    <label className="wizard-label">Security</label>
                    <StringSelectField
                        value={form.security}
                        onChange={value => set('security', value)}
                        disabled={demoMode || phase === 'verify'}
                        options={[
                            { value: 'none', label: 'None (plain)' },
                            { value: 'starttls', label: 'STARTTLS' },
                            { value: 'tls', label: 'TLS / SSL' },
                        ]}
                    />
                </div>
                {form.security !== 'none' && (
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            className="w-4 h-4 rounded accent-violet-600"
                            checked={form.insecure_tls}
                            onChange={e => setForm(current => ({ ...current, insecure_tls: e.target.checked }))}
                            disabled={demoMode || phase === 'verify'}
                        />
                        <span className="text-sm font-semibold text-gray-600">
                            Skip TLS certificate verification
                            <span className="ml-1 text-gray-400 font-normal">(for self-signed certs)</span>
                        </span>
                    </label>
                )}
                <Field label="Username" value={form.username} placeholder="apikey"
                    onChange={v => set('username', v)} disabled={demoMode || phase === 'verify'} />
                <Field label="Password / API Key" type="password" value={form.password}
                    placeholder={passwordConfigured ? 'Stored password retained. Enter a new value to replace it.' : 'SG.xxxxxxx'}
                    onChange={v => set('password', v)} disabled={demoMode || phase === 'verify'} />
                {passwordConfigured && !form.password.trim() && (
                    <p className="text-[11px] font-semibold text-gray-400">
                        A password is already stored on the server. Leave this blank to keep it.
                    </p>
                )}
                <Field label="From Email" value={form.from_email} placeholder="auth@yourdomain.com"
                    onChange={v => set('from_email', v)} disabled={demoMode || phase === 'verify'} />

                {/* Recipient — always editable */}
                <Field label="Test recipient email" value={testEmail} placeholder="you@example.com"
                    onChange={v => { setTestEmail(v); setPhase('config') }} disabled={demoMode} />
                <p className="text-[11px] font-semibold text-gray-400">
                    Rooiam sends the verification code to this recipient before saving new SMTP settings.
                </p>

                {saved && phase === 'config' && (
                    <p className="text-xs font-bold text-green-700 bg-green-50 rounded-xl px-4 py-2">
                        ✓ SMTP verification passed. New SMTP settings were saved.
                    </p>
                )}
                {error && <p className="text-xs font-bold text-red-500 bg-red-50 rounded-xl px-4 py-2">{error}</p>}

                {/* Phase: config — show Send Code button */}
                {phase === 'config' && !demoMode && (
                    <div className="flex justify-start pt-2">
                        <button
                            type="button"
                            onClick={sendCode}
                            disabled={sending || !testEmail.trim() || !form.host.trim() || !form.port.trim() || !form.from_email.trim()}
                            className="wizard-btn flex items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                            Send test code
                        </button>
                    </div>
                )}

                {/* Phase: verify — show code input + Verify button */}
                {phase === 'verify' && (
                    <div className="space-y-3 pt-2">
                        <HintBox level="info">
                            <p className="text-sm font-semibold">
                                A 6-digit code was sent to <span className="font-black">{testEmail}</span>. Enter it below to save.
                            </p>
                        </HintBox>
                        <Field label="Verification code"
                            value={code}
                            placeholder="000000"
                            onChange={v => setCode(v.replace(/\D/g, '').slice(0, 6))} />
                        <div className="flex justify-start">
                            <button
                                type="button"
                                onClick={verifyCode}
                                disabled={verifying || code.length !== 6}
                                className="wizard-btn flex items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                                Verify & Save
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={() => { setPhase('config'); setCode(''); setError('') }}
                            className="text-sm font-bold text-gray-400 hover:text-gray-600"
                        >
                            ← Back / resend
                        </button>
                    </div>
                )}
            </div>
        </SectionCard>
    )
}

function RedisSettingsTab()
{
    const apiBase = getApiBase()
    const demoRedisFallbackUrl = 'redis://127.0.0.1:6379'
    const [redisUrl, setRedisUrl] = useState('')
    const [demoMode, setDemoMode] = useState(false)
    const [bootstrapping, setBootstrapping] = useState(true)
    const [testing, setTesting] = useState(false)
    const [error, setError] = useState('')
    const [status, setStatus] = useState('')

    useEffect(() => {
        Promise.all([
            fetchSetupStatusForAdmin(apiBase),
            fetchSetupConfigForSignedInAdmin(apiBase),
        ])
            .then(([setupStatus, config]) => {
                const isDemoMode = Boolean(setupStatus?.demo_mode)
                setDemoMode(isDemoMode)
                if (isDemoMode) {
                    setRedisUrl(config?.redis_url || demoRedisFallbackUrl)
                    return
                }
                if (!config) return
                setRedisUrl(config.redis_url || config.redis_url_masked || '')
            })
            .catch(() => setError('Could not load the current Redis URL.'))
            .finally(() => setBootstrapping(false))
    }, [apiBase])

    const redisValueIsMasked = redisUrl.includes('*')

    const testRedis = async () => {
        setTesting(true)
        setError('')
        setStatus('')
        const effectiveRedisUrl = redisUrl
        try {
            const result = await postSetupForSignedInAdmin<{ ok: boolean; message: string }>(apiBase, '/setup/test-redis', { url: effectiveRedisUrl })
            setStatus(
                demoMode
                    ? (result.message || 'Demo Redis connection succeeded using the locked demo configuration.')
                    : result.message,
            )
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Redis test failed.')
        } finally {
            setTesting(false)
        }
    }

    return (
        <div className="max-w-lg space-y-4">
            {bootstrapping && (
                <p className="text-xs font-semibold text-gray-400">Loading current Redis settings…</p>
            )}
            {demoMode && (
                <HintBox title="Demo Redis is locked" level="warning">
                    Demo mode uses the built-in Redis service. The value is fixed here and cannot be edited.
                    <div className="mt-2 text-xs font-mono">{redisUrl || demoRedisFallbackUrl}</div>
                </HintBox>
            )}

            <div className="rounded-3xl border border-border bg-white p-5 shadow-sm">
                <h3 className="font-black text-gray-800 mb-1 flex items-center gap-2">
                    <Database className="w-4 h-4 text-violet-500" /> Redis
                </h3>
                <p className="text-xs font-semibold text-gray-400 mb-4">
                    Rooiam uses Redis for OAuth state, rate limiting, and short-lived auth state.
                </p>

                <Field
                    label="Redis URL"
                    value={redisUrl}
                    placeholder="redis://127.0.0.1:6379"
                    onChange={setRedisUrl}
                    mono
                    disabled={demoMode}
                />

                <div className="mt-3 flex justify-start">
                    <button
                        type="button"
                        onClick={testRedis}
                        disabled={testing || !redisUrl.trim() || (!demoMode && redisValueIsMasked)}
                        className="wizard-btn inline-flex items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                        Test Redis Connection
                    </button>
                </div>
                {redisValueIsMasked && !demoMode && (
                    <p className="mt-3 text-[11px] font-semibold text-gray-400">
                        The saved Redis URL is masked. Enter the full URL again before testing.
                    </p>
                )}
                {status && <p className="mt-3 text-xs font-bold text-green-700 bg-green-50 rounded-2xl px-4 py-2.5">{status}</p>}
                {error && <p className="mt-3 text-xs font-bold text-red-500 bg-red-50 rounded-2xl px-4 py-2.5">{error}</p>}
            </div>

            <HintBox level="note" title="How to apply Redis changes">
                <div className="space-y-1.5 text-sm">
                    <p>Rooiam currently loads Redis from <code className="font-mono">ROOIAM_REDIS_URL</code> at server boot.</p>
                    <p>To change Redis, update your server environment or deployment config, then restart the Rooiam server.</p>
                    <p>This screen is for visibility and connection testing so operators can verify Redis before or after deploys.</p>
                </div>
            </HintBox>

            <HintBox level="note" title="Quick test commands">
                <div className="space-y-1 text-xs font-mono text-gray-700 break-all">
                    <p>redis-cli ping</p>
                    <p>redis-cli -u {redisUrl || demoRedisFallbackUrl} ping</p>
                </div>
            </HintBox>

            {error && <p className="text-xs font-bold text-red-500 bg-red-50 rounded-xl px-4 py-2">{error}</p>}
            {status && <p className="text-xs font-bold text-green-700 bg-green-50 rounded-xl px-4 py-2">{status}</p>}
        </div>
    )
}

// ── OAuth Tab ────────────────────────────────────────────────────────────────

function OAuthProvidersTab()
{
    const apiBase = getApiBase()
    const [demoMode, setDemoMode] = useState(false)
    const [searchParams, setSearchParams] = useSearchParams()
    const [issuerUrl, setIssuerUrl] = useState('')
    const [adminUrl, setAdminUrl] = useState('')
    const [google, setGoogle] = useState({ client_id: '', client_secret: '' })
    const [savedGoogle, setSavedGoogle] = useState({ client_id: '', client_secret: '' })
    const [showGoogleSecret, setShowGoogleSecret] = useState(false)
    const [googleVerifiedAt, setGoogleVerifiedAt] = useState('')
    const [microsoft, setMicrosoft] = useState({ client_id: '', client_secret: '', tenant_id: 'common' })
    const [savedMicrosoft, setSavedMicrosoft] = useState({ client_id: '', client_secret: '', tenant_id: 'common' })
    const [showMicrosoftSecret, setShowMicrosoftSecret] = useState(false)
    const [microsoftVerifiedAt, setMicrosoftVerifiedAt] = useState('')
    const [bootstrapping, setBootstrapping] = useState(true)
    const [testingProvider, setTestingProvider] = useState<'google' | 'microsoft' | null>(null)
    const [error, setError] = useState('')
    const [testStatus, setTestStatus] = useState('')
    const [verifiedProvider, setVerifiedProvider] = useState<'google' | 'microsoft' | null>(null)

    const loadConfig = async () => {
        Promise.all([
            fetchSetupPublicUrlsForSignedInAdmin(apiBase),
            fetchSetupConfigForSignedInAdmin(apiBase),
        ])
            .then(([urls, config]) => {
                if (!urls || !config) {
                    throw new Error('OAuth settings are not available from the current admin session.')
                }
                setIssuerUrl(urls.issuer_url)
                setAdminUrl(urls.admin_url)
                const nextGoogle = {
                    client_id: config.google_client_id || '',
                    client_secret: config.google_client_secret || '',
                }
                const nextMicrosoft = {
                    client_id: config.microsoft_client_id || '',
                    client_secret: config.microsoft_client_secret || '',
                    tenant_id: config.microsoft_tenant_id || 'common',
                }
                setGoogle(nextGoogle)
                setSavedGoogle(nextGoogle)
                setShowGoogleSecret(false)
                setGoogleVerifiedAt(config.google_oauth_verified_at || '')
                setMicrosoft(nextMicrosoft)
                setSavedMicrosoft(nextMicrosoft)
                setShowMicrosoftSecret(false)
                setMicrosoftVerifiedAt(config.microsoft_oauth_verified_at || '')
            })
            .catch((err: Error) => {
                setIssuerUrl('')
                setError(err.message || 'Could not load OAuth settings.')
            })
            .finally(() => setBootstrapping(false))
    }

    useEffect(() => {
        fetchSetupStatusForAdmin(apiBase).then(status => setDemoMode(Boolean(status?.demo_mode))).catch(() => setDemoMode(false))
        void loadConfig()
    }, [apiBase])

    useEffect(() => {
        const provider = searchParams.get('oauth_test_provider')
        const result = searchParams.get('oauth_test_result')
        if (result !== 'success' || (provider !== 'google' && provider !== 'microsoft')) {
            return
        }

        setTestStatus(
          `${provider === 'google' ? 'Google' : 'Microsoft'} verification passed. New provider settings were saved.`
        )
        setVerifiedProvider(provider)
        setTestingProvider(null)
        void loadConfig()
        const nextParams = new URLSearchParams(searchParams)
        nextParams.delete('oauth_test_provider')
        nextParams.delete('oauth_test_result')
        setSearchParams(nextParams, { replace: true })
    }, [searchParams, setSearchParams])

    const googleCallbackUrl = getOAuthCallbackUrl('google', issuerUrl || undefined)
    const microsoftCallbackUrl = getOAuthCallbackUrl('microsoft', issuerUrl || undefined)
    const oauthReturnUrl = useMemo(() => {
        const base = (adminUrl || window.location.origin).replace(/\/+$/, '')
        return (provider: 'google' | 'microsoft') => {
            const url = new URL(`${base}/settings`)
            url.searchParams.set('tab', 'oauth')
            url.searchParams.set('oauth_test_provider', provider)
            return url.toString()
        }
    }, [adminUrl])

    const googleDirty =
        google.client_id !== savedGoogle.client_id ||
        google.client_secret !== savedGoogle.client_secret
    const microsoftDirty =
        microsoft.client_id !== savedMicrosoft.client_id ||
        microsoft.client_secret !== savedMicrosoft.client_secret ||
        microsoft.tenant_id !== savedMicrosoft.tenant_id

    const getVerificationState = (dirty: boolean, verifiedAt: string) => {
        if (dirty) return 'needs_retest'
        if (verifiedAt) return 'verified'
        return 'not_tested'
    }

    const googleState = getVerificationState(googleDirty, googleVerifiedAt)
    const microsoftState = getVerificationState(microsoftDirty, microsoftVerifiedAt)
    const googleCanVerify = !!google.client_id.trim() && !!google.client_secret.trim()
    const microsoftCanVerify = !!microsoft.client_id.trim() && !!microsoft.client_secret.trim()

    const startOAuthTest = async (provider: 'google' | 'microsoft') => {
        if (demoMode) {
            setError('OAuth provider credentials are locked in demo mode.')
            return
        }
        if (provider === 'google' && !google.client_id.trim()) {
            setError('Add a Google client ID first before testing Google login.')
            return
        }
        if (provider === 'google' && !google.client_secret.trim()) {
            setError('Add a Google client secret first before testing Google login.')
            return
        }

        if (provider === 'microsoft' && !microsoft.client_id.trim()) {
            setError('Add a Microsoft client ID first before testing Microsoft login.')
            return
        }
        if (provider === 'microsoft' && !microsoft.client_secret.trim()) {
            setError('Add a Microsoft client secret first before testing Microsoft login.')
            return
        }

        setError('')
        setTestStatus('')
        setVerifiedProvider(null)
        setTestingProvider(provider)
        try {
            const payload = provider === 'google'
                ? {
                    provider,
                    client_id: google.client_id,
                    client_secret: google.client_secret,
                    redirect_uri: oauthReturnUrl(provider),
                }
                : {
                    provider,
                    client_id: microsoft.client_id,
                    client_secret: microsoft.client_secret,
                    tenant_id: microsoft.tenant_id,
                    redirect_uri: oauthReturnUrl(provider),
                }
            const data = await postSetupForSignedInAdmin<{ ok: boolean; authorization_url: string }>(apiBase, '/setup/prepare-oauth-verification', payload)
            window.location.href = data.authorization_url
        } catch (err) {
            setTestingProvider(null)
            setError(err instanceof Error ? err.message : 'Could not start provider verification.')
        }
    }

    const VerificationBadge = ({
        state,
        verifiedAt,
    }: {
        state: 'verified' | 'needs_retest' | 'not_tested'
        verifiedAt: string
    }) => {
        if (state === 'verified') {
            return (
                <div className="text-right">
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-black text-green-700">
                        <Check className="h-3.5 w-3.5" /> Verified
                    </span>
                    <p className="mt-1 text-[11px] font-semibold text-gray-400">
                        {new Date(verifiedAt).toLocaleString()}
                    </p>
                </div>
            )
        }

        if (state === 'needs_retest') {
            return (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5" /> Needs retest
                </span>
            )
        }

        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">
                Not tested
            </span>
        )
    }

    return (
        <div className="max-w-lg space-y-6">
                {demoMode && (
                    <HintBox title="OAuth credentials are locked in demo mode" level="warning">
                        Demo sign-in uses the seeded provider configuration.
                    </HintBox>
                )}
                {bootstrapping && (
                    <p className="text-xs font-semibold text-gray-400">Loading saved OAuth settings…</p>
                )}
                {/* Google */}
                <div className="rounded-3xl border border-border bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-start justify-between gap-4">
                        <div className="flex items-center gap-2.5">
                            <Globe className="w-5 h-5 text-blue-500" />
                            <span className="font-black text-gray-800">Google OAuth2</span>
                        </div>
                        <VerificationBadge state={googleState} verifiedAt={googleVerifiedAt} />
                    </div>
                    <div className="space-y-3">
                        <Field label="Client ID" value={google.client_id} mono
                            placeholder="xxxx.apps.googleusercontent.com"
                            onChange={v => setGoogle(g => ({ ...g, client_id: v }))} disabled={demoMode} />
                        <Field label="Client Secret" type={showGoogleSecret ? 'text' : 'password'} value={google.client_secret}
                            placeholder="GOCSPX-..." mono
                            onChange={v => setGoogle(g => ({ ...g, client_secret: v }))} disabled={demoMode} />
                        <button
                            type="button"
                            onClick={() => setShowGoogleSecret(value => !value)}
                            disabled={demoMode}
                            className="inline-flex items-center gap-2 text-xs font-black text-gray-500 hover:text-gray-700 disabled:opacity-40"
                        >
                            {showGoogleSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            {showGoogleSecret ? 'Hide client secret' : 'Show client secret'}
                        </button>
                    </div>
                    <p className="text-xs font-semibold text-gray-400 mt-3">
                        Callback: <code className="font-mono text-pink-500 text-xs">{googleCallbackUrl}</code>
                    </p>
                    {googleState !== 'verified' ? (
                        <div className="mt-3 flex justify-start">
                            <button
                                type="button"
                                onClick={() => void startOAuthTest('google')}
                                disabled={demoMode || testingProvider !== null || !googleCanVerify}
                                className="wizard-btn inline-flex items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {testingProvider === 'google' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                {googleState === 'needs_retest' ? 'Verify Google Again' : 'Verify Google & Save'}
                            </button>
                        </div>
                    ) : null}
                    {verifiedProvider === 'google' && testStatus ? (
                        <div className="mt-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-xs font-bold text-green-700">
                            {testStatus}
                        </div>
                    ) : null}
                </div>

                {/* Microsoft */}
                <div className="rounded-3xl border border-border bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-start justify-between gap-4">
                        <div className="flex items-center gap-2.5">
                            <Key className="w-5 h-5 text-blue-600" />
                            <span className="font-black text-gray-800">Microsoft OAuth2</span>
                        </div>
                        <VerificationBadge state={microsoftState} verifiedAt={microsoftVerifiedAt} />
                    </div>
                    <div className="space-y-3">
                        <Field label="Application (Client) ID" value={microsoft.client_id} mono
                            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                            onChange={v => setMicrosoft(m => ({ ...m, client_id: v }))} disabled={demoMode} />
                        <Field label="Client Secret" type={showMicrosoftSecret ? 'text' : 'password'} value={microsoft.client_secret} mono
                            placeholder="xxx~xxxxx"
                            onChange={v => setMicrosoft(m => ({ ...m, client_secret: v }))} disabled={demoMode} />
                        <button
                            type="button"
                            onClick={() => setShowMicrosoftSecret(value => !value)}
                            disabled={demoMode}
                            className="inline-flex items-center gap-2 text-xs font-black text-gray-500 hover:text-gray-700 disabled:opacity-40"
                        >
                            {showMicrosoftSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            {showMicrosoftSecret ? 'Hide client secret' : 'Show client secret'}
                        </button>
                        <Field label="Tenant ID" value={microsoft.tenant_id} mono placeholder="common"
                            onChange={v => setMicrosoft(m => ({ ...m, tenant_id: v }))} disabled={demoMode} />
                    </div>
                    <p className="text-xs font-semibold text-gray-400 mt-3">
                        Callback: <code className="font-mono text-pink-500 text-xs">{microsoftCallbackUrl}</code>
                    </p>
                    {microsoftState !== 'verified' ? (
                        <div className="mt-3 flex justify-start">
                            <button
                                type="button"
                                onClick={() => void startOAuthTest('microsoft')}
                                disabled={demoMode || testingProvider !== null || !microsoftCanVerify}
                                className="wizard-btn inline-flex items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {testingProvider === 'microsoft' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                {microsoftState === 'needs_retest' ? 'Verify Microsoft Again' : 'Verify Microsoft & Save'}
                            </button>
                        </div>
                    ) : null}
                    {verifiedProvider === 'microsoft' && testStatus ? (
                        <div className="mt-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-xs font-bold text-green-700">
                            {testStatus}
                        </div>
                    ) : null}
                </div>

                <div className="rounded-2xl border border-border bg-white px-4 py-3 text-xs font-semibold text-gray-500 shadow-sm">
                    A successful test will return you to this tab, save the credentials, and mark the provider as verified. Editing provider keys or changing the API base URL will require a retest.
                </div>
                <div className="rounded-2xl px-4 py-3 text-xs font-bold text-sky-700 border border-sky-200 bg-sky-50">
                    Provider credentials and verification live here. To actually allow Google or Microsoft on the admin login page, use <span className="font-black text-sky-900">Access &gt; Sign-In Methods</span>.
                </div>

                {error && <p className="text-xs font-bold text-red-500 bg-red-50 rounded-xl px-4 py-2">{error}</p>}
        </div>
    )
}

// ── Security Tab ─────────────────────────────────────────────────────────────

function MyAccountTab()
{
    const apiBase = getApiBase()
    const [demoMode, setDemoMode] = useState(false)
    const [searchParams, setSearchParams] = useSearchParams()
    const [data, setData] = useState<ApiLinkedAccounts | null>(null)
    const [loading, setLoading] = useState(true)
    const [workingProvider, setWorkingProvider] = useState<string | null>(null)
    const [error, setError] = useState('')
    const [status, setStatus] = useState('')

    const load = async () => {
        setLoading(true)
        try {
            const linked = await authApi.linkedAccounts()
            setData(linked)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not load linked accounts.')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchSetupStatusForAdmin(apiBase).then(status => setDemoMode(Boolean(status?.demo_mode))).catch(() => setDemoMode(false))
        load()
    }, [apiBase])

    useEffect(() => {
        const provider = searchParams.get('link_provider')
        const result = searchParams.get('link_result')
        const message = searchParams.get('link_message')
        if (!provider || !result) return

        if (result === 'success') {
            setStatus(message || `${provider} linked successfully.`)
            load()
        } else {
            setError(message || `Could not link ${provider}.`)
        }

        const nextParams = new URLSearchParams(searchParams)
        nextParams.delete('link_provider')
        nextParams.delete('link_result')
        nextParams.delete('link_message')
        setSearchParams(nextParams, { replace: true })
    }, [searchParams, setSearchParams])

    const providers = data?.providers ?? []
    const primaryEmail = data?.primary_email?.toLowerCase() || ''
    const isGmailPrimary = primaryEmail.endsWith('@gmail.com')
    const isMicrosoftConsumerPrimary =
        primaryEmail.endsWith('@outlook.com') ||
        primaryEmail.endsWith('@hotmail.com') ||
        primaryEmail.endsWith('@live.com') ||
        primaryEmail.endsWith('@msn.com')

    const providerClarification = (providerName: string) => {
        if (providerName === 'google' && isGmailPrimary) {
            return 'This account currently uses a Gmail address for magic-link sign-in. That is separate from linking Google OAuth for direct Google sign-in.'
        }
        if (providerName === 'microsoft' && isMicrosoftConsumerPrimary) {
            return 'This account currently uses a Microsoft email address for magic-link sign-in. That is separate from linking Microsoft OAuth for direct Microsoft sign-in.'
        }
        return 'Linking adds this provider to the current Rooiam identity. It does not change your current session while linking. If linking fails, the provider may already belong to another Rooiam account in this same instance.'
    }

    const startLink = async (provider: 'google' | 'microsoft') => {
        if (demoMode) return
        setWorkingProvider(provider)
        setError('')
        setStatus('')
        try {
            const base = `${window.location.origin}/my/account`
            const res = await authApi.startLinkProvider(provider, base)
            window.location.href = res.authorization_url
        } catch (err) {
            setError(err instanceof Error ? err.message : `Could not start ${provider} linking.`)
            setWorkingProvider(null)
        }
    }

    const unlinkProvider = async (provider: 'google' | 'microsoft') => {
        if (demoMode) return
        setWorkingProvider(provider)
        setError('')
        setStatus('')
        try {
            const res = await authApi.unlinkProvider(provider)
            setStatus(res.message || `${provider} unlinked successfully.`)
            await load()
        } catch (err) {
            setError(err instanceof Error ? err.message : `Could not unlink ${provider}.`)
        } finally {
            setWorkingProvider(null)
        }
    }

    return (
        <div className="space-y-6">
            {demoMode && (
                <HintBox title="Account linking is locked in demo mode" level="warning">
                    Seeded demo identities remain reusable for every visitor.
                </HintBox>
            )}
            <div className="rounded-3xl border border-border bg-white p-5 shadow-sm">
                <h3 className="font-black text-gray-800 mb-1 flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-pink-500" /> Linked Accounts
                </h3>
                <p className="text-xs font-semibold text-gray-400 mb-4">
                    Link additional providers to this same Rooiam account. Linking is explicit and separate from provider testing.
                </p>
                <HintBox level="warning" className="mb-4 rounded-2xl">
                    <p className="text-sm font-bold">
                        Admin protection: linking and unlinking providers requires a recent admin sign-in. If your session is older, sign out and sign in again before changing linked accounts.
                    </p>
                </HintBox>
                {data && (
                <div className="rounded-2xl border border-border bg-white px-4 py-3 shadow-sm">
                        <p className="text-xs font-semibold text-gray-500">Primary identity</p>
                        <p className="mt-1 text-sm font-black text-gray-800">{data.primary_email || 'No primary email on this account'}</p>
                        <p className="mt-2 text-xs font-semibold text-gray-500">
                            Magic link: {data.magic_link.enabled ? 'available' : 'not available'} · Passkeys: {data.passkeys} · TOTP: {data.totp_enabled ? 'enabled' : 'off'}
                        </p>
                        <p className="mt-2 text-xs font-semibold text-gray-400">
                            A primary email address is not the same as a linked Google or Microsoft OAuth identity.
                        </p>
                    </div>
                )}
            </div>

            {loading ? <p className="text-xs font-semibold text-gray-400">Loading linked accounts…</p> : null}
            {status && <p className="text-xs font-bold text-green-700 bg-green-50 rounded-xl px-4 py-2">{status}</p>}
            {error && <p className="text-xs font-bold text-red-500 bg-red-50 rounded-xl px-4 py-2">{error}</p>}

            {providers.map(provider => (
                <div key={provider.provider} className="rounded-3xl border border-border bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="font-black text-gray-800 capitalize">{provider.provider}</p>
                            <p className="text-xs font-semibold text-gray-500 mt-1">
                                {provider.linked
                                    ? `Linked${provider.linked_email ? ` as ${provider.linked_email}` : ''}`
                                    : provider.provider === 'google' && isGmailPrimary
                                        ? 'Using Gmail as the primary email, but Google OAuth is not linked'
                                        : provider.provider === 'microsoft' && isMicrosoftConsumerPrimary
                                            ? 'Using a Microsoft email as the primary email, but Microsoft OAuth is not linked'
                                            : 'Not linked yet'}
                            </p>
                        </div>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black ${
                            provider.is_signup_provider
                                ? 'bg-violet-100 text-violet-700'
                                : provider.linked
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-slate-100 text-slate-600'
                        }`}>
                            {provider.linked || provider.is_signup_provider ? <Check className="h-3.5 w-3.5" /> : null}
                            {provider.is_signup_provider ? 'Primary sign-in' : provider.linked ? 'Linked' : 'Not linked'}
                        </span>
                    </div>
                    <p className="mt-4 text-xs font-semibold text-gray-500">
                        {providerClarification(provider.provider)}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                        {!provider.linked && (
                            <button
                                type="button"
                                onClick={() => startLink(provider.provider as 'google' | 'microsoft')}
                                disabled={demoMode || workingProvider === provider.provider}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-black border border-pink-100 bg-pink-50 text-pink-700 hover:bg-pink-100 transition-colors disabled:opacity-50"
                            >
                                {workingProvider === provider.provider ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                                {`Link ${provider.provider === 'google' ? 'Google' : 'Microsoft'}`}
                            </button>
                        )}
                        {provider.linked && (
                            <button
                                type="button"
                                onClick={() => unlinkProvider(provider.provider as 'google' | 'microsoft')}
                                disabled={demoMode || workingProvider === provider.provider}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-black border border-red-100 bg-red-50 text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
                            >
                                {workingProvider === provider.provider ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
                                Unlink {provider.provider === 'google' ? 'Google' : 'Microsoft'}
                            </button>
                        )}
                    </div>
                </div>
            ))}
        </div>
    )
}

function MySessionsTab()
{
    const SESSION_PAGE_SIZE = 6
    const [sessions, setSessions] = useState<ApiSession[]>([])
    const [loading, setLoading] = useState(true)
    const [revoking, setRevoking] = useState(false)
    const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null)
    const [error, setError] = useState('')
    const [status, setStatus] = useState('')
    const [otherSessionsPage, setOtherSessionsPage] = useState(1)

    const load = async () => {
        setLoading(true)
        try {
            const mySessions = await authApi.sessions()
            setSessions(mySessions)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not load sessions.')
            setSessions([])
        } finally {
            setLoading(false)
        }
    }

    const revokeSingleSession = async (sessionId: string) => {
        setRevokingSessionId(sessionId)
        setError('')
        setStatus('')
        try {
            const result = await authApi.revokeSession(sessionId)
            setStatus(result.message || 'Session revoked.')
            await load()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not revoke that session.')
        } finally {
            setRevokingSessionId(null)
        }
    }

    useEffect(() => {
        load()
    }, [])

    const revokeOtherSessions = async () => {
        setRevoking(true)
        setError('')
        setStatus('')
        try {
            const result = await authApi.revokeOtherSessions()
            setStatus(result.revoked_count > 0
                ? `Revoked ${result.revoked_count} other session${result.revoked_count === 1 ? '' : 's'}.`
                : 'No other sessions were active.')
            await load()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not revoke other sessions.')
        } finally {
            setRevoking(false)
        }
    }

    const currentSession = sessions.find(session => session.is_current)
    const otherSessions = sessions.filter(session => !session.is_current)
    const pagedOtherSessions = otherSessions.slice((otherSessionsPage - 1) * SESSION_PAGE_SIZE, otherSessionsPage * SESSION_PAGE_SIZE)
    const formatSessionLabel = (session: ApiSession) => `Session ${session.id.slice(0, 8)}`
    const formatSessionContext = (session: ApiSession) => {
        const parts = [
            session.login_app_name,
            session.login_workspace_slug ? `Workspace ${session.login_workspace_slug}` : null,
        ].filter(Boolean)
        return parts.length > 0 ? parts.join(' · ') : null
    }

    useEffect(() => {
        setOtherSessionsPage(1)
    }, [otherSessions.length])

    return (
        <div className="max-w-lg space-y-4">
            <div className="rounded-3xl border border-border bg-white p-5 shadow-sm">
                <h3 className="font-black text-gray-800 mb-1 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-pink-400" /> Session Overview
                </h3>
                <p className="text-xs font-semibold text-gray-400 mb-4">
                    Review active sessions and remove the ones you no longer trust.
                </p>
                <div className="space-y-3">
                    <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: '#F0E8F5' }}>
                        <div>
                            <p className="text-sm font-bold text-gray-700">Session Duration</p>
                            <p className="text-xs font-semibold text-gray-400">How long user sessions last</p>
                        </div>
                        <span className="text-sm font-black text-gray-500">7 days</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: '#F0E8F5' }}>
                        <div>
                            <p className="text-sm font-bold text-gray-700">Magic Link Expiry</p>
                            <p className="text-xs font-semibold text-gray-400">Time before magic links expire</p>
                        </div>
                        <span className="text-sm font-black text-gray-500">15 min</span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                        <div>
                            <p className="text-sm font-bold text-gray-700">Active Sessions</p>
                            <p className="text-xs font-semibold text-gray-400">Current user sessions visible and revocable</p>
                        </div>
                        <span className="text-sm font-black text-gray-500">
                            {loading ? '…' : String(sessions.length)}
                        </span>
                    </div>
                </div>
            </div>

            <div className="rounded-3xl border border-border bg-white p-5 shadow-sm">
                <div>
                    <h3 className="font-black text-gray-800 mb-1">Current Session</h3>
                    <p className="text-xs font-semibold text-gray-400">
                        This is the browser session you are using right now.
                    </p>
                </div>
                <div className="mt-4 rounded-2xl border border-border bg-white px-4 py-3 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-700">
                                {currentSession?.user_agent || 'Unknown device'}
                            </p>
                            <p className="text-xs font-black text-slate-500 mt-1">
                                {currentSession ? formatSessionLabel(currentSession) : 'Current session'}
                            </p>
                            {currentSession && formatSessionContext(currentSession) && (
                                <p className="text-xs font-semibold text-gray-500 mt-1">
                                    {formatSessionContext(currentSession)}
                                </p>
                            )}
                            <p className="text-xs font-semibold text-gray-500 mt-2">
                                {currentSession?.ip || 'Unknown IP'}
                            </p>
                            <p className="text-xs font-semibold text-gray-500 mt-1">
                                {currentSession?.created_at ? `Created ${new Date(currentSession.created_at).toLocaleString()}` : ''}
                            </p>
                            <p className="text-xs font-semibold text-gray-500 mt-1">
                                {currentSession?.last_seen_at ? `Last seen ${new Date(currentSession.last_seen_at).toLocaleString()}` : ''}
                            </p>
                        </div>
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-black text-emerald-700 shrink-0">
                            Current
                        </span>
                    </div>
                </div>
                {status && <p className="text-xs font-bold text-green-700 bg-green-50 rounded-xl px-4 py-2 mt-3">{status}</p>}
                {error && <p className="text-xs font-bold text-red-500 bg-red-50 rounded-xl px-4 py-2 mt-3">{error}</p>}
            </div>

            <div className="rounded-3xl border border-border bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h3 className="font-black text-gray-800 mb-1">Other Active Sessions</h3>
                        <p className="text-xs font-semibold text-gray-400 mb-4">
                            Sign out old browsers and devices if they are no longer in use.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={revokeOtherSessions}
                        disabled={revoking || loading || otherSessions.length === 0}
                        className="text-xs font-black px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-60 shrink-0"
                    >
                        {revoking ? 'Revoking…' : 'Revoke All Others'}
                    </button>
                </div>
                <div className="space-y-3">
                    {loading ? (
                        <p className="text-xs font-semibold text-gray-400">Loading sessions…</p>
                    ) : otherSessions.length === 0 ? (
                        <p className="text-sm font-semibold text-gray-500">No other active sessions.</p>
                    ) : (
                        <>
                            {pagedOtherSessions.map(session => (
                            <div key={session.id} className="rounded-2xl border border-border bg-white px-4 py-3 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-gray-700">{session.user_agent || 'Unknown device'}</p>
                                        <p className="text-xs font-black text-slate-500 mt-1">
                                            {formatSessionLabel(session)}
                                        </p>
                                        {formatSessionContext(session) && (
                                            <p className="text-xs font-semibold text-gray-500 mt-1">
                                                {formatSessionContext(session)}
                                            </p>
                                        )}
                                        <p className="text-xs font-semibold text-gray-500 mt-2">
                                            {session.ip || 'Unknown IP'}
                                        </p>
                                        <p className="text-xs font-semibold text-gray-500 mt-1">
                                            Created {new Date(session.created_at).toLocaleString()}
                                        </p>
                                        <p className="text-xs font-semibold text-gray-500 mt-1">
                                            Last seen {new Date(session.last_seen_at).toLocaleString()}
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-end gap-2 shrink-0">
                                        <span className="inline-flex items-center rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-black text-slate-700">
                                            Active
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => revokeSingleSession(session.id)}
                                            disabled={revokingSessionId === session.id}
                                            className="text-xs font-black px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-60"
                                        >
                                            {revokingSessionId === session.id ? 'Revoking…' : 'Revoke'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                            ))}
                            <div className="rounded-2xl overflow-hidden border border-gray-100 bg-white">
                                <PaginationControls
                                    page={otherSessionsPage}
                                    totalItems={otherSessions.length}
                                    pageSize={SESSION_PAGE_SIZE}
                                    label="sessions"
                                    onPageChange={setOtherSessionsPage}
                                />
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

function MySecurityTab()
{
    const [sessions, setSessions] = useState<ApiSession[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const load = async () => {
            try {
                const mySessions = await authApi.sessions()
                setSessions(mySessions)
            } catch {
                setSessions([])
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [])

    const currentSession = sessions.find(session => session.is_current)

    return (
        <div className="max-w-lg space-y-4">
            <div className="rounded-3xl border border-border bg-white p-5 shadow-sm">
                <h3 className="font-black text-gray-800 mb-1 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" /> Security Signals
                </h3>
                <p className="text-xs font-semibold text-gray-400 mb-4">
                    Real-time visibility from your current admin session.
                </p>
                <div className="space-y-3">
                    <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: '#F0E8F5' }}>
                        <div>
                            <p className="text-sm font-bold text-gray-700">Current Device</p>
                            <p className="text-xs font-semibold text-gray-400">Last seen session context</p>
                        </div>
                        <span className="text-xs font-black text-gray-500 max-w-[180px] truncate text-right">
                            {loading ? 'Loading…' : (currentSession?.user_agent || 'Unknown device')}
                        </span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: '#F0E8F5' }}>
                        <div>
                            <p className="text-sm font-bold text-gray-700">Current IP</p>
                            <p className="text-xs font-semibold text-gray-400">Captured from the active request path</p>
                        </div>
                        <span className="text-xs font-black text-gray-500">
                            {loading ? 'Loading…' : (currentSession?.ip || 'Unknown')}
                        </span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                        <div>
                            <p className="text-sm font-bold text-gray-700">Audit Review</p>
                            <p className="text-xs font-semibold text-gray-400">Use Audit Logs for authentication and security history.</p>
                        </div>
                        <a
                            href="/admin/audit-logs"
                            className="text-xs font-black px-2 py-1 rounded-full bg-sky-100 text-sky-700 hover:bg-sky-200 transition-colors"
                        >
                            Open Audit Logs
                        </a>
                    </div>
                </div>
            </div>

            <div className="rounded-2xl p-4 text-sm font-semibold text-gray-500"
                style={{ background: '#F8F0FF', border: '1px solid #D5B7FF' }}>
                <p className="font-bold text-gray-700 mb-2">Current security baseline</p>
                <div className="space-y-1.5 text-sm">
                    <p>Redis-backed rate limiting is active on auth, OAuth, and OIDC entrypoints.</p>
                    <p>Opaque cookie sessions can be listed and revoked, including revoke-all-other-sessions.</p>
                    <p>OIDC discovery, JWKS, and userinfo are available when issuer and key settings are configured.</p>
                    <p>Passkey enrollment and TOTP MFA setup are available from Sign-In Methods.</p>
                    <p>Forwarded client IPs are only trusted when the immediate peer matches configured trusted proxy CIDRs.</p>
                </div>
            </div>

        </div>
    )
}

function TenantWorkspaceRulesTab()
{
    const apiBase = getApiBase()
    const [demoMode, setDemoMode] = useState(false)
    const [workspaceGovernance, setWorkspaceGovernance] = useState<PlatformWorkspaceGovernance | null>(null)
    const [dirty, setDirty] = useState(false)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        fetchSetupStatusForAdmin(apiBase).then(status => setDemoMode(Boolean(status?.demo_mode))).catch(() => setDemoMode(false))
        sysAdminApi.workspaceGovernance()
            .then(g => { setWorkspaceGovernance(g) })
            .catch((err: Error) => setError(err.message))
            .finally(() => setLoading(false))
    }, [apiBase])

    const save = async (e: { preventDefault(): void }) =>
    {
        e.preventDefault()
        if (!workspaceGovernance || demoMode) return
        setSaving(true)
        setError('')
        try {
            const saved = await sysAdminApi.updateWorkspaceGovernance(workspaceGovernance)
            setWorkspaceGovernance(saved)
            setDirty(false)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save workspace rules.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <form onSubmit={save} className="max-w-lg space-y-4">
            {demoMode && (
                <HintBox title="Workspace limits are locked in demo mode" level="warning">
                    Demo allows up to 5 workspaces per account so the seeded workspace inventory stays consistent.
                </HintBox>
            )}
            <div className="rounded-3xl border border-border bg-white p-5 shadow-sm">
                <h3 className="font-black text-gray-800 mb-1 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-fuchsia-500" /> Workspace Limits
                </h3>
                <p className="text-xs font-semibold text-gray-400 mb-4">
                    Tenant-wide limits and rules for workspace creation across the platform.
                </p>
                <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
                    <label className="block text-xs font-black uppercase tracking-[0.16em] text-gray-500 mb-2">Default Max Workspaces Per Account</label>
                    <input
                        type="number"
                        min={1}
                        max={workspaceGovernance?.hard_cap_workspaces_per_user}
                        value={workspaceGovernance?.max_workspaces_per_user ?? ''}
                        onChange={e => { setWorkspaceGovernance(current => current ? {
                            ...current,
                            max_workspaces_per_user: e.target.value.trim() ? Number.parseInt(e.target.value, 10) : null,
                        } : current); setDirty(true) }}
                        disabled={demoMode}
                        placeholder="3"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-sky-200"
                    />
                    <p className="mt-2 text-xs font-semibold text-gray-400">
                        Max workspaces each account can create. Blank = 3 (built-in fallback).
                        {workspaceGovernance ? <> Hard cap: <span className="text-gray-600 font-black">{workspaceGovernance.hard_cap_workspaces_per_user}</span> (change requires code deployment).</> : null}
                    </p>
                    {demoMode ? (
                        <p className="mt-2 text-xs font-semibold text-amber-700">
                            Demo mode is fixed to 5 workspaces per account.
                        </p>
                    ) : null}
                </div>
                <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
                    <label className="block text-xs font-black uppercase tracking-[0.16em] text-gray-500 mb-2">Default Max Apps Per Workspace</label>
                    <input
                        type="number"
                        min={1}
                        max={workspaceGovernance?.hard_cap_apps_per_workspace}
                        value={workspaceGovernance?.max_apps_per_workspace ?? ''}
                        onChange={e => { setWorkspaceGovernance(current => current ? {
                            ...current,
                            max_apps_per_workspace: e.target.value.trim() ? Number.parseInt(e.target.value, 10) : null,
                        } : current); setDirty(true) }}
                        disabled={demoMode}
                        placeholder="5"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-sky-200"
                    />
                    <p className="mt-2 text-xs font-semibold text-gray-400">
                        Max apps each workspace can register. Blank = 5 (built-in fallback).
                        {workspaceGovernance ? <> Hard cap: <span className="text-gray-600 font-black">{workspaceGovernance.hard_cap_apps_per_workspace}</span> (change requires code deployment).</> : null}
                    </p>
                    {demoMode ? (
                        <p className="mt-2 text-xs font-semibold text-amber-700">
                            Demo mode is fixed to 10 apps per workspace.
                        </p>
                    ) : null}
                </div>
                <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
                    <label className="block text-xs font-black uppercase tracking-[0.16em] text-gray-500 mb-2">Default Max Redirect URIs Per App</label>
                    <input
                        type="number"
                        min={1}
                        max={workspaceGovernance?.max_redirect_uris_per_app_limit ?? workspaceGovernance?.hard_cap_redirect_uris_per_app}
                        value={workspaceGovernance?.max_redirect_uris_per_app_default ?? ''}
                        onChange={e => { setWorkspaceGovernance(current => current ? {
                            ...current,
                            max_redirect_uris_per_app_default: e.target.value.trim() ? Number.parseInt(e.target.value, 10) : null,
                        } : current); setDirty(true) }}
                        disabled={demoMode}
                        placeholder="5"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-sky-200"
                    />
                    <p className="mt-2 text-xs font-semibold text-gray-400">
                        Default redirect URI count allowed for each app. Blank = 5 (built-in fallback).
                    </p>
                </div>
                <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
                    <label className="block text-xs font-black uppercase tracking-[0.16em] text-gray-500 mb-2">Platform Max Redirect URIs Per App</label>
                    <input
                        type="number"
                        min={1}
                        max={workspaceGovernance?.hard_cap_redirect_uris_per_app}
                        value={workspaceGovernance?.max_redirect_uris_per_app_limit ?? ''}
                        onChange={e => { setWorkspaceGovernance(current => current ? {
                            ...current,
                            max_redirect_uris_per_app_limit: e.target.value.trim() ? Number.parseInt(e.target.value, 10) : null,
                        } : current); setDirty(true) }}
                        disabled={demoMode}
                        placeholder="10"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-sky-200"
                    />
                    <p className="mt-2 text-xs font-semibold text-gray-400">
                        Tenant overrides may only choose from 1 up to this max. Blank = 10 (built-in fallback).
                        {workspaceGovernance ? <> Hard cap: <span className="text-gray-600 font-black">{workspaceGovernance.hard_cap_redirect_uris_per_app}</span>.</> : null}
                    </p>
                </div>
                <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
                    <label className="block text-xs font-black uppercase tracking-[0.16em] text-gray-500 mb-2">Default Max Allowed Embed Origins Per App</label>
                    <input
                        type="number"
                        min={1}
                        max={workspaceGovernance?.max_allowed_embed_origins_per_app_limit ?? workspaceGovernance?.hard_cap_allowed_embed_origins_per_app}
                        value={workspaceGovernance?.max_allowed_embed_origins_per_app_default ?? ''}
                        onChange={e => { setWorkspaceGovernance(current => current ? {
                            ...current,
                            max_allowed_embed_origins_per_app_default: e.target.value.trim() ? Number.parseInt(e.target.value, 10) : null,
                        } : current); setDirty(true) }}
                        disabled={demoMode}
                        placeholder="5"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-sky-200"
                    />
                    <p className="mt-2 text-xs font-semibold text-gray-400">
                        Default embed-origin count allowed for each app. Blank = 5 (built-in fallback).
                    </p>
                </div>
                <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
                    <label className="block text-xs font-black uppercase tracking-[0.16em] text-gray-500 mb-2">Platform Max Allowed Embed Origins Per App</label>
                    <input
                        type="number"
                        min={1}
                        max={workspaceGovernance?.hard_cap_allowed_embed_origins_per_app}
                        value={workspaceGovernance?.max_allowed_embed_origins_per_app_limit ?? ''}
                        onChange={e => { setWorkspaceGovernance(current => current ? {
                            ...current,
                            max_allowed_embed_origins_per_app_limit: e.target.value.trim() ? Number.parseInt(e.target.value, 10) : null,
                        } : current); setDirty(true) }}
                        disabled={demoMode}
                        placeholder="10"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-sky-200"
                    />
                    <p className="mt-2 text-xs font-semibold text-gray-400">
                        Tenant overrides may only choose from 1 up to this max. Blank = 10 (built-in fallback).
                        {workspaceGovernance ? <> Hard cap: <span className="text-gray-600 font-black">{workspaceGovernance.hard_cap_allowed_embed_origins_per_app}</span>.</> : null}
                    </p>
                </div>
                {loading && <p className="mt-2 text-xs font-semibold text-gray-400">Loading workspace rules…</p>}
                <SaveActionFooter error={error} loading={saving} dirty={dirty} disabled={demoMode || saving} type="submit" />
            </div>
        </form>
    )
}

// ── Storage Tab ──────────────────────────────────────────────────────────────

function StorageSettingsTab() {
    const [config, setConfig] = useState<PlatformStorageConfig | null>(null)
    const [demoMode, setDemoMode] = useState(false)
    const [bootstrapping, setBootstrapping] = useState(true)
    const [testing, setTesting] = useState(false)
    const [saveStatus, setSaveStatus] = useState('')
    const [saveError, setSaveError] = useState('')
    const [testStatus, setTestStatus] = useState('')
    const [testError, setTestError] = useState('')
    const [showSecret, setShowSecret] = useState(false)
    // Editable form state (mirrors config but keeps local edits)
    const [backend, setBackend] = useState<StorageBackend>('minio')
    const [localPath, setLocalPath] = useState('')
    const [minioEndpoint, setMinioEndpoint] = useState('')
    const [minioBucket, setMinioBucket] = useState('')
    const [minioAccessKey, setMinioAccessKey] = useState('')
    const [minioSecretKey, setMinioSecretKey] = useState('')
    const [minioUseSsl, setMinioUseSsl] = useState(true)
    const apiBase = getApiBase()
    const configuredBackend = config?.backend ?? null
    const currentBackendLabel = configuredBackend === 'local' ? 'Local Disk' : configuredBackend === 'minio' ? 'MinIO' : 'Not configured'

    const updateMinioEndpoint = (value: string) => {
        setMinioEndpoint(value)
        const normalized = value.trim().toLowerCase()
        if (normalized.startsWith('https://')) {
            setMinioUseSsl(true)
        } else if (normalized.startsWith('http://')) {
            setMinioUseSsl(false)
        }
    }

    useEffect(() => {
        Promise.all([
            fetchSetupStatusForAdmin(apiBase),
            sysAdminApi.storageConfig(),
        ])
            .then(([setupStatus, cfg]) => {
                setDemoMode(Boolean(setupStatus?.demo_mode))
                setConfig(cfg)
                const isUnconfiguredStorage =
                    cfg.backend === 'local' &&
                    !cfg.local_path.trim() &&
                    !cfg.minio_endpoint.trim() &&
                    !cfg.minio_bucket.trim() &&
                    !cfg.minio_access_key.trim()
                setBackend(isUnconfiguredStorage ? 'minio' : cfg.backend)
                setLocalPath(cfg.local_path)
                setMinioEndpoint(cfg.minio_endpoint)
                setMinioBucket(cfg.minio_bucket)
                setMinioAccessKey(cfg.minio_access_key)
                setMinioUseSsl(cfg.minio_use_ssl)
            })
            .catch(() => setSaveError('Could not load storage configuration.'))
            .finally(() => setBootstrapping(false))
    }, [apiBase])

    const buildUpdate = (): PlatformStorageConfigUpdate => ({
        backend,
        local_path: localPath,
        minio_endpoint: minioEndpoint,
        minio_bucket: minioBucket,
        minio_access_key: minioAccessKey,
        minio_secret_key: minioSecretKey || undefined,
        minio_use_ssl: minioUseSsl,
    })

    const testStorage = async () => {
        setTesting(true); setTestStatus(''); setTestError(''); setSaveStatus(''); setSaveError('')
        const payload: TestStorageRequest = {
            backend,
            local_path: localPath,
            minio_endpoint: minioEndpoint,
            minio_bucket: minioBucket,
            minio_access_key: minioAccessKey,
            minio_secret_key: minioSecretKey || undefined,
            minio_use_ssl: minioUseSsl,
        }
        try {
            const result = await sysAdminApi.testStorage(payload)
            setTestStatus(result.message)
            // Auto-save on successful test
            if (!demoMode) {
                const saved = await sysAdminApi.updateStorageConfig(buildUpdate())
                setConfig(saved)
                setSaveStatus('Storage test passed. New storage configuration was saved.')
            }
        } catch (err) {
            setTestError(err instanceof Error ? err.message : 'Storage test failed.')
        } finally { setTesting(false) }
    }

    if (bootstrapping) return <p className="text-xs font-semibold text-gray-400">Loading storage settings…</p>

    return (
        <div className="max-w-lg space-y-4">
            {demoMode && (
                <HintBox title="Storage is locked in demo mode" level="warning">
                    Settings are read-only. You can still run the connection test to verify MinIO is reachable.
                </HintBox>
            )}

            <ContentCard
                title="Storage Backend"
                subtitle="Choose where Rooiam stores uploaded files such as logos, avatars, and attachments."
                icon={HardDrive}
                className="space-y-4"
            >
                <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3">
                    <p className="text-xs font-black uppercase tracking-wide text-violet-600">Current backend</p>
                    <p className="mt-1 text-sm font-black text-violet-900">{currentBackendLabel}</p>
                </div>
                <div className="flex gap-3 mb-4">
                    {(['minio', 'local'] as StorageBackend[]).map(b => (
                        <button
                            key={b}
                            type="button"
                            disabled={demoMode}
                            onClick={() => {
                                setBackend(b)
                                setSaveStatus('')
                                setTestStatus('')
                                setTestError('')
                                setSaveError('')
                            }}
                            className={`flex-1 py-3 rounded-2xl font-black text-sm border-2 transition-all ${backend === b ? 'border-violet-400 bg-violet-50 text-violet-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'} disabled:opacity-60 disabled:cursor-not-allowed`}
                        >
                            <span className="inline-flex items-center gap-2">
                                <span>{b === 'local' ? '💾 Local Disk' : '☁️ MinIO'}</span>
                                {configuredBackend === b ? (
                                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                                        Current
                                    </span>
                                ) : null}
                            </span>
                        </button>
                    ))}
                </div>

                {backend === 'local' && (
                    <div className="space-y-3">
                        <div>
                            <label className="block text-xs font-black uppercase tracking-wide text-gray-500 mb-1.5">Local Path</label>
                            <input
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-violet-200"
                                value={localPath}
                                onChange={e => setLocalPath(e.target.value)}
                                disabled={demoMode}
                                placeholder="/var/rooiam/storage"
                            />
                            <p className="mt-1.5 text-xs font-semibold text-gray-400">Absolute path on the server's local disk. The directory will be created if it doesn't exist.</p>
                        </div>
                    </div>
                )}

                {backend === 'minio' && (
                    <div className="space-y-3">
                        <div>
                            <label className="block text-xs font-black uppercase tracking-wide text-gray-500 mb-1.5">Endpoint</label>
                            <input
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-violet-200"
                                value={minioEndpoint}
                                onChange={e => updateMinioEndpoint(e.target.value)}
                                disabled={demoMode}
                                placeholder="minio.example.com or http://localhost:9000"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-black uppercase tracking-wide text-gray-500 mb-1.5">Bucket</label>
                            <input
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-violet-200"
                                value={minioBucket}
                                onChange={e => setMinioBucket(e.target.value)}
                                disabled={demoMode}
                                placeholder="rooiam-media"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-black uppercase tracking-wide text-gray-500 mb-1.5">Access Key</label>
                            <input
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-violet-200"
                                value={minioAccessKey}
                                onChange={e => setMinioAccessKey(e.target.value)}
                                disabled={demoMode}
                                placeholder="minioadmin"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-black uppercase tracking-wide text-gray-500 mb-1.5">
                                Secret Key
                                {config?.minio_secret_key_configured && !minioSecretKey && (
                                    <span className="ml-2 text-xs font-bold text-green-600">● configured</span>
                                )}
                            </label>
                            <div className="relative">
                                <input
                                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 pr-10 text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-violet-200"
                                    type={showSecret ? 'text' : 'password'}
                                    value={minioSecretKey}
                                    onChange={e => setMinioSecretKey(e.target.value)}
                                    disabled={demoMode}
                                    placeholder={config?.minio_secret_key_configured ? '(leave blank to keep existing)' : 'secret-key'}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowSecret(v => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                        <p className="text-xs font-semibold text-gray-400">
                            Use an <span className="font-black text-gray-600">https://</span> endpoint for SSL or an <span className="font-black text-gray-600">http://</span> endpoint for local plain HTTP.
                        </p>
                    </div>
                )}

                {testStatus && (
                    <div className="rounded-2xl bg-green-50 px-4 py-2.5 text-xs font-bold text-green-700">
                        {testStatus
                            .split(/(?<=\.)\s+/)
                            .filter(Boolean)
                            .map((line, i) => (
                                <p key={i} className="flex gap-1.5">
                                    <span className="text-green-500">✓</span>
                                    <span>{line}</span>
                                </p>
                            ))}
                    </div>
                )}
                {testError && (
                    <div className="rounded-2xl bg-red-50 px-4 py-2.5 text-xs font-bold text-red-500">
                        {testError
                            .split(/(?<=\.)\s+/)
                            .filter(Boolean)
                            .map((line, i) => (
                                <p key={i}>{line}</p>
                            ))}
                    </div>
                )}
                {saveStatus && <p className="text-xs font-bold text-green-700 bg-green-50 rounded-2xl px-4 py-2.5">{saveStatus}</p>}
                {saveError && <p className="text-xs font-bold text-red-500 bg-red-50 rounded-2xl px-4 py-2.5">{saveError}</p>}

                <div className="flex justify-start pt-2">
                    <button
                        type="button"
                        onClick={testStorage}
                        disabled={testing}
                        className="wizard-btn inline-flex items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <HardDrive className="w-4 h-4" />}
                        {configuredBackend === backend && saveStatus ? 'Saved ✓' : 'Test & Save'}
                    </button>
                </div>
            </ContentCard>
        </div>
    )
}

// ── Session Policy Tab (platform owner — configures session & magic link durations) ──

const SESSION_DURATION_OPTIONS = [
    { label: '1 day', value: 1 },
    { label: '3 days', value: 3 },
    { label: '7 days (default)', value: 7 },
    { label: '14 days', value: 14 },
    { label: '30 days', value: 30 },
    { label: '90 days', value: 90 },
]

const MAGIC_LINK_EXPIRY_OPTIONS = [
    { label: '5 minutes', value: 5 },
    { label: '10 minutes', value: 10 },
    { label: '15 minutes (default)', value: 15 },
    { label: '30 minutes', value: 30 },
    { label: '1 hour', value: 60 },
    { label: '24 hours', value: 1440 },
]

const MAGIC_LINK_RATE_LIMIT_OPTIONS = [
    { label: '3 attempts', value: 3 },
    { label: '5 attempts (default)', value: 5 },
    { label: '10 attempts', value: 10 },
    { label: '20 attempts', value: 20 },
]

const MAGIC_LINK_RATE_WINDOW_OPTIONS = [
    { label: '5 minutes', value: 300 },
    { label: '10 minutes (default)', value: 600 },
    { label: '15 minutes', value: 900 },
    { label: '30 minutes', value: 1800 },
    { label: '1 hour', value: 3600 },
]

const OIDC_ACCESS_TOKEN_TTL_OPTIONS = [
    { label: '5 minutes', value: 5 },
    { label: '15 minutes', value: 15 },
    { label: '30 minutes', value: 30 },
    { label: '1 hour (default)', value: 60 },
    { label: '2 hours', value: 120 },
    { label: '4 hours', value: 240 },
    { label: '24 hours', value: 1440 },
]

const REFRESH_TOKEN_TTL_OPTIONS = [
    { label: '1 day', value: 1 },
    { label: '7 days', value: 7 },
    { label: '14 days', value: 14 },
    { label: '30 days (default)', value: 30 },
    { label: '60 days', value: 60 },
    { label: '90 days', value: 90 },
]

const IDLE_TIMEOUT_OPTIONS = [
    { label: 'Disabled (default)', value: 0 },
    { label: '15 minutes', value: 15 },
    { label: '30 minutes', value: 30 },
    { label: '1 hour', value: 60 },
    { label: '2 hours', value: 120 },
    { label: '4 hours', value: 240 },
    { label: '8 hours', value: 480 },
]

const selectClass = 'w-full min-w-0 rounded-2xl border-2 border-border bg-white px-4 py-2.5 text-sm font-bold outline-none transition focus:ring-2 focus:ring-primary sm:w-60'

function SelectField({ value, onChange, options }: {
    value: number
    onChange: (v: number) => void
    options: { label: string; value: number }[]
}) {
    return (
        <select value={value} onChange={e => onChange(Number(e.target.value))} className={selectClass}>
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
    )
}

function SessionPolicyGroup({
    title,
    description,
    children,
}: {
    title: string
    description: string
    children: React.ReactNode
}) {
    return (
        <div className="rounded-3xl border border-border bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4">
                <h3 className="text-sm font-black uppercase tracking-[0.18em] text-gray-700">{title}</h3>
                <p className="mt-1 text-sm font-medium text-muted-foreground">{description}</p>
            </div>
            <div className="space-y-4">{children}</div>
        </div>
    )
}

function SessionPolicyFieldCard({
    label,
    description,
    children,
}: {
    label: string
    description: string
    children: React.ReactNode
}) {
    return (
        <div className="rounded-3xl border border-border bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                    <p className="text-sm font-black text-gray-900">{label}</p>
                    <p className="mt-1 text-sm font-medium text-muted-foreground">{description}</p>
                </div>
                <div className="w-full shrink-0 sm:w-auto">
                    {children}
                </div>
            </div>
        </div>
    )
}

function SessionPolicyIntroCard({
    title,
    subtitle,
    badge,
}: {
    title: string
    subtitle: string
    badge?: React.ReactNode
}) {
    return (
        <div className="rounded-3xl border border-border bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <h3 className="text-lg font-black text-gray-900">{title}</h3>
                    <p className="mt-1 text-sm font-medium text-indigo-600">{subtitle}</p>
                </div>
                {badge ? <div className="shrink-0">{badge}</div> : null}
            </div>
        </div>
    )
}

function SessionPolicyActionBar({
    error,
    saving,
    saved,
    onSave,
}: {
    error: string
    saving: boolean
    saved: boolean
    onSave: () => void
}) {
    return (
        <SaveActionFooter
            error={error}
            loading={saving}
            saved={saved}
            onClick={onSave}
            note="Changes apply to new sessions and token issuance. Existing sessions keep their current lifetime until renewed or revoked."
        />
    )
}

function SessionPolicySummary({
    items,
}: {
    items: { label: string; value: string; tone?: 'rose' | 'indigo' | 'violet' | 'emerald' }[]
}) {
    return (
        <div className="rounded-3xl border border-border bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4">
                <h3 className="text-sm font-black uppercase tracking-[0.18em] text-gray-700">Current Policy Snapshot</h3>
                <p className="mt-1 text-sm font-medium text-muted-foreground">
                    A quick read of the current session and token limits before you adjust the detailed settings below.
                </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                {items.map(item => (
                    <div key={item.label} className="rounded-2xl border border-border/80 bg-white px-4 py-3">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">{item.label}</p>
                        <p className="mt-2 text-sm font-black text-gray-900">{item.value}</p>
                    </div>
                ))}
            </div>
        </div>
    )
}

function optionLabel(options: { label: string; value: number }[], value: number | null) {
    if (value === null) {
        return 'Inherit from platform'
    }
    return options.find(o => o.value === value)?.label ?? String(value)
}

function AdminSessionPolicyTab()
{
    const [policy, setPolicy] = useState<SessionPolicy | null>(null)
    const [sessionDays, setSessionDays] = useState(7)
    const [magicMins, setMagicMins] = useState(15)
    const [oidcMins, setOidcMins] = useState(60)
    const [refreshDays, setRefreshDays] = useState(30)
    const [idleMins, setIdleMins] = useState(0)
    const [rateLimit, setRateLimit] = useState(5)
    const [rateWindow, setRateWindow] = useState(600)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        sysAdminApi.sessionPolicy()
            .then(p => {
                setPolicy(p)
                setSessionDays(p.session_duration_days)
                setMagicMins(p.magic_link_expiry_minutes)
                setOidcMins(p.oidc_access_token_ttl_minutes)
                setRefreshDays(p.refresh_token_ttl_days)
                setIdleMins(p.idle_timeout_minutes)
                setRateLimit(p.magic_link_rate_limit)
                setRateWindow(p.magic_link_rate_window_seconds)
            })
            .catch(() => setError('Could not load session policy.'))
    }, [])

    const handleSave = async () => {
        setSaving(true)
        setError('')
        setSaved(false)
        try {
            const updated = await sysAdminApi.updateSessionPolicy({
                session_duration_days: sessionDays,
                magic_link_expiry_minutes: magicMins,
                oidc_access_token_ttl_minutes: oidcMins,
                refresh_token_ttl_days: refreshDays,
                idle_timeout_minutes: idleMins,
                magic_link_rate_limit: rateLimit,
                magic_link_rate_window_seconds: rateWindow,
            })
            setPolicy(updated)
            setSaved(true)
            setTimeout(() => setSaved(false), 3000)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to save.')
        } finally {
            setSaving(false)
        }
    }

    if (!policy) return <p className="text-xs font-semibold text-gray-400">{error || 'Loading…'}</p>

    return (
        <div className="max-w-3xl space-y-6">
            <SessionPolicyIntroCard
                title="Session & Token Lifetimes"
                subtitle="Platform-wide defaults. Tenants may only set equal to or stricter limits."
                badge={saved ? <span className="cute-badge bg-emerald-100 text-emerald-700">Saved</span> : undefined}
            />

            <HintBox level="warning" title="Platform defaults">
                Tenants can only inherit these values or choose settings that are equal to or stricter than the platform policy.
            </HintBox>

            <SessionPolicySummary
                items={[
                    { label: 'Session', value: optionLabel(SESSION_DURATION_OPTIONS, sessionDays) },
                    { label: 'Magic Link', value: optionLabel(MAGIC_LINK_EXPIRY_OPTIONS, magicMins) },
                    { label: 'Access Token', value: optionLabel(OIDC_ACCESS_TOKEN_TTL_OPTIONS, oidcMins) },
                    { label: 'Idle Timeout', value: optionLabel(IDLE_TIMEOUT_OPTIONS, idleMins) },
                    { label: 'Rate Limit', value: `${rateLimit} per ${optionLabel(MAGIC_LINK_RATE_WINDOW_OPTIONS, rateWindow)}` },
                ]}
            />

            <SessionPolicyGroup
                title="Login Sessions"
                description="Control how long operator sessions remain valid and how quickly inactive sessions expire."
            >
                <SessionPolicyFieldCard
                    label="Session Duration"
                    description="How long a login session stays valid before requiring re-login."
                >
                    <SelectField value={sessionDays} onChange={setSessionDays} options={SESSION_DURATION_OPTIONS} />
                </SessionPolicyFieldCard>

                <SessionPolicyFieldCard
                    label="Idle Timeout"
                    description="Auto-logout users after inactivity. Disabled means never auto-logout."
                >
                    <SelectField value={idleMins} onChange={setIdleMins} options={IDLE_TIMEOUT_OPTIONS} />
                </SessionPolicyFieldCard>
            </SessionPolicyGroup>

            <SessionPolicyGroup
                title="Passwordless & OAuth Tokens"
                description="Define how long passwordless login links and issued OAuth tokens remain usable."
            >
                <SessionPolicyFieldCard
                    label="Magic Link Expiry"
                    description="How long a passwordless email link stays valid after being sent."
                >
                    <SelectField value={magicMins} onChange={setMagicMins} options={MAGIC_LINK_EXPIRY_OPTIONS} />
                </SessionPolicyFieldCard>

                <SessionPolicyFieldCard
                    label="OIDC Access Token Lifetime"
                    description="How long issued OIDC or OAuth2 access tokens remain valid."
                >
                    <SelectField value={oidcMins} onChange={setOidcMins} options={OIDC_ACCESS_TOKEN_TTL_OPTIONS} />
                </SessionPolicyFieldCard>

                <SessionPolicyFieldCard
                    label="Refresh Token Lifetime"
                    description="How long refresh tokens can be used to obtain new access tokens."
                >
                    <SelectField value={refreshDays} onChange={setRefreshDays} options={REFRESH_TOKEN_TTL_OPTIONS} />
                </SessionPolicyFieldCard>
            </SessionPolicyGroup>

            <SessionPolicyGroup
                title="Spam & Brute Force Protection"
                description="Configure the platform-wide floor for magic link rate limiting. Individual workspaces may only tighten these limits."
            >
                <SessionPolicyFieldCard
                    label="Magic Link Rate Limit"
                    description="The maximum number of magic link requests allowed within a single window."
                >
                    <SelectField value={rateLimit} onChange={setRateLimit} options={MAGIC_LINK_RATE_LIMIT_OPTIONS} />
                </SessionPolicyFieldCard>

                <SessionPolicyFieldCard
                    label="Rate Limit Window"
                    description="The time interval used to calculate the request rate. A longer window is stricter."
                >
                    <SelectField value={rateWindow} onChange={setRateWindow} options={MAGIC_LINK_RATE_WINDOW_OPTIONS} />
                </SessionPolicyFieldCard>
            </SessionPolicyGroup>

            <SessionPolicyActionBar error={error} saving={saving} saved={saved} onSave={handleSave} />
        </div>
    )
}

// ── Main Settings Page ───────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'database', label: 'Database', icon: <Database className="w-4 h-4" /> },
    { id: 'urls', label: 'Public URLs', icon: <Link2 className="w-4 h-4" /> },
    { id: 'smtp', label: 'SMTP', icon: <Mail className="w-4 h-4" /> },
    { id: 'redis', label: 'Redis', icon: <Database className="w-4 h-4" /> },
    { id: 'storage', label: 'Storage', icon: <HardDrive className="w-4 h-4" /> },
    { id: 'oauth', label: 'OAuth Providers', icon: <Globe className="w-4 h-4" /> },
    { id: 'session-policy', label: 'Session Policy', icon: <Shield className="w-4 h-4" /> },
    { id: 'linked', label: 'Linked Accounts', icon: <Link2 className="w-4 h-4" /> },
    { id: 'sessions', label: 'Sessions', icon: <Shield className="w-4 h-4" /> },
    { id: 'security', label: 'Security', icon: <Shield className="w-4 h-4" /> },
]

function SettingsPage({ scope }: { scope: 'settings' | 'access' })
{
    const availableTabs = scope === 'settings'
        ? TABS.filter(tab => ['database', 'urls', 'smtp', 'redis', 'storage', 'oauth'].includes(tab.id))
        : TABS.filter(tab => ['linked', 'sessions', 'security'].includes(tab.id))
    const fallbackTab = scope === 'settings' ? 'database' : 'linked'
    const [tab, setTab] = useState<Tab>(fallbackTab as Tab)

    const handleTabChange = (id: Tab) => {
        setTab(id)
    }

    useEffect(() => {
        if (!availableTabs.some(item => item.id === tab)) {
            setTab(fallbackTab as Tab)
        }
    }, [availableTabs, fallbackTab, tab])

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PageHeader
                title={scope === 'settings' ? 'Platform Settings' : 'My Account'}
                description={
                    scope === 'settings'
                        ? 'Configure public URLs, SMTP, Redis, storage, and OAuth providers for your Rooiam instance.'
                        : 'Manage your sign-in methods, linked accounts, active sessions, and security settings.'
                }
            />

            {/* Tab bar */}
            <div className="flex gap-2 border-b pb-0" style={{ borderColor: '#FFE8F0' }}>
                {availableTabs.map(t => (
                    <button key={t.id} onClick={() => handleTabChange(t.id)}
                        className={`flex items-center gap-2 px-4 py-3 font-black text-sm rounded-t-2xl transition-all border-b-2 -mb-px ${tab === t.id
                                ? 'text-pink-600 border-pink-400 bg-pink-50'
                                : 'text-gray-400 border-transparent hover:text-gray-600'
                            }`}>
                        {t.icon} {t.label}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            <div>
                {tab === 'database' && <DatabaseSettingsTab />}
                {tab === 'urls' && <UrlsTab />}
                {tab === 'smtp' && <EmailSmtpTab />}
                {tab === 'redis' && <RedisSettingsTab />}
                {tab === 'storage' && <StorageSettingsTab />}
                {tab === 'oauth' && <OAuthProvidersTab />}
                {tab === 'linked' && <MyAccountTab />}

                {tab === 'sessions' && <MySessionsTab />}
                {tab === 'security' && <MySecurityTab />}
            </div>
        </div>
    )
}

export function AdminSettings() {
    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PageHeader
                title="Session Policy"
                description="Configure platform-wide session lifetime, token expiry, and passwordless sign-in limits."
            />
            <AdminSessionPolicyTab />
        </div>
    )
}

function TenantOperatorSessionPolicyTab()
{
    const [policy, setPolicy] = useState<TenantSessionPolicyValue | null>(null)
    const [sessionDays, setSessionDays] = useState(7)
    const [magicMins, setMagicMins] = useState(15)
    const [idleMins, setIdleMins] = useState(0)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        sysAdminApi.tenantSessionPolicy()
            .then(p => {
                setPolicy(p)
                setSessionDays(p.session_duration_days)
                setMagicMins(p.magic_link_expiry_minutes)
                setIdleMins(p.idle_timeout_minutes)
            })
            .catch(() => setError('Could not load tenant session policy.'))
    }, [])

    const handleSave = async () => {
        setSaving(true)
        setError('')
        setSaved(false)
        try {
            const updated = await sysAdminApi.updateTenantSessionPolicy({
                session_duration_days: sessionDays,
                magic_link_expiry_minutes: magicMins,
                idle_timeout_minutes: idleMins,
            })
            setPolicy(updated)
            setSaved(true)
            setTimeout(() => setSaved(false), 3000)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to save.')
        } finally {
            setSaving(false)
        }
    }

    if (!policy) return <p className="text-xs font-semibold text-gray-400">{error || 'Loading…'}</p>

    return (
        <div className="max-w-3xl space-y-6">
            <SessionPolicyIntroCard
                title="Tenant Session Policy"
                subtitle="Control tenant operator login sessions at 5172."
                badge={saved ? <span className="cute-badge bg-emerald-100 text-emerald-700">Saved</span> : undefined}
            />

            <HintBox level="warning" title="Tenant operators only">
                This policy applies to tenant owners and tenant admins signing into `5172`. It does not control workspace end-user sessions.
            </HintBox>

            <SessionPolicySummary
                items={[
                    { label: 'Session', value: optionLabel(SESSION_DURATION_OPTIONS, sessionDays) },
                    { label: 'Magic Link', value: optionLabel(MAGIC_LINK_EXPIRY_OPTIONS, magicMins) },
                    { label: 'Idle Timeout', value: optionLabel(IDLE_TIMEOUT_OPTIONS, idleMins) },
                ]}
            />

            <SessionPolicyGroup
                title="Tenant Operator Sessions"
                description="Set login lifetime and inactivity rules for tenant operators using 5172."
            >
                <SessionPolicyFieldCard
                    label="Session Duration"
                    description="How long a tenant operator session stays valid before requiring sign-in again."
                >
                    <SelectField value={sessionDays} onChange={setSessionDays} options={SESSION_DURATION_OPTIONS} />
                </SessionPolicyFieldCard>

                <SessionPolicyFieldCard
                    label="Idle Timeout"
                    description="Auto-logout tenant operators after inactivity. Disabled means no inactivity timeout."
                >
                    <SelectField value={idleMins} onChange={setIdleMins} options={IDLE_TIMEOUT_OPTIONS} />
                </SessionPolicyFieldCard>
            </SessionPolicyGroup>

            <SessionPolicyGroup
                title="Passwordless Login"
                description="Control how long tenant-operator magic links remain valid."
            >
                <SessionPolicyFieldCard
                    label="Magic Link Expiry"
                    description="How long a tenant-operator magic link stays valid after being sent."
                >
                    <SelectField value={magicMins} onChange={setMagicMins} options={MAGIC_LINK_EXPIRY_OPTIONS} />
                </SessionPolicyFieldCard>
            </SessionPolicyGroup>

            <SessionPolicyActionBar error={error} saving={saving} saved={saved} onSave={handleSave} />
        </div>
    )
}

export function WorkspaceRules()
{
    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PageHeader
                title="Tenant Workspace Rules"
                description="Tenant-wide limits and rules for workspace creation across the platform."
            />
            <TenantWorkspaceRulesTab />
        </div>
    )
}

export function TenantSessionPolicySettings()
{
    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PageHeader
                eyebrow="Tenant"
                title="Tenant Session Policy"
                description="Configure session lifetime, magic-link expiry, and inactivity timeout for tenant operators at 5172."
            />
            <HintBox level="info" title="Tenant operator policy">
                This page controls tenant owner and tenant admin sessions at 5172. It does not control workspace end-user sessions.
            </HintBox>
            <TenantOperatorSessionPolicyTab />
        </div>
    )
}

// ── Workspace Session Policy ──────────────────────────────────────────────────

function TenantWorkspaceSessionPolicyTab({ orgId }: { orgId: string })
{
    const [policy, setPolicy] = useState<OrgSessionPolicy | null>(null)
    const [error, setError] = useState('')

    useEffect(() => {
        sysAdminApi.orgSessionPolicy(orgId)
            .then(setPolicy)
            .catch(() => setError('Could not load session policy.'))
    }, [orgId])

    if (!policy) return <p className="text-xs font-semibold text-gray-400">{error || 'Loading…'}</p>

    return (
        <div className="max-w-3xl space-y-6">
            <SessionPolicyIntroCard
                title="Tenant Workspace Session Policy"
                subtitle="View the effective platform-governed session and token limits for this workspace."
            />

            <HintBox level="info" title="Platform-governed view">
                Workspace session policy is view-only here. Changes to workspace session behavior are governed from the platform side.
            </HintBox>

            <SessionPolicySummary
                items={[
                    { label: 'Session', value: optionLabel(SESSION_DURATION_OPTIONS, policy.session_duration_days) },
                    { label: 'Magic Link', value: optionLabel(MAGIC_LINK_EXPIRY_OPTIONS, policy.magic_link_expiry_minutes) },
                    { label: 'Access Token', value: optionLabel(OIDC_ACCESS_TOKEN_TTL_OPTIONS, policy.oidc_access_token_ttl_minutes) },
                    { label: 'Idle Timeout', value: optionLabel(IDLE_TIMEOUT_OPTIONS, policy.idle_timeout_minutes) },
                ]}
            />

            <SessionPolicyGroup
                title="Workspace Sessions"
                description="Tune session lifetime and inactivity rules for this workspace without exceeding the platform policy."
            >
                <SessionPolicyFieldCard
                    label="Session Duration"
                    description="How long a login session stays valid before re-authentication is required."
                >
                    <p className="text-sm font-black text-gray-900">{optionLabel(SESSION_DURATION_OPTIONS, policy.session_duration_days)}</p>
                </SessionPolicyFieldCard>

                <SessionPolicyFieldCard
                    label="Idle Timeout"
                    description="Auto-logout after inactivity."
                >
                    <p className="text-sm font-black text-gray-900">{optionLabel(IDLE_TIMEOUT_OPTIONS, policy.idle_timeout_minutes)}</p>
                </SessionPolicyFieldCard>
            </SessionPolicyGroup>

            <SessionPolicyGroup
                title="Passwordless & OAuth Tokens"
                description="Tighten token lifetime and magic-link validity for users of this workspace."
            >
                <SessionPolicyFieldCard
                    label="Magic Link Expiry"
                    description="How long a passwordless email link stays valid after being sent."
                >
                    <p className="text-sm font-black text-gray-900">{optionLabel(MAGIC_LINK_EXPIRY_OPTIONS, policy.magic_link_expiry_minutes)}</p>
                </SessionPolicyFieldCard>

                <SessionPolicyFieldCard
                    label="OIDC Access Token Lifetime"
                    description="How long issued access tokens remain valid."
                >
                    <p className="text-sm font-black text-gray-900">{optionLabel(OIDC_ACCESS_TOKEN_TTL_OPTIONS, policy.oidc_access_token_ttl_minutes)}</p>
                </SessionPolicyFieldCard>

                <SessionPolicyFieldCard
                    label="Refresh Token Lifetime"
                    description="How long refresh tokens can be used to issue new access tokens."
                >
                    <p className="text-sm font-black text-gray-900">{optionLabel(REFRESH_TOKEN_TTL_OPTIONS, policy.refresh_token_ttl_days)}</p>
                </SessionPolicyFieldCard>
            </SessionPolicyGroup>
        </div>
    )
}

export function WorkspaceSessionPolicy({ orgId }: { orgId: string })
{
    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PageHeader
                title="Tenant Workspace Session Policy"
                description="View the effective platform-governed session and token lifetimes for this workspace."
            />
            <TenantWorkspaceSessionPolicyTab orgId={orgId} />
        </div>
    )
}

export function Access()
{
    return <SettingsPage scope="access" />
}

export default function PlatformSettings()
{
    return <SettingsPage scope="settings" />
}
