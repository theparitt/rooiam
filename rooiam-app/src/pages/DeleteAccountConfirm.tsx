import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { getApiBase } from '../lib/api-base'

export default function DeleteAccountConfirm() {
    const [searchParams] = useSearchParams()
    const token = searchParams.get('token')
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
    const [message, setMessage] = useState('Deleting your account...')

    useEffect(() => {
        if (!token) {
            setStatus('error')
            setMessage('Missing confirmation token. Make sure you clicked the full link from your email.')
            return
        }

        const confirm = async () => {
            try {
                const apiBase = getApiBase()
                const res = await fetch(`${apiBase}/identity/me/delete/confirm`, {
                    method: 'DELETE',
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
                    throw new Error(data?.error?.message || data?.message || 'Account deletion failed.')
                }

                setStatus('success')
                setMessage('Your account has been permanently deleted. All your data has been removed.')
            } catch (err) {
                setStatus('error')
                setMessage(err instanceof Error ? err.message : 'Could not complete account deletion.')
            }
        }

        void confirm()
    }, [token])

    return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 animate-fade-in font-sans">
            <div className="w-full max-w-md rounded-[32px] border border-slate-200 bg-white p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] text-center">
                {status === 'loading' && (
                    <div className="flex flex-col items-center">
                        <Loader2 className="h-14 w-14 text-rose-400 animate-spin mb-6" />
                        <h1 className="text-2xl font-black text-slate-800 tracking-tight">Deleting account...</h1>
                        <p className="text-sm font-semibold text-slate-500 mt-2">{message}</p>
                    </div>
                )}
                {status === 'success' && (
                    <div className="flex flex-col items-center animate-slide-up">
                        <CheckCircle2 className="h-16 w-16 text-emerald-500 mb-6 drop-shadow-sm" />
                        <h1 className="text-2xl font-black text-slate-800 tracking-tight">Account Deleted</h1>
                        <p className="text-sm font-medium text-slate-500 mt-3 px-4 leading-relaxed">{message}</p>
                        <a
                            href="/"
                            className="mt-8 transition-all active:scale-95 inline-flex px-8 py-3 bg-slate-900 text-white text-sm tracking-wide font-bold rounded-2xl hover:bg-slate-800 shadow-md"
                        >
                            Go to homepage
                        </a>
                    </div>
                )}
                {status === 'error' && (
                    <div className="flex flex-col items-center animate-slide-up">
                        <XCircle className="h-16 w-16 text-rose-500 mb-6 drop-shadow-sm" />
                        <h1 className="text-2xl font-black text-slate-800 tracking-tight">Deletion Failed</h1>
                        <p className="text-sm font-medium text-slate-500 mt-3 px-4 leading-relaxed">{message}</p>
                        <a
                            href="/my/profile"
                            className="mt-8 transition-all active:scale-95 inline-flex px-8 py-3 bg-slate-100 text-slate-700 text-sm tracking-wide font-bold rounded-2xl hover:bg-slate-200"
                        >
                            Return to Profile
                        </a>
                    </div>
                )}
            </div>
        </div>
    )
}
