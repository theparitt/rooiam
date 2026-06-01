import { useEffect, useRef, useState } from 'react'
import { Mail, ArrowRight, Loader2, Settings, KeyRound } from 'lucide-react'
import { useAuthStore } from '@/lib/store'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getApiBase } from '@/lib/api-base'
import DemoBadge from '@/components/DemoBadge'

export default function LoginPage()
{
    const magicLinkCookieConflictMessage =
        'Magic link was verified, but your browser is sending an invalid or conflicting session cookie. Clear rooiam_sid cookies for rooiam.com, api.rooiam.com, admin.rooiam.com, and app.rooiam.com, then try again.'
    const demoAdminEmail = 'admin@rooiam.demo'
    const demoOwnerEmail = 'owner@rooiam.demo'
    const isSeededDemoEmail = (value: string) => [demoAdminEmail, demoOwnerEmail].includes(value.trim().toLowerCase())
    const [email, setEmail] = useState(() => new URLSearchParams(window.location.search).get('email') || '')
    const [sent, setSent] = useState(false)
    const [loading, setLoading] = useState(false)
    const [passkeyLoading, setPasskeyLoading] = useState(false)
    const [error, setError] = useState('')
    const [setupInitialized, setSetupInitialized] = useState(true)
    const [demoMode, setDemoMode] = useState(false)
    const [mailboxUrl, setMailboxUrl] = useState<string | null>(null)
    const [googleEnabled, setGoogleEnabled] = useState(false)
    const [microsoftEnabled, setMicrosoftEnabled] = useState(false)
    const [passkeyEnabled, setPasskeyEnabled] = useState(true)
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const setUser = useAuthStore((s) => s.setUser)
    const apiBase = getApiBase()
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

    useEffect(() => {
        return () => { if (pollRef.current) clearInterval(pollRef.current) }
    }, [])

    useEffect(() => {
        let cancelled = false

        const loadLoginState = async () => {
            try {
                const statusRes = await fetch(`${apiBase}/setup/status`, { credentials: 'include' })
                if (!cancelled && statusRes.ok) {
                    const s = await statusRes.json()
                    setSetupInitialized(Boolean(s.initialized))
                    setDemoMode(Boolean(s.demo_mode))
                    setMailboxUrl(s.demo_mailbox_url || null)
                }

                if (cancelled) return

                const authMethodsRes = await fetch(`${apiBase}/setup/auth-methods`, { credentials: 'include' })
                if (!authMethodsRes.ok) {
                    throw new Error(`Could not load login options (${authMethodsRes.status})`)
                }
                const authData = await authMethodsRes.json()
                if (!cancelled) {
                    setGoogleEnabled(Boolean(authData.google_admin_login_enabled))
                    setMicrosoftEnabled(Boolean(authData.microsoft_admin_login_enabled))
                    setPasskeyEnabled(authData.admin_passkey_allowed !== false)
                    setMailboxUrl(authData.demo_mailbox_url || null)
                }
            } catch (err) {
                if (cancelled) return
                setError(err instanceof Error ? err.message : 'Could not reach the server.')
            }
        }

        void loadLoginState()

        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        const returnedError = searchParams.get('error')
        const next = new URLSearchParams(searchParams)
        const magicLinkVerified = next.get('magic_link') === 'verified'
        if (!returnedError && !magicLinkVerified) return

        if (magicLinkVerified) {
            setError(magicLinkCookieConflictMessage)
            next.delete('magic_link')
        } else if (returnedError) {
            setError(returnedError)
        }

        next.delete('error')
        setSearchParams(next, { replace: true })
    }, [magicLinkCookieConflictMessage, searchParams, setSearchParams])

    const checkSession = async (onRateLimit?: () => void) =>
    {
        try
        {
            const res = await fetch(`${apiBase}/identity/me`, {
                credentials: 'include',
            })
            if (res.status === 429) {
                onRateLimit?.()
                return
            }
            if (!res.ok) {
                return
            }
            const user = await res.json()
            setUser(user)
            navigate('/')
        } catch
        {
            // Not logged in yet
        }
    }

    const handleSend = async (e: React.FormEvent) =>
    {
        e.preventDefault()
        if (!email) return
        setLoading(true)
        setError('')
        try
        {
            const res = await fetch(`${apiBase}/auth/magic-link/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email, redirect_uri: '/', surface: 'admin' }),
            })
            if (res.status === 429) {
                const retryAfter = res.headers.get('Retry-After')
                const seconds = retryAfter ? parseInt(retryAfter) : null
                const waitMsg = seconds && seconds > 0
                    ? ` Please wait ${Math.ceil(seconds / 60)} minute${Math.ceil(seconds / 60) !== 1 ? 's' : ''} before trying again.`
                    : ' Please wait a few minutes before trying again.'
                setError(`Too many requests — rate limit reached.${waitMsg}`)
                return
            }
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                setError(data?.error?.message || 'Something went wrong')
                return
            }
            setSent(true)
            if (pollRef.current) clearInterval(pollRef.current)
            pollRef.current = setInterval(() => checkSession(() => {
                if (pollRef.current) clearInterval(pollRef.current)
            }), 3000)
            setTimeout(() => { if (pollRef.current) clearInterval(pollRef.current) }, 5 * 60 * 1000)
        } catch (err: unknown)
        {
            setError(err instanceof Error ? err.message : 'Something went wrong')
        } finally
        {
            setLoading(false)
        }
    }

    const startOAuthLogin = (provider: 'google' | 'microsoft') =>
    {
        setError('')
        const redirectUri = `${window.location.origin}/`
        if (demoMode) {
            window.location.href = `${apiBase}/oauth/demo?provider=${provider}&redirect_uri=${encodeURIComponent(redirectUri)}&surface=admin`
        } else {
            window.location.href = `${apiBase}/oauth/login?provider=${provider}&redirect_uri=${encodeURIComponent(redirectUri)}&surface=admin`
        }
    }

    const handlePasskey = async () =>
    {
        setPasskeyLoading(true)
        setError('')
        let failureStage: 'start' | 'browser' | 'finish' = 'start'

        try
        {
            if (!email.trim()) {
                throw new Error('Enter your email first to use your passkey.')
            }

            if (demoMode && isSeededDemoEmail(email)) {
                const demoRes = await fetch(`${apiBase}/webauthn/login/demo`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ email, redirect_uri: '/', surface: 'admin' }),
                })
                const demoData = await demoRes.json().catch(() => ({}))
                if (!demoRes.ok) {
                    if (demoRes.status === 404) {
                        throw new Error('Demo passkey requires the updated server. Restart rooiam-server and try again.')
                    }
                    throw new Error(demoData?.error?.message || 'Demo passkey sign-in failed.')
                }

                if (demoData.mfa_enrollment_required && demoData.challenge_id) {
                    navigate(`/verify?mfa_enrollment_challenge=${encodeURIComponent(demoData.challenge_id)}&redirect_uri=${encodeURIComponent('/')}`)
                    return
                }

                if (demoData.mfa_required && demoData.challenge_id) {
                    navigate(`/verify?mfa_challenge=${encodeURIComponent(demoData.challenge_id)}&redirect_uri=${encodeURIComponent('/')}`)
                    return
                }

                navigate('/')
                return
            }

            if (!(window.PublicKeyCredential && navigator.credentials)) {
                throw new Error('This browser does not support passkeys.')
            }

            const parseRequestOptionsFromJSON = (window.PublicKeyCredential as unknown as {
                parseRequestOptionsFromJSON?: (options: unknown) => CredentialRequestOptions['publicKey']
            }).parseRequestOptionsFromJSON

            if (!parseRequestOptionsFromJSON) {
                throw new Error('This browser is missing the JSON WebAuthn helpers needed for passkey sign-in.')
            }

            const startRes = await fetch(`${apiBase}/webauthn/login/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email, redirect_uri: '/', surface: 'admin' }),
            })
            const startData = await startRes.json().catch(() => ({}))
            if (!startRes.ok) {
                throw new Error(startData?.error?.message || 'Failed to start passkey sign-in.')
            }

            failureStage = 'browser'
            const publicKey = parseRequestOptionsFromJSON(startData.request_options.publicKey)
            const credential = await navigator.credentials.get({ publicKey })

            if (!credential) {
                throw new Error('Passkey sign-in was cancelled.')
            }

            failureStage = 'finish'
            const finishRes = await fetch(`${apiBase}/webauthn/login/finish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    challenge_id: startData.challenge_id,
                    credential: (credential as unknown as { toJSON: () => unknown }).toJSON(),
                }),
            })
            const finishData = await finishRes.json().catch(() => ({}))
            if (!finishRes.ok) {
                throw new Error(finishData?.error?.message || 'Passkey sign-in failed.')
            }

            if (finishData.mfa_enrollment_required && finishData.challenge_id) {
                navigate(`/verify?mfa_enrollment_challenge=${encodeURIComponent(finishData.challenge_id)}&redirect_uri=${encodeURIComponent('/')}`)
                return
            }

            if (finishData.mfa_required && finishData.challenge_id) {
                navigate(`/verify?mfa_challenge=${encodeURIComponent(finishData.challenge_id)}&redirect_uri=${encodeURIComponent('/')}`)
                return
            }

            navigate('/')
        } catch (err) {
            if (failureStage === 'browser') {
                void fetch(`${apiBase}/webauthn/login/report-failure`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        email,
                        stage: 'browser',
                        reason: err instanceof Error ? err.message : 'Passkey sign-in failed in the browser.',
                    }),
                }).catch(() => undefined)
            }
            setError(err instanceof Error ? err.message : 'Passkey sign-in failed.')
        } finally {
            setPasskeyLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
            {/* Floating blobs */}
            <div className="absolute top-10 left-10 w-64 h-64 rounded-full opacity-30 blur-3xl animate-float"
                style={{ background: 'hsl(346 100% 82%)' }} />
            <div className="absolute bottom-20 right-10 w-80 h-80 rounded-full opacity-20 blur-3xl"
                style={{ background: 'hsl(270 80% 88%)', animation: 'float 4s ease-in-out 1.5s infinite' }} />

            <div className="w-full max-w-sm animate-slide-up relative z-10">
                {/* Wordmark — contains mascot icon already */}
                <div className="text-center mb-8">
                    <div className="mb-3 flex items-center justify-center">
                        <div className="relative inline-flex">
                            <img src="/wordmark.svg" alt="Rooiam" className="h-12 w-auto" style={{ maxWidth: '200px' }} />
                            {demoMode ? <DemoBadge className="absolute -bottom-1 -right-2" /> : null}
                        </div>
                    </div>
                    <p className="text-sm font-semibold" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        Admin Console · Secure Access
                    </p>
                </div>

                <div className="glass-card rounded-4xl p-8 shadow-xl">
                    {!sent ? (
                        <>
                            <h2 className="text-xl font-bold text-center mb-6">
                                Sign in with ✨ Magic Link
                            </h2>
                            <form onSubmit={handleSend} className="space-y-4">
                                <div className="relative">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
                                    <input
                                        id="email-input"
                                        type="email"
                                        placeholder="your@email.com"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full pl-11 pr-4 py-3 rounded-2xl text-sm font-medium outline-none transition-all"
                                        style={{
                                            background: 'hsl(var(--muted))',
                                            border: '1.5px solid hsl(var(--border))',
                                        }}
                                        required
                                        autoFocus
                                    />
                                </div>
                                {error && (
                                    <p className="text-xs font-semibold px-4 py-2 rounded-2xl" style={{ color: '#ef4444', background: '#fef2f2' }}>
                                        {error}
                                    </p>
                                )}
                                <button
                                    id="send-magic-link-btn"
                                    type="submit"
                                    disabled={loading || !email}
                                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm transition-all hover:scale-[1.02] disabled:opacity-50 shadow-md"
                                    style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
                                >
                                    {loading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <>Send Magic Link <ArrowRight className="w-4 h-4" /></>
                                    )}
                                </button>
                                {passkeyEnabled && (
                                <button
                                    type="button"
                                    onClick={handlePasskey}
                                    disabled={passkeyLoading || !email.trim()}
                                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm border-2 border-gray-100 hover:bg-gray-50 transition-all disabled:opacity-50"
                                >
                                    {passkeyLoading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <>
                                            <KeyRound className="w-4 h-4" />
                                            Continue with Passkey
                                        </>
                                    )}
                                </button>
                                )}
                                {googleEnabled && (
                                    <button
                                        type="button"
                                        onClick={() => startOAuthLogin('google')}
                                        className="w-full py-3 rounded-2xl font-bold text-sm border-2 border-gray-100 hover:bg-gray-50 transition-all"
                                    >
                                        Continue with Google
                                    </button>
                                )}
                                {microsoftEnabled && (
                                    <button
                                        type="button"
                                        onClick={() => startOAuthLogin('microsoft')}
                                        className="w-full py-3 rounded-2xl font-bold text-sm border-2 border-gray-100 hover:bg-gray-50 transition-all"
                                    >
                                        Continue with Microsoft
                                    </button>
                                )}
                            </form>
                            {!setupInitialized ? (
                                <div className="mt-5 pt-5 border-t border-gray-100">
                                    <p className="text-xs text-center font-medium mb-3" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                        Finish the initial setup before signing in.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => navigate('/setup')}
                                        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm border-2 border-gray-100 hover:bg-gray-50 transition-all"
                                    >
                                        <Settings className="w-4 h-4" />
                                        Open Setup Wizard
                                    </button>
                                </div>
                            ) : error ? (
                                <div className="mt-5 pt-5 border-t border-gray-100 text-center">
                                    <button
                                        type="button"
                                        onClick={() => navigate('/setup')}
                                        className="text-xs font-bold underline transition-colors"
                                        style={{ color: 'hsl(var(--muted-foreground))' }}
                                    >
                                        Need recovery? Reopen setup
                                    </button>
                                </div>
                            ) : null}
                        </>
                    ) : (
                        <div className="text-center py-4 animate-fade-in">
                            <div className="text-5xl mb-4">📬</div>
                            <h3 className="text-xl font-bold mb-2">Check your inbox!</h3>
                            <p className="text-sm font-medium mb-4" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                We sent a magic link to<br />
                                <span className="font-bold" style={{ color: 'hsl(var(--foreground))' }}>{email}</span>
                            </p>
                            <div className="flex items-center justify-center gap-2 text-xs font-medium rounded-2xl px-4 py-3"
                                style={{ background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' }}>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Waiting for you to click the link…
                            </div>
                            {demoMode && mailboxUrl && (
                                <a
                                    href={mailboxUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-4 flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition-all hover:scale-[1.02] shadow-sm"
                                    style={{ background: 'linear-gradient(135deg, #FFB5C8, #D5B7FF)', color: '#5a2d3f' }}
                                >
                                    Open MailHog Inbox
                                </a>
                            )}
                            <button
                                onClick={() => { if (pollRef.current) clearInterval(pollRef.current); setSent(false); setEmail('') }}
                                className="mt-4 text-xs font-bold underline transition-colors"
                                style={{ color: 'hsl(var(--muted-foreground))' }}
                            >
                                Use different email
                            </button>
                            {!setupInitialized && (
                                <button
                                    type="button"
                                    onClick={() => navigate('/setup')}
                                    className="mt-4 block mx-auto text-xs font-bold underline transition-colors"
                                    style={{ color: 'hsl(var(--muted-foreground))' }}
                                >
                                    Open setup wizard instead
                                </button>
                            )}
                        </div>
                    )}
                </div>
                {demoMode && !sent && (
                    <div
                        className="mt-4 rounded-2xl border px-4 py-3 text-left"
                        style={{
                            borderColor: 'rgba(236, 72, 153, 0.18)',
                            background: 'rgba(236, 72, 153, 0.06)',
                        }}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="font-black text-sm" style={{ color: 'hsl(var(--primary))' }}>
                                    Demo access
                                </p>
                            </div>
                        </div>

                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {[
                                { label: 'Owner', email: demoOwnerEmail },
                                { label: 'Admin', email: demoAdminEmail },
                            ].map(account => (
                                <button
                                    key={account.email}
                                    type="button"
                                    onClick={() => setEmail(account.email)}
                                    className="rounded-2xl border border-white/70 bg-white/80 px-3 py-3 text-left transition-colors hover:bg-white"
                                >
                                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-rose-400">
                                        {account.label}
                                    </p>
                                    <p className="mt-1 text-sm font-black text-gray-900 underline">
                                        {account.email}
                                    </p>
                                    <p className="mt-1 text-[11px] font-semibold text-gray-500">
                                        Click to fill the email field
                                    </p>
                                </button>
                            ))}
                        </div>

                        <div className="mt-3 space-y-1 text-xs font-medium" style={{ color: 'hsl(var(--muted-foreground))' }}>
                            <p>1. Select role</p>
                            <p>2. Click <strong style={{ color: 'hsl(var(--foreground))' }}>Send Magic Link</strong> or <strong style={{ color: 'hsl(var(--foreground))' }}>Passkey</strong></p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
