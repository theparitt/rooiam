import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import
    {
        User, Mail, Key, CheckCircle,
        ChevronRight, Loader2, Eye, EyeOff, ArrowRight,
        Wifi, AlertCircle, Check, Globe, HelpCircle, HardDrive, ExternalLink
    } from 'lucide-react'
import { getApiBase, getApiOrigin, getOAuthCallbackUrl } from '@/lib/api-base'
import { setupApi, type PublicUrls, type SetupConfig, type StorageBackend, type PlatformStorageConfigUpdate } from '@/lib/api'
import { getSetupAuthHeaders, getSetupToken, setSetupToken } from '@/lib/setup-token'
import HintBox from '@/components/ui/HintBox'

// ── Types ────────────────────────────────────────────────────────────────────

type StepId = 'welcome' | 'connection' | 'database' | 'admin' | 'smtp' | 'storage' | 'oauth' | 'done'

interface StepDef
{
    id: StepId
    label: string
    icon: React.ReactNode
    optional?: boolean
}

const STEPS: StepDef[] = [
    { id: 'welcome', label: 'Welcome', icon: <img src="/logo.svg" className="w-5 h-5" alt="" /> },
    { id: 'connection', label: 'Server', icon: <Wifi className="w-4 h-4" /> },
    { id: 'database', label: 'Database', icon: <HardDrive className="w-4 h-4" /> },
    { id: 'admin', label: 'Admin Account', icon: <User className="w-4 h-4" /> },
    { id: 'smtp', label: 'Email / SMTP', icon: <Mail className="w-4 h-4" />, optional: true },
    { id: 'storage', label: 'Storage', icon: <HardDrive className="w-4 h-4" /> },
    { id: 'oauth', label: 'OAuth', icon: <Key className="w-4 h-4" />, optional: true },
    { id: 'done', label: 'All Set!', icon: <CheckCircle className="w-4 h-4" /> },
]

// ── Sub-steps ────────────────────────────────────────────────────────────────

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
                <div className="rounded-2xl bg-slate-50 border border-slate-200 px-3 py-2 mb-2">
                    <p className="text-xs font-semibold text-gray-600">{help}</p>
                </div>
            )}
        </div>
    )
}

function WelcomeStep({ onNext }: { onNext: () => void })
{
    return (
        <div className="flex flex-col items-center text-center max-w-md mx-auto">
            <img src="/wordmark.svg" alt="Rooiam" className="h-12 w-auto mb-8" />
            <h1 className="text-3xl font-black text-gray-900 mb-3">Welcome to Rooiam 👋</h1>
            <p className="text-base font-semibold text-gray-500 mb-2 leading-relaxed">
                Let's get your Identity & Access Management system set up. This wizard will walk you through
                the essential configuration in just a few minutes.
            </p>
            <p className="text-sm font-semibold text-gray-400 mb-10">
                You can always change these settings later in the admin panel.
            </p>
            <div className="w-full rounded-3xl border-2 p-5 mb-8 text-left space-y-3"
                style={{ borderColor: '#B5EFD5', background: '#F0FFF8' }}>
                {[
                    { icon: '🔌', text: 'Verify server connection' },
                    { icon: '🗄️', text: 'Verify database connection' },
                    { icon: '👤', text: 'Create your platform owner account' },
                    { icon: '✉️', text: 'Configure email for magic links (optional)' },
                    { icon: '🔐', text: 'Enable Google / Microsoft OAuth (optional)' },
                ].map(item => (
                    <div key={item.text} className="flex items-center gap-3">
                        <span className="text-xl">{item.icon}</span>
                        <span className="text-sm font-bold text-gray-700">{item.text}</span>
                    </div>
                ))}
            </div>
            <button onClick={onNext} className="wizard-btn w-full">
                Let's get started <ArrowRight className="w-4 h-4" />
            </button>
        </div>
    )
}

function ConnectionStep({ onNext, onBack }: { onNext: () => void; onBack: () => void })
{
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
    const [status, setStatus] = useState<'idle' | 'checking' | 'ok' | 'error'>('idle')
    const [details, setDetails] = useState('')
    const [urls, setUrls] = useState<PublicUrls | null>(null)
    const [form, setForm] = useState(defaultUrls)
    const [setupToken, setSetupTokenValue] = useState(getSetupToken() ?? '')
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState('')

    const check = async () =>
    {
        setStatus('checking')
        try
        {
            const res = await fetch(`${apiOrigin}/health`)
            if (res.ok)
            {
                const data = await res.json()
                setDetails(`Version: ${data.version || 'v1'}`)
                setStatus('ok')
            } else
            {
                setStatus('error')
                setDetails(`Server returned ${res.status}`)
            }
        } catch
        {
            setStatus('error')
            setDetails(`Could not reach ${apiOrigin}`)
        }
    }

    useEffect(() => {
        check()
        setupApi.publicUrls()
            .then(data => {
                setUrls(data)
                setForm({
                    issuer_url: data.issuer_url || defaultUrls.issuer_url,
                    frontend_url: data.frontend_url || defaultUrls.frontend_url,
                    admin_url: data.admin_url || defaultUrls.admin_url,
                })
            })
            .catch(() => {
                setSaveError('Could not load current public URLs.')
            })
    }, [])

    const saveUrls = async () => {
        setSaving(true)
        setSaveError('')
        try {
            setSetupToken(setupToken)
            const data = await setupApi.savePublicUrls(form)
            setUrls(data)
            onNext()
        } catch (error) {
            setSaveError(error instanceof Error ? error.message : 'Failed to save public URLs.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="max-w-md mx-auto">
            <h2 className="text-2xl font-black text-gray-900 mb-2">Server Connection</h2>
            <p className="text-sm font-semibold text-gray-400 mb-8">
                Confirm the API is reachable, then confirm the public URLs Rooiam should use in emails, redirects, and OAuth callbacks.
            </p>

            <div className={`rounded-3xl border-2 p-6 mb-6 flex items-center gap-4 transition-all ${status === 'ok' ? 'border-green-200 bg-green-50' :
                status === 'error' ? 'border-red-200 bg-red-50' :
                    'border-gray-200 bg-gray-50'
                }`}>
                {status === 'checking' && <Loader2 className="w-6 h-6 text-gray-400 animate-spin shrink-0" />}
                {status === 'ok' && <Check className="w-6 h-6 text-green-500 shrink-0" />}
                {status === 'error' && <AlertCircle className="w-6 h-6 text-red-400 shrink-0" />}
                {status === 'idle' && <Wifi className="w-6 h-6 text-gray-300 shrink-0" />}
                <div>
                    <p className="font-black text-sm text-gray-800">
                        {status === 'checking' ? 'Connecting...' :
                            status === 'ok' ? 'Server is running ✅' :
                                status === 'error' ? 'Cannot reach server' : 'Ready to check'}
                    </p>
                    <p className="text-xs font-semibold text-gray-400 mt-0.5">
                        {details || apiOrigin}
                    </p>
                </div>
            </div>

            {status === 'error' && (
                <div className="rounded-2xl p-4 mb-6 text-sm font-semibold text-gray-600"
                    style={{ background: '#FFF8F0', border: '1px solid #FFB07F' }}>
                    💡 Make sure the Rooiam server is running:<br />
                    <code className="text-xs font-mono text-orange-600">cargo run</code> in the <code className="text-xs font-mono text-orange-600">rooiam-server</code> directory.
                </div>
            )}

            <div className="space-y-4 mb-6">
                <div>
                    <HelpLabel
                        label="API Base URL"
                        hint="The public URL of rooiam-server."
                        help="Rooiam uses this server URL as its public identity for OIDC discovery, OAuth provider callbacks, API links, and email links."
                    />
                    <input
                        className="wizard-input"
                        value={form.issuer_url}
                        onChange={e => setForm(current => ({ ...current, issuer_url: e.target.value }))}
                    />
                </div>
                <div>
                    <HelpLabel
                        label="Admin App URL"
                        hint="Where platform owners and platform admins sign in."
                        help="Rooiam uses this URL when admin magic links and admin verification flows need to return a user to the platform admin console."
                    />
                    <input
                        className="wizard-input"
                        value={form.admin_url}
                        onChange={e => setForm(current => ({ ...current, admin_url: e.target.value }))}
                    />
                </div>
                <div>
                    <HelpLabel
                        label="Hosted Auth / Tenant App URL"
                        hint="Where tenant owners, workspace admins, and tenant/workspace users complete sign-in."
                        help="Rooiam uses this URL for non-admin magic links, hosted auth redirects, and tenant/workspace flows. This is not the public landing page URL."
                    />
                    <input
                        className="wizard-input"
                        value={form.frontend_url}
                        onChange={e => setForm(current => ({ ...current, frontend_url: e.target.value }))}
                    />
                </div>
                <div>
                    <HelpLabel
                        label="Setup Token"
                        hint="Required only for first-time setup from a public or non-localhost browser."
                        help="If the server is configured with ROOIAM_SETUP_TOKEN, paste that value here. Rooiam will send it on setup requests so remote first-time setup is allowed."
                    />
                    <input
                        type="password"
                        autoComplete="off"
                        placeholder="Paste ROOIAM_SETUP_TOKEN only if your server requires it"
                        className="wizard-input"
                        value={setupToken}
                        onChange={e => {
                            const value = e.target.value
                            setSetupTokenValue(value)
                            setSetupToken(value)
                        }}
                    />
                    <p className="mt-1.5 text-xs font-semibold text-gray-400">
                        Leave this blank for localhost setup. Use it for public first-time setup when the server shows:
                        <span className="ml-1 font-bold text-gray-500">ROOIAM_SETUP_TOKEN</span>
                    </p>
                </div>
                {urls && (
                    <div className="rounded-2xl bg-slate-50 px-4 py-3 space-y-2">
                        <p className="text-xs font-bold text-gray-500">OAuth callbacks generated from issuer</p>
                        <p className="text-[11px] font-mono text-gray-700 break-all">{getOAuthCallbackUrl('google', form.issuer_url || urls.issuer_url)}</p>
                        <p className="text-[11px] font-mono text-gray-700 break-all">{getOAuthCallbackUrl('microsoft', form.issuer_url || urls.issuer_url)}</p>
                    </div>
                )}
                {saveError && (
                    <p className="text-xs font-bold text-red-500 bg-red-50 rounded-2xl px-4 py-2.5">
                        {saveError}
                    </p>
                )}
            </div>

            <div className="flex gap-3">
                <button
                    type="button"
                    onClick={onBack}
                    className="flex-1 py-3 rounded-2xl font-black text-sm border-2 border-gray-200 hover:bg-gray-50 transition-all">
                    Back
                </button>
                {status === 'error' && (
                    <button onClick={check}
                        className="flex-1 py-3 rounded-2xl font-black text-sm border-2 border-gray-200 hover:bg-gray-50 transition-all">
                        Retry
                    </button>
                )}
                <button
                    onClick={saveUrls}
                    disabled={
                        status !== 'ok' ||
                        saving ||
                        !form.issuer_url.trim() ||
                        !form.frontend_url.trim() ||
                        !form.admin_url.trim()
                    }
                    className="wizard-btn flex-1 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Save & Continue <ArrowRight className="w-4 h-4" /></>}
                </button>
            </div>
        </div>
    )
}

function AdminStep({
    onNext,
    onBack,
    initialEmail,
    initialDisplayName,
    platformOwnerExists,
}: {
    onNext: (email: string) => void
    onBack: () => void
    initialEmail: string
    initialDisplayName: string
    platformOwnerExists: boolean
})
{
    const [email, setEmail] = useState(initialEmail)
    const [displayName, setDisplayName] = useState(initialDisplayName)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        setEmail(initialEmail)
        setDisplayName(initialDisplayName)
    }, [initialEmail, initialDisplayName])

    const submit = async (e: React.FormEvent) =>
    {
        e.preventDefault()
        setLoading(true)
        setError('')
        try
        {
            const data = await setupApi.saveOwnerDraft({
                email,
                display_name: displayName,
            })
            onNext(data.user_email || email)
        } catch (err)
        {
            setError(err instanceof Error ? err.message : 'Failed to save the platform owner draft.')
        } finally
        {
            setLoading(false)
        }
    }

    if (platformOwnerExists) return (
        <div className="max-w-md mx-auto text-center">
            <div className="text-6xl mb-4">🔒</div>
            <h2 className="text-2xl font-black text-gray-900 mb-2">
                Platform owner already exists
            </h2>
            <p className="text-sm font-semibold text-gray-400 mb-4">
                Rooiam already has a real platform owner account for <strong className="text-gray-700">{email || 'this installation'}</strong>.
                This setup wizard can only create the first platform owner and cannot replace it afterward.
            </p>
            {error && (
                <p className="text-xs font-bold text-amber-700 bg-amber-50 rounded-2xl px-4 py-2.5 mb-6">
                    {error}
                </p>
            )}
            <button onClick={() => onNext(email)} className="wizard-btn w-full">
                Continue <ArrowRight className="w-4 h-4" />
            </button>
        </div>
    )

    return (
        <div className="max-w-md mx-auto">
            <h2 className="text-2xl font-black text-gray-900 mb-2">Create Platform Owner</h2>
            <p className="text-sm font-semibold text-gray-400 mb-8">
                Save the platform owner draft now. The real platform owner account will only be created after all required setup verification is complete.
            </p>

            <form onSubmit={submit} className="space-y-4">
                <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-1.5">
                        Display Name
                    </label>
                    <input type="text" value={displayName} required placeholder="Alice Smith"
                        onChange={e => setDisplayName(e.target.value)}
                        className="wizard-input" />
                </div>
                <div>
                    <label className="block text-xs font-black text-gray-500 uppercase tracking-wide mb-1.5">
                        Email Address
                    </label>
                    <input type="email" value={email} required placeholder="admin@yourcompany.com"
                        onChange={e => setEmail(e.target.value)}
                        className="wizard-input" />
                </div>
                {error && (
                    <p className="text-xs font-bold text-red-500 bg-red-50 rounded-2xl px-4 py-2.5">
                        {error}
                    </p>
                )}
                <div className="flex gap-3 mt-2">
                    <button
                        type="button"
                        onClick={onBack}
                        className="flex-1 py-3 rounded-2xl font-black text-sm border-2 border-gray-200 hover:bg-gray-50 transition-all">
                        Back
                    </button>
                    <button type="submit" disabled={loading} className="wizard-btn flex-1">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Save & Continue <ArrowRight className="w-4 h-4" /></>}
                    </button>
                </div>
            </form>
        </div>
    )
}

function SmtpStep({
    onNext,
    onBack,
    initialValues,
    ownerEmail,
    verifiedEmail,
    verifiedAt,
    mailboxUrl,
}: {
    onNext: () => void
    onBack: () => void
    initialValues: { host: string; port: string; security: string; insecure_tls: boolean; username: string; password: string; from_email: string }
    ownerEmail: string
    verifiedEmail: string
    verifiedAt: string
    mailboxUrl: string | null
})
{
    const apiBase = getApiBase()
    const [form, setForm] = useState(initialValues)
    const [showPass, setShowPass] = useState(false)
    const toEmail = ownerEmail
    const [phase, setPhase] = useState<'config' | 'verify'>('config')
    const [code, setCode] = useState('')
    const [sending, setSending] = useState(false)
    const [verifying, setVerifying] = useState(false)
    const [error, setError] = useState('')
    const normalizedHost = form.host.trim().toLowerCase()
    const isMailhogDefault = (normalizedHost === '127.0.0.1' || normalizedHost === 'mailhog' || normalizedHost === 'localhost') && form.port === '1025'
    const emailAlreadyVerified =
        Boolean(toEmail.trim()) &&
        toEmail.trim().toLowerCase() === verifiedEmail.trim().toLowerCase()

    const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

    useEffect(() => { setForm(initialValues) }, [initialValues])
    useEffect(() => {
        if (emailAlreadyVerified) {
            setPhase('config')
            setCode('')
            setError('')
        }
    }, [emailAlreadyVerified, toEmail])

    const sendCode = async () => {
        setSending(true)
        setError('')
        try {
            const res = await fetch(`${apiBase}/setup/send-smtp-verification`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getSetupAuthHeaders() },
                body: JSON.stringify({ ...form, port: parseInt(form.port), test_email: toEmail }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                setError(data?.error?.message || 'Failed to send code. Check your SMTP settings.')
                return
            }
            setPhase('verify')
        } catch {
            setError(`Could not reach ${apiBase}.`)
        } finally {
            setSending(false)
        }
    }

    const verifyCode = async () => {
        setVerifying(true)
        setError('')
        try {
            const res = await fetch(`${apiBase}/setup/verify-smtp-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getSetupAuthHeaders() },
                body: JSON.stringify({ code, test_email: toEmail, ...form, port: parseInt(form.port) }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                setError(data?.error?.message || 'Incorrect or expired code.')
                return
            }
            onNext()
        } catch {
            setError(`Could not reach ${apiBase}.`)
        } finally {
            setVerifying(false)
        }
    }

    if (!toEmail) return (
        <div className="max-w-md mx-auto text-center">
            <div className="text-5xl mb-4">⏳</div>
            <p className="text-sm font-semibold text-gray-400">Loading platform owner info…</p>
        </div>
    )

    return (
        <div className="max-w-md mx-auto">
            <div className="flex items-center justify-between mb-2">
                <h2 className="text-2xl font-black text-gray-900">Email / SMTP</h2>
                <span className="text-xs font-black px-2.5 py-1 rounded-full"
                    style={{ background: '#FFE8F0', color: '#E5536A' }}>Required</span>
            </div>
            <p className="text-sm font-semibold text-gray-400 mb-4">
                Magic link login requires working email delivery. You must verify SMTP before continuing.
            </p>

            {phase === 'config' && (
                <div className="space-y-4">
                    {isMailhogDefault && (
                        <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-2">
                            <span className="text-amber-500 mt-0.5">⚠️</span>
                            <p className="text-xs font-semibold text-amber-700">
                                Using <span className="font-black">Mailhog</span> defaults — local Docker testing only.
                                Switch to a real SMTP provider before production.
                            </p>
                        </div>
                    )}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2">
                            <label className="wizard-label">SMTP Host</label>
                            <input className="wizard-input" placeholder="mailhog" value={form.host} onChange={e => set('host', e.target.value)} />
                        </div>
                        <div>
                            <label className="wizard-label">Port</label>
                            <input className="wizard-input" placeholder="1025" value={form.port} onChange={e => set('port', e.target.value)} />
                        </div>
                    </div>
                    <div>
                        <label className="wizard-label">Security</label>
                        <select className="wizard-input" value={form.security} onChange={e => set('security', e.target.value)}>
                            <option value="none">None (plain)</option>
                            <option value="starttls">STARTTLS</option>
                            <option value="tls">TLS / SSL</option>
                        </select>
                    </div>
                    {form.security !== 'none' && (
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input type="checkbox" className="w-4 h-4 rounded accent-purple-600"
                                checked={form.insecure_tls}
                                onChange={e => setForm(f => ({ ...f, insecure_tls: e.target.checked }))} />
                            <span className="text-sm font-semibold text-gray-600">
                                Skip TLS certificate verification
                                <span className="ml-1 text-gray-400 font-normal">(for self-signed certs)</span>
                            </span>
                        </label>
                    )}
                    <div>
                        <label className="wizard-label">Username <span className="text-gray-400 font-semibold">(optional)</span></label>
                        <input className="wizard-input" placeholder="Leave blank for Mailhog" value={form.username} onChange={e => set('username', e.target.value)} />
                    </div>
                    <div>
                        <label className="wizard-label">Password / API Key <span className="text-gray-400 font-semibold">(optional)</span></label>
                        <div className="relative">
                            <input className="wizard-input pr-10" type={showPass ? 'text' : 'password'}
                                placeholder="Leave blank for Mailhog" value={form.password}
                                onChange={e => set('password', e.target.value)} />
                            <button type="button" onClick={() => setShowPass(!showPass)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="wizard-label">From Email</label>
                        <input className="wizard-input" type="email" placeholder="auth@yourdomain.com"
                            value={form.from_email} onChange={e => set('from_email', e.target.value)} />
                    </div>
                    <div>
                        <label className="wizard-label">Platform owner email</label>
                        <input className="wizard-input bg-gray-50 text-gray-500 cursor-not-allowed" type="email"
                            value={toEmail} readOnly tabIndex={-1} />
                        {emailAlreadyVerified ? (
                            <p className="mt-1.5 text-xs font-bold text-green-600">
                                Verified already. Change this email only if you want to send a new verification code.
                            </p>
                        ) : (
                            <p className="mt-1.5 text-xs font-semibold text-gray-400">
                                Rooiam will send the verification code to this platform owner email.
                            </p>
                        )}
                    </div>
                    {emailAlreadyVerified && (
                        <HintBox level="success">
                            <p className="text-sm font-bold">
                                SMTP is already verified for <span className="font-black">{toEmail}</span>. You only need to verify again if this email changes.
                            </p>
                            {verifiedAt && (
                                <p className="mt-1.5 text-xs font-semibold text-emerald-600">
                                    Verified on {new Date(verifiedAt).toLocaleString()}
                                </p>
                            )}
                        </HintBox>
                    )}
                    {error && <p className="text-xs font-bold text-red-500 bg-red-50 rounded-2xl px-4 py-2.5">{error}</p>}
                    <div className="flex gap-3 mt-2">
                        <button
                            type="button"
                            onClick={onBack}
                            className="flex-1 py-3 rounded-2xl font-black text-sm border-2 border-gray-200 hover:bg-gray-50 transition-all">
                            Back
                        </button>
                        {emailAlreadyVerified ? (
                            <button
                                type="button"
                                onClick={onNext}
                                className="wizard-btn flex-1">
                                Save & Continue <ArrowRight className="w-4 h-4" />
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={sendCode}
                                disabled={sending || !toEmail.trim() || !form.host.trim() || !form.port.trim() || !form.from_email.trim()}
                                className="wizard-btn flex-1">
                                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Send verification code <ArrowRight className="w-4 h-4" /></>}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {phase === 'verify' && (
                <div className="space-y-4">
                    <HintBox level="info" title="Verification code sent" className="px-5 py-4 text-center">
                        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-2xl border border-sky-200 bg-white text-sky-500 shadow-sm">
                            <span className="text-lg">📬</span>
                        </div>
                        <p className="mt-1 text-sm font-semibold leading-6 text-sky-800">
                            A 6-digit code was sent to <span className="font-black">{toEmail}</span>.
                            {isMailhogDefault
                                ? <> Check your inbox or open local MailHog, then enter the code below.</>
                                : <> Check your inbox, then enter the code below.</>}
                        </p>
                        {isMailhogDefault && mailboxUrl && (
                            <div className="mt-4 flex justify-center">
                                <a
                                    href={mailboxUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white px-4 py-2 text-xs font-black text-sky-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-100"
                                >
                                    Open MailHog
                                    <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                            </div>
                        )}
                    </HintBox>
                    <div>
                        <label className="wizard-label">Verification code</label>
                        <input
                            className="wizard-input text-center text-2xl font-black tracking-widest"
                            placeholder="000000"
                            maxLength={6}
                            value={code}
                            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            autoFocus
                        />
                    </div>
                    {error && <p className="text-xs font-bold text-red-500 bg-red-50 rounded-2xl px-4 py-2.5">{error}</p>}
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => { setPhase('config'); setCode(''); setError('') }}
                            className="flex-1 py-3 rounded-2xl font-black text-sm border-2 border-gray-200 hover:bg-gray-50 transition-all">
                            Back to settings
                        </button>
                        <button
                            type="button"
                            onClick={verifyCode}
                            disabled={verifying || code.length !== 6}
                            className="wizard-btn flex-1">
                            {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Verify & Continue <ArrowRight className="w-4 h-4" /></>}
                        </button>
                    </div>
                    <p className="w-full py-2 text-sm font-bold text-gray-400 text-center">
                        Need a different platform owner email? Go back to the previous step, change it, then send a new verification code.
                    </p>
                </div>
            )}
        </div>
    )
}

function DatabaseStep({ onNext, onBack, config }: { onNext: () => void; onBack: () => void; config: SetupConfig | null })
{
    const [testing, setTesting] = useState(false)
    const [error, setError] = useState('')
    const [status, setStatus] = useState('')

    const testDatabase = async () => {
        setTesting(true)
        setError('')
        setStatus('')
        try {
            const result = await setupApi.testDatabase()
            setStatus(result.message)
            onNext()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Database connection check failed.')
        } finally {
            setTesting(false)
        }
    }

    return (
        <div className="max-w-md mx-auto">
            <h2 className="text-2xl font-black text-gray-900 mb-2">Database</h2>
            <p className="text-sm font-semibold text-gray-400 mb-8">
                PostgreSQL is required. Rooiam cannot continue until the current database connection is healthy and migrations are ready.
            </p>

            <div className="rounded-3xl border-2 p-5 mb-6 space-y-3" style={{ borderColor: '#E5E7EB', background: '#FAFAFB' }}>
                <HintBox level="note" className="rounded-2xl px-4 py-3">
                    <p className="text-xs font-bold text-slate-500">
                        Configured from <code className="font-mono text-slate-700">ROOIAM_DATABASE_URL</code> before startup.
                    </p>
                </HintBox>
                <div>
                    <p className="text-xs font-bold text-gray-400 mb-1">Masked connection URL</p>
                    <p className="text-sm font-black text-gray-800 break-all">{config?.database_url_masked || 'Loading database configuration...'}</p>
                </div>
                <div className="space-y-3">
                    <div className="rounded-2xl bg-white border border-gray-200 px-4 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 mb-1">Username</p>
                        <p className="text-sm font-black text-gray-800">{config?.database_username || '—'}</p>
                    </div>
                    <div className="rounded-2xl bg-white border border-gray-200 px-4 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 mb-1">Host</p>
                        <p className="text-sm font-black text-gray-800">{config?.database_host || 'localhost'}:{config?.database_port || 5432}</p>
                    </div>
                    <div className="rounded-2xl bg-white border border-gray-200 px-4 py-3">
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400 mb-1">Database</p>
                        <p className="text-sm font-black text-gray-800">{config?.database_name || 'rooiam'}</p>
                    </div>
                </div>
                {config ? (
                    <div className={`rounded-2xl px-4 py-3 text-xs font-bold ${config.database_connection_ready ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                        {config.database_connection_ready
                            ? 'Database connection is healthy and migrations are ready.'
                            : 'Database connection is not ready yet.'}
                    </div>
                ) : null}
            </div>

            {status && <p className="text-xs font-bold text-green-700 bg-green-50 rounded-2xl px-4 py-2.5 mb-4">{status}</p>}
            {error && <p className="text-xs font-bold text-red-500 bg-red-50 rounded-2xl px-4 py-2.5 mb-4">{error}</p>}

            <div className="flex gap-3">
                <button
                    type="button"
                    onClick={onBack}
                    className="flex-1 py-3 rounded-2xl font-black text-sm border-2 border-gray-200 hover:bg-gray-50 transition-all">
                    Back
                </button>
                <button
                    type="button"
                    onClick={testDatabase}
                    disabled={testing}
                    className="wizard-btn flex-1"
                >
                    {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Test & Continue <ArrowRight className="w-4 h-4" /></>}
                </button>
            </div>
        </div>
    )
}

function StorageStep({ onNext, onSkip, onBack }: { onNext: () => void; onSkip: () => void; onBack: () => void })
{
    const [backend, setBackend] = useState<StorageBackend>('minio')
    const [localPath, setLocalPath] = useState('')
    const [minioEndpoint, setMinioEndpoint] = useState('http://minio:9000')
    const [minioBucket, setMinioBucket] = useState('rooiam')
    const [minioAccessKey, setMinioAccessKey] = useState('rooiam')
    const [minioSecretKey, setMinioSecretKey] = useState('rooiam_secret')
    const [minioUseSsl, setMinioUseSsl] = useState(false)
    const [showSecret, setShowSecret] = useState(false)
    const [loadingConfig, setLoadingConfig] = useState(true)
    const [testing, setTesting] = useState(false)
    const [error, setError] = useState('')
    const [testStatus, setTestStatus] = useState('')

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
        setupApi.storageConfig()
            .then(cfg => {
                setBackend(cfg.backend_configured ? cfg.backend : 'minio')
                setLocalPath(cfg.local_path)
                if (cfg.minio_endpoint) setMinioEndpoint(cfg.minio_endpoint)
                if (cfg.minio_bucket) setMinioBucket(cfg.minio_bucket)
                if (cfg.minio_access_key) setMinioAccessKey(cfg.minio_access_key)
                setMinioUseSsl(cfg.minio_use_ssl)
            })
            .catch(() => {/* use defaults */})
            .finally(() => setLoadingConfig(false))
    }, [])

    const buildPayload = (): PlatformStorageConfigUpdate => ({
        backend,
        local_path: localPath,
        minio_endpoint: minioEndpoint,
        minio_bucket: minioBucket,
        minio_access_key: minioAccessKey,
        minio_secret_key: minioSecretKey || undefined,
        minio_use_ssl: minioUseSsl,
    })

    const testStorage = async () => {
        setTesting(true); setError(''); setTestStatus('')
        try {
            const result = await setupApi.testStorage(buildPayload())
            setTestStatus(result.message)
            await setupApi.saveStorageConfig(buildPayload())
            onNext()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Storage test failed.')
        } finally { setTesting(false) }
    }

    if (loadingConfig) {
        return (
            <div className="max-w-md mx-auto">
                <h2 className="text-2xl font-black text-gray-900 mb-2">Storage</h2>
                <p className="text-sm font-semibold text-gray-400 mb-8">
                    Loading storage defaults from the running server...
                </p>
                <div className="rounded-3xl border-2 border-gray-100 bg-white px-5 py-6 flex items-center gap-3">
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                    <p className="text-sm font-semibold text-gray-500">
                        Checking the current storage backend and defaults.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="max-w-md mx-auto">
            <div className="flex items-center justify-between mb-2">
                <h2 className="text-2xl font-black text-gray-900">Storage</h2>
            </div>
            <p className="text-sm font-semibold text-gray-400 mb-8">
                Configure where Rooiam stores uploaded files (logos, avatars). MinIO is the default recommended option.
            </p>

            <form onSubmit={e => e.preventDefault()} className="space-y-5">
                {/* Backend selector */}
                <div className="flex gap-3">
                    {(['minio', 'local'] as StorageBackend[]).map(b => (
                        <button key={b} type="button" onClick={() => setBackend(b)}
                            className={`flex-1 py-3 rounded-2xl font-black text-sm border-2 transition-all ${backend === b ? 'border-violet-400 bg-violet-50 text-violet-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                            {b === 'local' ? '💾 Local Disk' : '☁️ MinIO'}
                        </button>
                    ))}
                </div>

                {backend === 'local' && (
                    <div>
                        <label className="wizard-label">Local Path</label>
                        <input className="wizard-input" value={localPath}
                            onChange={e => setLocalPath(e.target.value)}
                            placeholder="/var/rooiam/storage" />
                        <p className="text-xs font-semibold text-gray-400 mt-1.5">Absolute path on disk. Created automatically if it doesn't exist.</p>
                    </div>
                )}

                {backend === 'minio' && (
                    <div className="space-y-3">
                        {minioEndpoint === 'http://minio:9000' && minioAccessKey === 'rooiam' && (
                            <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-2">
                                <span className="text-amber-500 mt-0.5">⚠️</span>
                                <p className="text-xs font-semibold text-amber-700">
                                    Using <span className="font-black">docker-compose MinIO</span> defaults — for local development only.
                                    Change to a real bucket before going to production.
                                </p>
                            </div>
                        )}
                        <div>
                            <label className="wizard-label">Endpoint</label>
                            <input className="wizard-input" value={minioEndpoint}
                                onChange={e => updateMinioEndpoint(e.target.value)}
                                placeholder="http://minio:9000" />
                        </div>
                        <div>
                            <label className="wizard-label">Bucket</label>
                            <input className="wizard-input" value={minioBucket}
                                onChange={e => setMinioBucket(e.target.value)}
                                placeholder="rooiam" />
                        </div>
                        <div>
                            <label className="wizard-label">Access Key</label>
                            <input className="wizard-input" value={minioAccessKey}
                                onChange={e => setMinioAccessKey(e.target.value)}
                                placeholder="rooiam" />
                        </div>
                        <div>
                            <label className="wizard-label">Secret Key</label>
                            <div className="relative">
                                <input className="wizard-input pr-10"
                                    type={showSecret ? 'text' : 'password'}
                                    value={minioSecretKey}
                                    onChange={e => setMinioSecretKey(e.target.value)}
                                    placeholder="rooiam_secret" />
                                <button type="button" onClick={() => setShowSecret(v => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                        <p className="text-xs font-semibold text-gray-400">
                            This endpoint is used by <span className="font-black text-gray-600">rooiam-server</span>, not by your browser.
                        </p>
                        <p className="text-xs font-semibold text-gray-400">
                            Use an <span className="font-black text-gray-600">https://</span> endpoint for SSL or an <span className="font-black text-gray-600">http://</span> endpoint for local plain HTTP.
                        </p>
                    </div>
                )}

                {error && <p className="text-xs font-bold text-red-500 bg-red-50 rounded-2xl px-4 py-2.5">{error}</p>}
                {testStatus && <p className="text-xs font-bold text-green-700 bg-green-50 rounded-2xl px-4 py-2.5">{testStatus}</p>}

                <div className="flex gap-3 pt-2">
                    <button type="button" onClick={onBack}
                        className="flex-1 py-3 rounded-2xl font-black text-sm border-2 border-gray-200 hover:bg-gray-50 text-gray-600 transition-all">
                        Back
                    </button>
                    <button type="button" onClick={onSkip}
                        className="flex-1 py-3 rounded-2xl font-black text-sm border-2 border-gray-100 hover:bg-gray-50 text-gray-500 transition-all">
                        Skip for now
                    </button>
                    <button type="button" onClick={testStorage} disabled={testing}
                        className="flex-1 py-3 rounded-2xl font-black text-sm border-2 border-gray-100 hover:bg-gray-50 text-gray-700 transition-all disabled:opacity-50">
                        {testing ? <Loader2 className="w-4 h-4 animate-spin inline" /> : <>Test, Save & Continue</>}
                    </button>
                </div>
            </form>
        </div>
    )
}

function OAuthStep({
    onNext,
    onSkip,
    onBack,
    initialValues,
}: {
    onNext: () => void
    onSkip: () => void
    onBack: () => void
    initialValues: {
        google: { id: string; secret: string }
        microsoft: { id: string; secret: string; tenant: string }
    }
})
{
    const apiBase = getApiBase()
    const [searchParams, setSearchParams] = useSearchParams()
    const [issuerUrl, setIssuerUrl] = useState('')
    const [google, setGoogle] = useState(initialValues.google)
    const [microsoft, setMicrosoft] = useState(initialValues.microsoft)
    const [savedGoogle, setSavedGoogle] = useState(initialValues.google)
    const [savedMicrosoft, setSavedMicrosoft] = useState(initialValues.microsoft)
    const [showGoogleSecret, setShowGoogleSecret] = useState(false)
    const [showMicrosoftSecret, setShowMicrosoftSecret] = useState(false)
    const [googleVerifiedAt, setGoogleVerifiedAt] = useState('')
    const [microsoftVerifiedAt, setMicrosoftVerifiedAt] = useState('')
    const [verifiedProvider, setVerifiedProvider] = useState<'google' | 'microsoft' | null>(null)
    const [testingProvider, setTestingProvider] = useState<'google' | 'microsoft' | null>(null)
    const [error, setError] = useState('')
    const [status, setStatus] = useState('')

    const loadConfig = async () => {
        try {
            const [urls, config] = await Promise.all([setupApi.publicUrls(), setupApi.config()])
            setIssuerUrl(urls.issuer_url)
            const nextGoogle = {
                id: config.google_client_id || '',
                secret: config.google_client_secret || '',
            }
            const nextMicrosoft = {
                id: config.microsoft_client_id || '',
                secret: config.microsoft_client_secret || '',
                tenant: config.microsoft_tenant_id || 'common',
            }
            setGoogle(nextGoogle)
            setSavedGoogle(nextGoogle)
            setGoogleVerifiedAt(config.google_oauth_verified_at || '')
            setMicrosoft(nextMicrosoft)
            setSavedMicrosoft(nextMicrosoft)
            setMicrosoftVerifiedAt(config.microsoft_oauth_verified_at || '')
        } catch {
            setIssuerUrl('')
        }
    }

    useEffect(() => {
        void loadConfig()
    }, [])

    useEffect(() => {
        setGoogle(initialValues.google)
        setMicrosoft(initialValues.microsoft)
        setSavedGoogle(initialValues.google)
        setSavedMicrosoft(initialValues.microsoft)
        setShowGoogleSecret(false)
        setShowMicrosoftSecret(false)
    }, [initialValues])

    const googleCallbackUrl = getOAuthCallbackUrl('google', issuerUrl || undefined)
    const microsoftCallbackUrl = getOAuthCallbackUrl('microsoft', issuerUrl || undefined)
    const googleDirty = google.id !== savedGoogle.id || google.secret !== savedGoogle.secret
    const microsoftDirty = microsoft.id !== savedMicrosoft.id || microsoft.secret !== savedMicrosoft.secret || microsoft.tenant !== savedMicrosoft.tenant
    const googleCanVerify = !!google.id.trim() && !!google.secret.trim()
    const microsoftCanVerify = !!microsoft.id.trim() && !!microsoft.secret.trim()
    const googleReady = !google.id.trim() || (!googleDirty && !!googleVerifiedAt)
    const microsoftReady = !microsoft.id.trim() || (!microsoftDirty && !!microsoftVerifiedAt)

    useEffect(() => {
        const provider = searchParams.get('oauth_test_provider')
        const result = searchParams.get('oauth_test_result')
        if ((provider !== 'google' && provider !== 'microsoft') || result !== 'success') return

        setStatus(
          `${provider === 'google' ? 'Google' : 'Microsoft'} verification passed. New provider settings were saved.`
        )
        setVerifiedProvider(provider)
        setError('')
        setTestingProvider(null)
        void loadConfig()
        const nextParams = new URLSearchParams(searchParams)
        nextParams.delete('oauth_test_provider')
        nextParams.delete('oauth_test_result')
        nextParams.delete('step')
        setSearchParams(nextParams, { replace: true })
    }, [searchParams, setSearchParams])

    const startProviderTest = async (provider: 'google' | 'microsoft') => {
        setError('')
        setStatus('')
        setVerifiedProvider(null)
        setTestingProvider(provider)
        try {
            const redirectUrl = new URL(`${window.location.origin}/setup`)
            redirectUrl.searchParams.set('step', 'oauth')
            redirectUrl.searchParams.set('oauth_test_provider', provider)
            const payload = provider === 'google'
                ? {
                    provider,
                    client_id: google.id,
                    client_secret: google.secret,
                    redirect_uri: redirectUrl.toString(),
                }
                : {
                    provider,
                    client_id: microsoft.id,
                    client_secret: microsoft.secret,
                    tenant_id: microsoft.tenant,
                    redirect_uri: redirectUrl.toString(),
                }
            const res = await fetch(`${apiBase}/setup/prepare-oauth-verification`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getSetupAuthHeaders() },
                body: JSON.stringify(payload),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                throw new Error(data?.error?.message || 'Could not start provider verification.')
            }
            window.location.href = data.authorization_url
        } catch (err) {
            setTestingProvider(null)
            setError(err instanceof Error ? err.message : `Could not reach ${apiBase}. Check VITE_API_URL and whether the Rooiam API is running.`)
        }
    }

    return (
        <div className="max-w-lg mx-auto">
            <div className="flex items-center justify-between mb-2">
                <h2 className="text-2xl font-black text-gray-900">OAuth Providers</h2>
                <span className="text-xs font-black px-2.5 py-1 rounded-full"
                    style={{ background: '#F8F0FF', color: '#9B59B6' }}>Optional</span>
            </div>
            <p className="text-sm font-semibold text-gray-400 mb-8">
                Verify provider credentials here. Rooiam saves them only after the provider test succeeds.
            </p>

            <div className="rounded-3xl border-2 p-5 mb-6 space-y-2"
                style={{ borderColor: '#E5E7EB', background: '#FAFAFB' }}>
                <p className="text-sm font-black text-gray-800">What this step does</p>
                    <p className="text-xs font-semibold text-gray-600">
                        Test Google or Microsoft here. Successful verification saves the credentials automatically.
                    </p>
                    <p className="text-xs font-semibold text-gray-600">
                        After you enter the dashboard for the first time, use <span className="font-black text-gray-800">Access &gt; Sign-In Methods</span> to explicitly enable a verified provider for admin login.
                    </p>
                </div>

                <div className="space-y-6">
                {/* Google */}
                <div className="rounded-3xl border-2 p-5" style={{ borderColor: '#E5E7EB' }}>
                    <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-white border border-gray-100 flex items-center justify-center shadow-sm">
                                <Globe className="w-4 h-4 text-blue-500" />
                            </div>
                            <span className="font-black text-gray-800">Google OAuth</span>
                        </div>
                        {googleVerifiedAt && !googleDirty ? (
                            <div className="text-right">
                                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-black text-green-700">
                                    <Check className="h-3.5 w-3.5" /> Verified and saved
                                </span>
                                <p className="mt-1 text-[11px] font-semibold text-green-700/80">
                                    {new Date(googleVerifiedAt).toLocaleString()}
                                </p>
                            </div>
                        ) : null}
                    </div>
                    <div className="space-y-3">
                        <input className="wizard-input" placeholder="Client ID" value={google.id}
                            onChange={e => setGoogle(g => ({ ...g, id: e.target.value }))} />
                        <div className="relative">
                            <input
                                className="wizard-input pr-11"
                                type={showGoogleSecret ? 'text' : 'password'}
                                placeholder="Client Secret"
                                value={google.secret}
                                onChange={e => setGoogle(g => ({ ...g, secret: e.target.value }))}
                            />
                            <button
                                type="button"
                                onClick={() => setShowGoogleSecret(value => !value)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                aria-label={showGoogleSecret ? 'Hide Google client secret' : 'Show Google client secret'}
                            >
                                {showGoogleSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                    <p className="text-xs font-semibold text-gray-400 mt-2">
                        Callback URL: <code className="font-mono text-pink-500">{googleCallbackUrl}</code>
                    </p>
                    {(!googleVerifiedAt || googleDirty) ? (
                        <button
                            type="button"
                            onClick={() => void startProviderTest('google')}
                            disabled={!googleCanVerify || testingProvider !== null}
                            className="mt-3 inline-flex items-center gap-2 rounded-2xl border-2 border-sky-100 bg-sky-50 px-4 py-2 text-xs font-black text-sky-700 transition-all hover:bg-sky-100 disabled:opacity-50"
                        >
                            {testingProvider === 'google' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            {googleVerifiedAt && googleDirty ? 'Verify Google Again' : 'Verify Google & Save'}
                        </button>
                    ) : null}
                    {verifiedProvider === 'google' && status ? (
                        <p className="mt-3 text-xs font-bold text-green-700 bg-green-50 rounded-2xl px-4 py-2.5">{status}</p>
                    ) : null}
                </div>

                {/* Microsoft */}
                <div className="rounded-3xl border-2 p-5" style={{ borderColor: '#E5E7EB' }}>
                    <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-white border border-gray-100 flex items-center justify-center shadow-sm">
                                <Key className="w-4 h-4 text-blue-600" />
                            </div>
                            <span className="font-black text-gray-800">Microsoft OAuth</span>
                        </div>
                        {microsoftVerifiedAt && !microsoftDirty ? (
                            <div className="text-right">
                                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-black text-green-700">
                                    <Check className="h-3.5 w-3.5" /> Verified and saved
                                </span>
                                <p className="mt-1 text-[11px] font-semibold text-green-700/80">
                                    {new Date(microsoftVerifiedAt).toLocaleString()}
                                </p>
                            </div>
                        ) : null}
                    </div>
                    <div className="space-y-3">
                        <input className="wizard-input" placeholder="Application (Client) ID"
                            value={microsoft.id}
                            onChange={e => setMicrosoft(m => ({ ...m, id: e.target.value }))} />
                        <div className="relative">
                            <input
                                className="wizard-input pr-11"
                                type={showMicrosoftSecret ? 'text' : 'password'}
                                placeholder="Client Secret"
                                value={microsoft.secret}
                                onChange={e => setMicrosoft(m => ({ ...m, secret: e.target.value }))}
                            />
                            <button
                                type="button"
                                onClick={() => setShowMicrosoftSecret(value => !value)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                aria-label={showMicrosoftSecret ? 'Hide Microsoft client secret' : 'Show Microsoft client secret'}
                            >
                                {showMicrosoftSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        <input className="wizard-input" placeholder="Tenant ID (or 'common')"
                            value={microsoft.tenant}
                            onChange={e => setMicrosoft(m => ({ ...m, tenant: e.target.value }))} />
                    </div>
                    <p className="text-xs font-semibold text-gray-400 mt-2">
                        Callback URL: <code className="font-mono text-pink-500">{microsoftCallbackUrl}</code>
                    </p>
                    {(!microsoftVerifiedAt || microsoftDirty) ? (
                        <button
                            type="button"
                            onClick={() => void startProviderTest('microsoft')}
                            disabled={!microsoftCanVerify || testingProvider !== null}
                            className="mt-3 inline-flex items-center gap-2 rounded-2xl border-2 border-sky-100 bg-sky-50 px-4 py-2 text-xs font-black text-sky-700 transition-all hover:bg-sky-100 disabled:opacity-50"
                        >
                            {testingProvider === 'microsoft' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            {microsoftVerifiedAt && microsoftDirty ? 'Verify Microsoft Again' : 'Verify Microsoft & Save'}
                        </button>
                    ) : null}
                    {verifiedProvider === 'microsoft' && status ? (
                        <p className="mt-3 text-xs font-bold text-green-700 bg-green-50 rounded-2xl px-4 py-2.5">{status}</p>
                    ) : null}
                </div>

                {error && <p className="text-xs font-bold text-red-500 bg-red-50 rounded-2xl px-4 py-2.5">{error}</p>}
                <div className="flex gap-3">
                    <button type="button" onClick={onBack}
                        className="flex-1 py-3 rounded-2xl font-black text-sm border-2 border-gray-200 hover:bg-gray-50 text-gray-600 transition-all">
                        Back
                    </button>
                    <button type="button" onClick={onSkip}
                        className="flex-1 py-3 rounded-2xl font-black text-sm border-2 border-gray-100 hover:bg-gray-50 text-gray-500 transition-all">
                        Skip for now
                    </button>
                    <button type="button" onClick={onNext} disabled={!(googleReady && microsoftReady)} className="wizard-btn flex-1 disabled:opacity-40 disabled:cursor-not-allowed">
                        Continue <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    )
}

function DoneStep({ onFinish }: { onFinish: () => void })
{
    const apiBase = getApiBase()
    const [loading, setLoading] = useState(false)

    const finish = async () =>
    {
        setLoading(true)
        await fetch(`${apiBase}/setup/complete`, {
            method: 'POST',
            headers: getSetupAuthHeaders(),
        })
        onFinish()
    }

    return (
        <div className="max-w-md mx-auto text-center">
            <div className="text-7xl mb-6">🚀</div>
            <h2 className="text-3xl font-black text-gray-900 mb-3">Rooiam is ready!</h2>
            <p className="text-base font-semibold text-gray-400 mb-10 leading-relaxed">
                Your Identity & Access Management system is configured and ready to use.
                You can update these settings anytime in the admin panel.
            </p>

            <div className="rounded-3xl border-2 p-5 mb-8 text-left space-y-3"
                style={{ borderColor: '#B5EFD5', background: '#F0FFF8' }}>
                {[
                    '✅ Server connection verified',
                    '✅ Platform owner account created',
                    '✅ Ready to accept logins',
                ].map(t => (
                    <p key={t} className="text-sm font-bold text-gray-700">{t}</p>
                ))}
            </div>

            <button onClick={finish} disabled={loading} className="wizard-btn w-full text-base py-4">
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Go to Admin Dashboard →</>}
            </button>
        </div>
    )
}

// ── Main Wizard ──────────────────────────────────────────────────────────────

export default function SetupWizard()
{
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const stepIndexFromQuery = (() => {
        const requested = searchParams.get('step')
        if (!requested) return 0
        const found = STEPS.findIndex(step => step.id === requested)
        return found >= 0 ? found : 0
    })()
    const [currentIndex, setCurrentIndex] = useState(stepIndexFromQuery)
    const currentStep = STEPS[currentIndex]
    const [setupConfig, setSetupConfig] = useState<SetupConfig | null>(null)
    const [adminEmail, setAdminEmail] = useState('')

    const refreshSetupConfig = useCallback(async () => {
        try {
            const config = await setupApi.config()
            setSetupConfig(config)
            if (config.admin_email) {
                setAdminEmail(config.admin_email)
            }
        } catch {
            setSetupConfig(null)
        }
    }, [])

    const next = () => setCurrentIndex(i => Math.min(i + 1, STEPS.length - 1))
    const back = () => setCurrentIndex(i => Math.max(i - 1, 0))
    const skip = () => next()

    const finish = () => {
        window.sessionStorage.removeItem('rooiam_setup_step')
        navigate('/login')
    }

    useEffect(() => {
        const requested = searchParams.get('step')
        if (!requested) return
        const found = STEPS.findIndex(step => step.id === requested)
        if (found >= 0) {
            setCurrentIndex(found)
        }
    }, [searchParams])

    useEffect(() => {
        window.sessionStorage.setItem('rooiam_setup_step', STEPS[currentIndex].id)
        const nextParams = new URLSearchParams(searchParams)
        nextParams.set('step', STEPS[currentIndex].id)
        setSearchParams(nextParams, { replace: true })
    }, [currentIndex])

    useEffect(() => {
        void refreshSetupConfig()
    }, [refreshSetupConfig, currentIndex])

    const smtpInitialValues = {
        host: setupConfig?.smtp_host || 'mailhog',
        port: setupConfig?.smtp_port || '1025',
        security: setupConfig?.smtp_security || 'none',
        insecure_tls: setupConfig?.smtp_insecure_tls ?? false,
        username: setupConfig?.smtp_username || '',
        password: setupConfig?.smtp_password || '',
        from_email: setupConfig?.smtp_from_email || 'demo@rooiam.local',
    }

    const oauthInitialValues = {
        google: {
            id: setupConfig?.google_client_id || '',
            secret: setupConfig?.google_client_secret || '',
        },
        microsoft: {
            id: setupConfig?.microsoft_client_id || '',
            secret: setupConfig?.microsoft_client_secret || '',
            tenant: setupConfig?.microsoft_tenant_id || 'common',
        },
    }

    return (
        <div className="min-h-screen flex" style={{ fontFamily: "'Nunito', sans-serif", background: '#FAFAFA' }}>

            {/* Left sidebar — progress */}
            <aside className="hidden md:flex flex-col w-64 shrink-0 border-r"
                style={{ background: 'white', borderColor: '#FFE8F0' }}>
                {/* Logo */}
                <div className="px-6 py-6 border-b" style={{ borderColor: '#FFE8F0' }}>
                    <img src="/wordmark.svg" alt="Rooiam" className="h-8 w-auto" style={{ maxWidth: '130px' }} />
                    <p className="text-xs font-bold text-gray-400 mt-1">Setup Wizard</p>
                </div>

                {/* Steps */}
                <nav className="flex-1 p-4 space-y-1">
                    {STEPS.map((step, idx) =>
                    {
                        const done = idx < currentIndex
                        const active = idx === currentIndex
                        return (
                            <div key={step.id}
                                className={`flex items-center gap-3 px-3 py-3 rounded-2xl transition-all ${active ? 'text-pink-600' : done ? 'text-gray-400' : 'text-gray-300'
                                    }`}
                                style={active ? { background: '#FFF0F5' } : {}}>
                                {/* Step icon / check */}
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${done ? 'bg-green-100 text-green-500' :
                                    active ? 'text-pink-500' : 'text-gray-300'
                                    }`}
                                    style={active ? { background: '#FFE0EC' } : {}}>
                                    {done ? <Check className="w-4 h-4" /> : step.icon}
                                </div>
                                <div>
                                    <p className={`text-sm font-black ${active ? 'text-pink-600' : done ? 'text-gray-600' : 'text-gray-300'}`}>
                                        {step.label}
                                    </p>
                                    {step.optional && (
                                        <p className="text-xs font-semibold text-gray-300">Optional</p>
                                    )}
                                </div>
                                {active && <ChevronRight className="w-4 h-4 ml-auto" />}
                            </div>
                        )
                    })}
                </nav>

                {/* Progress bar */}
                <div className="px-5 py-4 border-t" style={{ borderColor: '#FFE8F0' }}>
                    <div className="flex justify-between text-xs font-bold text-gray-400 mb-2">
                        <span>Progress</span>
                        <span>{Math.round((currentIndex / (STEPS.length - 1)) * 100)}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500"
                            style={{
                                width: `${(currentIndex / (STEPS.length - 1)) * 100}%`,
                                background: 'linear-gradient(90deg, #FFB5C8, #D5B7FF)',
                            }} />
                    </div>
                </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 flex flex-col">
                {/* Mobile header */}
                <div className="md:hidden flex items-center justify-between px-6 py-4 border-b"
                    style={{ borderColor: '#FFE8F0', background: 'white' }}>
                    <img src="/wordmark.svg" alt="Rooiam" className="h-7 w-auto" />
                    <span className="text-xs font-bold text-gray-400">
                        Step {currentIndex + 1} of {STEPS.length}
                    </span>
                </div>

                {/* Step content */}
                <div className="flex-1 flex items-center justify-center p-8">
                    <div className="w-full max-w-2xl">

                        {currentStep.id === 'welcome' && <WelcomeStep onNext={next} />}
                        {currentStep.id === 'connection' && <ConnectionStep onNext={next} onBack={back} />}
                        {currentStep.id === 'database' && <DatabaseStep onNext={next} onBack={back} config={setupConfig} />}
                        {currentStep.id === 'admin' && (
                            <AdminStep
                                onNext={(email) => { setAdminEmail(email); next() }}
                                onBack={back}
                                initialEmail={setupConfig?.admin_email || ''}
                                initialDisplayName={setupConfig?.admin_display_name || ''}
                                platformOwnerExists={Boolean(setupConfig?.platform_owner_exists)}
                            />
                        )}
                        {currentStep.id === 'smtp' && (
                            <SmtpStep
                                onNext={next}
                                onBack={back}
                                initialValues={smtpInitialValues}
                                ownerEmail={adminEmail || setupConfig?.admin_email || ''}
                                verifiedEmail={setupConfig?.smtp_verified_email || ''}
                                verifiedAt={setupConfig?.smtp_verified_at || ''}
                                mailboxUrl={setupConfig?.demo_mailbox_url || null}
                            />
                        )}
                        {currentStep.id === 'storage' && <StorageStep onNext={next} onSkip={skip} onBack={back} />}
                        {currentStep.id === 'oauth' && <OAuthStep onNext={next} onSkip={skip} onBack={back} initialValues={oauthInitialValues} />}
                        {currentStep.id === 'done' && <DoneStep onFinish={finish} />}

                    </div>
                </div>
            </main>
        </div>
    )
}
