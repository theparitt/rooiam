import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Copy, Loader2, XCircle } from 'lucide-react'
import { getApiBase } from '@/lib/api-base'

type Status = 'verifying' | 'success' | 'error' | 'mfa' | 'enroll' | 'recovery'

export default function VerifyPage()
{
    const API = getApiBase()
    const [params] = useSearchParams()
    const token = params.get('token') || ''
    const redirectUri = params.get('redirect_uri') || '/'
    const initialMfaChallengeId = params.get('mfa_challenge') || ''
    const initialEnrollmentChallengeId = params.get('mfa_enrollment_challenge') || ''

    const [status, setStatus] = useState<Status>(
        initialEnrollmentChallengeId ? 'enroll' : initialMfaChallengeId ? 'mfa' : 'verifying'
    )
    const [errorMsg, setErrorMsg] = useState('')
    const [mfaCode, setMfaCode] = useState('')
    const [mfaChallengeId, setMfaChallengeId] = useState(initialMfaChallengeId)
    const [mfaLoading, setMfaLoading] = useState(false)
    const [enrollmentChallengeId, setEnrollmentChallengeId] = useState(initialEnrollmentChallengeId)
    const [enrollmentSecret, setEnrollmentSecret] = useState('')
    const [enrollmentUri, setEnrollmentUri] = useState('')
    const [enrollmentCode, setEnrollmentCode] = useState('')
    const [enrollmentLoading, setEnrollmentLoading] = useState(false)
    const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
    const [finalRedirectUri, setFinalRedirectUri] = useState(redirectUri)
    const [copied, setCopied] = useState(false)

    useEffect(() =>
    {
        if (initialEnrollmentChallengeId) {
            if (!markOneTimeFlowStarted(`enroll:${initialEnrollmentChallengeId}`)) {
                return
            }
            void loadEnrollment(initialEnrollmentChallengeId)
            return
        }

        if (initialMfaChallengeId) {
            setStatus('mfa')
            setMfaChallengeId(initialMfaChallengeId)
            return
        }

        if (!token)
        {
            setStatus('error')
            setErrorMsg('No verification token found.')
            return
        }

        const verify = async () =>
        {
            try
            {
                if (!markOneTimeFlowStarted(`magic-link:${token}`)) {
                    return
                }
                const res = await fetch(`${API}/auth/magic-link/verify`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token }),
                })

                const data = await res.json().catch(() => ({}))
                if (!res.ok)
                {
                    setStatus('error')
                    setErrorMsg(data?.error?.message || data?.message || 'Link expired or already used.')
                    return
                }

                if (data.mfa_enrollment_required && data.challenge_id)
                {
                    setEnrollmentChallengeId(data.challenge_id)
                    setFinalRedirectUri(data.redirect_uri || redirectUri)
                    await loadEnrollment(data.challenge_id)
                    return
                }

                if (data.mfa_required && data.challenge_id)
                {
                    setStatus('mfa')
                    setMfaChallengeId(data.challenge_id)
                    return
                }

                setStatus('success')
                setFinalRedirectUri(data.redirect_uri || redirectUri)
                setTimeout(() => {
                    window.location.href = safeRedirectTarget(data.redirect_uri || redirectUri)
                }, 1200)
            } catch
            {
                clearOneTimeFlowStarted(`magic-link:${token}`)
                setStatus('error')
                setErrorMsg(`Could not reach ${API}. Check VITE_API_URL, CORS, and whether the Rooiam API is running.`)
            }
        }

        void verify()
    }, [API, initialEnrollmentChallengeId, initialMfaChallengeId, redirectUri, token])

    const loadEnrollment = async (challengeId: string) =>
    {
        setEnrollmentLoading(true)
        setErrorMsg('')
        try {
            const res = await fetch(`${API}/mfa/login/enroll/start`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ challenge_id: challengeId }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                setStatus('error')
                setErrorMsg(data?.error?.message || 'Could not start MFA setup.')
                return
            }
            setEnrollmentChallengeId(challengeId)
            setEnrollmentSecret(data.secret || '')
            setEnrollmentUri(data.otpauth_uri || '')
            setFinalRedirectUri(data.redirect_uri || redirectUri)
            setStatus('enroll')
        } catch {
            clearOneTimeFlowStarted(`enroll:${challengeId}`)
            setStatus('error')
            setErrorMsg(`Could not reach ${API}. Check VITE_API_URL, CORS, and whether the Rooiam API is running.`)
        } finally {
            setEnrollmentLoading(false)
        }
    }

    const verifyMfa = async (e: React.FormEvent) =>
    {
        e.preventDefault()
        setMfaLoading(true)
        setErrorMsg('')

        try
        {
            const res = await fetch(`${API}/mfa/login/verify`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ challenge_id: mfaChallengeId, code: mfaCode }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok)
            {
                setErrorMsg(data?.error?.message || data?.message || 'Invalid MFA code.')
                return
            }

            setStatus('success')
            setFinalRedirectUri(data.redirect_uri || redirectUri)
            setTimeout(() => {
                window.location.href = safeRedirectTarget(data.redirect_uri || redirectUri)
            }, 1200)
        } catch
        {
            setErrorMsg(`Could not reach ${API}. Check VITE_API_URL, CORS, and whether the Rooiam API is running.`)
        } finally
        {
            setMfaLoading(false)
        }
    }

    const finishEnrollment = async (e: React.FormEvent) =>
    {
        e.preventDefault()
        setEnrollmentLoading(true)
        setErrorMsg('')
        try {
            const res = await fetch(`${API}/mfa/login/enroll/finish`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ challenge_id: enrollmentChallengeId, code: enrollmentCode }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                setErrorMsg(data?.error?.message || 'Could not finish MFA setup.')
                return
            }

            setRecoveryCodes(Array.isArray(data.recovery_codes) ? data.recovery_codes : [])
            setFinalRedirectUri(data.redirect_uri || redirectUri)
            setStatus('recovery')
        } catch {
            setErrorMsg(`Could not reach ${API}. Check VITE_API_URL, CORS, and whether the Rooiam API is running.`)
        } finally {
            setEnrollmentLoading(false)
        }
    }

    const copyRecoveryCodes = async () =>
    {
        try {
            await navigator.clipboard.writeText(recoveryCodes.join('\n'))
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1500)
        } catch {
            setCopied(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-6" style={{ fontFamily: "'Nunito', sans-serif" }}>
            <div className="w-full max-w-sm text-center">
                {status === 'verifying' && (
                    <div className="bg-white/80 backdrop-blur-sm rounded-4xl p-10 shadow-xl border border-white/80">
                        <div className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center"
                            style={{ background: 'linear-gradient(135deg, #FFB5C8, #D5B7FF)' }}>
                            <Loader2 className="w-8 h-8 text-white animate-spin" />
                        </div>
                        <h2 className="text-2xl font-black text-gray-800 mb-2">Verifying…</h2>
                        <p className="text-sm font-semibold text-gray-400">Checking your admin magic link.</p>
                    </div>
                )}

                {status === 'success' && (
                    <div className="bg-white/80 backdrop-blur-sm rounded-4xl p-10 shadow-xl border border-white/80">
                        <div className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center bg-emerald-50">
                            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                        </div>
                        <h2 className="text-2xl font-black text-gray-800 mb-2">Signed in</h2>
                        <p className="text-sm font-semibold text-gray-400">Opening the admin dashboard…</p>
                    </div>
                )}

                {status === 'mfa' && (
                    <form onSubmit={verifyMfa} className="bg-white/80 backdrop-blur-sm rounded-4xl p-10 shadow-xl border border-white/80 space-y-5">
                        <div>
                            <h2 className="text-2xl font-black text-gray-800 mb-2">Enter MFA Code</h2>
                            <p className="text-sm font-medium text-gray-500">
                                Finish admin sign-in with your authenticator code or a backup code.
                            </p>
                        </div>
                        <input
                            type="text"
                            inputMode="text"
                            placeholder="123456 or ABCD-EFGH"
                            value={mfaCode}
                            onChange={e => setMfaCode(e.target.value.toUpperCase().slice(0, 9))}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-center tracking-[0.2em] text-lg font-black outline-none"
                        />
                        {errorMsg && (
                            <p className="text-xs font-bold text-red-400 bg-red-50 rounded-2xl px-4 py-2">{errorMsg}</p>
                        )}
                        <button
                            type="submit"
                            disabled={mfaLoading || mfaCode.trim().length < 6}
                            className="w-full py-3 rounded-2xl font-black text-sm transition-all hover:scale-[1.02] shadow-md disabled:opacity-50"
                            style={{ background: 'linear-gradient(135deg, #FFB5C8, #D5B7FF)', color: '#5a2d3f' }}
                        >
                            {mfaLoading ? 'Verifying…' : 'Verify MFA'}
                        </button>
                    </form>
                )}

                {status === 'enroll' && (
                    <form onSubmit={finishEnrollment} className="bg-white/80 backdrop-blur-sm rounded-4xl p-8 shadow-xl border border-white/80 space-y-4 text-left">
                        <div className="text-center">
                            <h2 className="text-2xl font-black text-gray-800 mb-2">Set Up MFA</h2>
                            <p className="text-sm font-medium text-gray-500">
                                This admin login now requires MFA. Add this account to your authenticator app, then enter the first 6-digit code.
                            </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-xs font-bold text-slate-500 mb-1">Secret key</p>
                            <p className="font-mono text-sm font-bold break-all text-slate-800">{enrollmentSecret || 'Loading…'}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <p className="text-xs font-bold text-slate-500 mb-1">Authenticator link</p>
                            <p className="font-mono text-[11px] break-all text-slate-700">{enrollmentUri || 'Loading…'}</p>
                        </div>
                        <input
                            type="text"
                            inputMode="numeric"
                            placeholder="123456"
                            value={enrollmentCode}
                            onChange={e => setEnrollmentCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-center tracking-[0.2em] text-lg font-black outline-none"
                        />
                        {errorMsg && (
                            <p className="text-xs font-bold text-red-400 bg-red-50 rounded-2xl px-4 py-2">{errorMsg}</p>
                        )}
                        <button
                            type="submit"
                            disabled={enrollmentLoading || enrollmentCode.trim().length !== 6}
                            className="w-full py-3 rounded-2xl font-black text-sm transition-all hover:scale-[1.02] shadow-md disabled:opacity-50"
                            style={{ background: 'linear-gradient(135deg, #FFB5C8, #D5B7FF)', color: '#5a2d3f' }}
                        >
                            {enrollmentLoading ? 'Finishing setup…' : 'Finish MFA Setup'}
                        </button>
                    </form>
                )}

                {status === 'recovery' && (
                    <div className="bg-white/80 backdrop-blur-sm rounded-4xl p-8 shadow-xl border border-white/80 space-y-4 text-left">
                        <div className="text-center">
                            <h2 className="text-2xl font-black text-gray-800 mb-2">Save Recovery Codes</h2>
                            <p className="text-sm font-medium text-gray-500">
                                Store these backup codes now. Each one works once if you lose access to your authenticator app.
                            </p>
                        </div>
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                            <div className="grid grid-cols-2 gap-2">
                                {recoveryCodes.map(code => (
                                    <code key={code} className="rounded-xl bg-white px-3 py-2 text-center text-xs font-black text-amber-900">
                                        {code}
                                    </code>
                                ))}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={copyRecoveryCodes}
                            className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-2xl border border-slate-200 bg-white font-black text-sm text-slate-700 transition-all hover:scale-[1.01]"
                        >
                            <Copy className="w-4 h-4" />
                            {copied ? 'Copied' : 'Copy Recovery Codes'}
                        </button>
                        <button
                            type="button"
                            onClick={() => { window.location.href = safeRedirectTarget(finalRedirectUri) }}
                            className="w-full py-3 rounded-2xl font-black text-sm transition-all hover:scale-[1.02] shadow-md"
                            style={{ background: 'linear-gradient(135deg, #FFB5C8, #D5B7FF)', color: '#5a2d3f' }}
                        >
                            Continue to Admin
                        </button>
                    </div>
                )}

                {status === 'error' && (
                    <div className="bg-white/80 backdrop-blur-sm rounded-4xl p-10 shadow-xl border border-white/80">
                        <div className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center bg-red-50">
                            <XCircle className="w-8 h-8 text-red-400" />
                        </div>
                        <h2 className="text-2xl font-black text-gray-800 mb-2">Sign-In Error</h2>
                        <p className="text-sm font-medium text-gray-500 mb-6">{errorMsg}</p>
                        <button
                            onClick={() => window.location.href = '/login'}
                            className="w-full py-3 rounded-2xl font-black text-sm transition-all hover:scale-[1.02] shadow-md"
                            style={{ background: 'linear-gradient(135deg, #FFB5C8, #D5B7FF)', color: '#5a2d3f' }}
                        >
                            Back to Admin Login
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

function oneTimeFlowStorageKey(flowKey: string) {
    return `rooiam-admin-verify:${flowKey}`
}

function markOneTimeFlowStarted(flowKey: string) {
    try {
        const storageKey = oneTimeFlowStorageKey(flowKey)
        if (window.sessionStorage.getItem(storageKey)) {
            return false
        }
        window.sessionStorage.setItem(storageKey, '1')
        return true
    } catch {
        return true
    }
}

function clearOneTimeFlowStarted(flowKey: string) {
    try {
        window.sessionStorage.removeItem(oneTimeFlowStorageKey(flowKey))
    } catch {
        // Ignore sessionStorage failures and let the next attempt proceed normally.
    }
}

function safeRedirectTarget(target: string): string
{
    if (!target) return '/'
    if (target.startsWith('/') && !target.startsWith('//')) return target

    try
    {
        const url = new URL(target)
        if (url.origin === window.location.origin)
        {
            return `${url.pathname}${url.search}${url.hash}`
        }
    } catch
    {
        // Fall through to safe default.
    }

    return '/'
}
