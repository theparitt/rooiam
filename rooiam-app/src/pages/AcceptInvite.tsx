import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { getApiBase } from '../lib/api-base'

export default function AcceptInvite() {
    const [searchParams] = useSearchParams()
    const token = searchParams.get('token')
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
    const [message, setMessage] = useState('')
    const [orgSlug, setOrgSlug] = useState<string | null>(null)

    useEffect(() => {
        if (!token) {
            setStatus('error')
            setMessage('Missing invite token. Make sure you clicked the full link from your email.')
            return
        }

        const accept = async () => {
            try {
                const apiBase = getApiBase()
                const res = await fetch(`${apiBase}/orgs/invites/accept`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token }),
                })

                if (res.status === 401) {
                    window.location.href = '/'
                    return
                }

                const data = await res.json().catch(() => ({}))

                if (!res.ok) {
                    throw new Error(
                        (data as { error?: { message?: string }; message?: string })?.error?.message
                        || (data as { message?: string })?.message
                        || 'Could not accept the invitation.'
                    )
                }

                const slug = (data as { org_slug?: string })?.org_slug ?? null
                setOrgSlug(slug)
                setStatus('success')
            } catch (err) {
                setStatus('error')
                setMessage(err instanceof Error ? err.message : 'Could not accept the invitation.')
            }
        }

        void accept()
    }, [token])

    return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 animate-fade-in font-sans">
            <div className="w-full max-w-md rounded-[32px] border border-slate-200 bg-white p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] text-center">
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
                {status === 'error' && (
                    <div className="flex flex-col items-center animate-slide-up">
                        <XCircle className="h-16 w-16 text-rose-500 mb-6 drop-shadow-sm" />
                        <h1 className="text-2xl font-black text-slate-800 tracking-tight">Invitation Failed</h1>
                        <p className="text-sm font-medium text-slate-500 mt-3 px-4 leading-relaxed">{message}</p>
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
