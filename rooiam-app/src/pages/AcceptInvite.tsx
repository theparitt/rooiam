import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { getApiBase } from '../lib/api-base'

export default function AcceptInvite() {
    const [searchParams] = useSearchParams()
    const token = searchParams.get('token')
    const [status, setStatus] = useState<'ready' | 'loading' | 'success' | 'declined' | 'error'>(token ? 'ready' : 'error')
    const [message, setMessage] = useState('')
    const [orgSlug, setOrgSlug] = useState<string | null>(null)

    const respond = async (decision: 'accept' | 'decline') => {
        if (!token) return
        setStatus('loading')
        try {
            const apiBase = getApiBase()
            const res = await fetch(`${apiBase}/orgs/invites/${decision}`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token }),
            })
            if (res.status === 401) {
                setStatus('error')
                setMessage('Sign in with the invited email address, then reopen this invitation link.')
                return
            }
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                throw new Error(
                    (data as { error?: { message?: string }; message?: string })?.error?.message
                    || (data as { message?: string })?.message
                    || 'Could not respond to the invitation.'
                )
            }
            if (decision === 'accept') {
                setOrgSlug((data as { org_slug?: string })?.org_slug ?? null)
                setStatus('success')
            } else {
                setStatus('declined')
            }
        } catch (err) {
            setStatus('error')
            setMessage(err instanceof Error ? err.message : 'Could not respond to the invitation.')
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 animate-fade-in font-sans">
            <div className="w-full max-w-md rounded-[32px] border border-slate-200 bg-white p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] text-center">
                {status === 'ready' && (
                    <div>
                        <h1 className="text-2xl font-black text-slate-800">Workspace invitation</h1>
                        <p className="mt-3 text-sm text-slate-500">Choose whether to join this workspace.</p>
                        <div className="mt-8 flex justify-center gap-3">
                            <button type="button" onClick={() => void respond('accept')} className="rounded-2xl bg-slate-900 px-6 py-3 text-sm font-bold text-white">Accept invitation</button>
                            <button type="button" onClick={() => void respond('decline')} className="rounded-2xl bg-slate-100 px-6 py-3 text-sm font-bold text-slate-700">Decline</button>
                        </div>
                    </div>
                )}
                {status === 'loading' && (
                    <div className="flex flex-col items-center">
                        <Loader2 className="h-14 w-14 text-violet-400 animate-spin mb-6" />
                        <h1 className="text-2xl font-black text-slate-800 tracking-tight">Accepting invitation...</h1>
                        <p className="text-sm font-semibold text-slate-500 mt-2">Please wait a moment.</p>
                    </div>
                )}
                {status === 'success' && (
                    <div className="flex flex-col items-center animate-slide-up">
                        <CheckCircle2 className="h-16 w-16 text-emerald-500 mb-6 drop-shadow-sm" />
                        <h1 className="text-2xl font-black text-slate-800 tracking-tight">You're in!</h1>
                        <p className="text-sm font-medium text-slate-500 mt-3 px-4 leading-relaxed">
                            Your invitation has been accepted. You now have access to the workspace.
                        </p>
                        <a
                            href={orgSlug ? `/workspace/${orgSlug}/overview` : '/app'}
                            className="mt-8 transition-all active:scale-95 inline-flex px-8 py-3 bg-slate-900 text-white text-sm tracking-wide font-bold rounded-2xl hover:bg-slate-800 shadow-md"
                        >
                            Go to workspace
                        </a>
                    </div>
                )}
                {status === 'declined' && (
                    <div>
                        <h1 className="text-2xl font-black text-slate-800">Invitation declined</h1>
                        <p className="mt-3 text-sm text-slate-500">You have not joined this workspace.</p>
                    </div>
                )}
                {status === 'error' && (
                    <div className="flex flex-col items-center animate-slide-up">
                        <XCircle className="h-16 w-16 text-rose-500 mb-6 drop-shadow-sm" />
                        <h1 className="text-2xl font-black text-slate-800 tracking-tight">Invitation Failed</h1>
                        <p className="text-sm font-medium text-slate-500 mt-3 px-4 leading-relaxed">{message || 'Missing invitation token. Open the full link from your email.'}</p>
                        <a
                            href="/"
                            className="mt-8 transition-all active:scale-95 inline-flex px-8 py-3 bg-slate-100 text-slate-700 text-sm tracking-wide font-bold rounded-2xl hover:bg-slate-200"
                        >
                            Go to sign in
                        </a>
                    </div>
                )}
            </div>
        </div>
    )
}
