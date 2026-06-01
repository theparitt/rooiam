import { useEffect } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { resolveAuthRedirect } from '../lib/redirect'
import { getTenantContext } from '../lib/tenant-context'

export default function SuccessPage()
{
    const { appName, redirectUri } = getTenantContext(window.location.search)

    useEffect(() =>
    {
        const t = setTimeout(() => { window.location.href = resolveAuthRedirect(redirectUri) }, 2000)
        return () => clearTimeout(t)
    }, [redirectUri])

    return (
        <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
            {/* Blobs */}
            <div className="absolute top-10 left-10 w-64 h-64 rounded-full opacity-30 blur-3xl animate-float"
                style={{ background: 'hsl(346 100% 82%)' }} />
            <div className="absolute bottom-20 right-10 w-80 h-80 rounded-full opacity-20 blur-3xl"
                style={{ background: 'hsl(270 80% 88%)', animation: 'float 4s ease-in-out 1.5s infinite' }} />
            <div className="w-full max-w-sm text-center glass-card rounded-3xl p-12 shadow-xl animate-slide-up relative z-10">
                <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-6">
                    <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                </div>
                <h2 className="text-3xl font-black text-gray-800 mb-2">Welcome! 🎉</h2>
                <p className="text-sm font-semibold text-gray-500">
                    You've successfully signed in to<br />
                    <span className="text-gray-800 font-black">{appName}</span>
                </p>
                <div className="mt-6 w-full bg-gray-100 rounded-full h-1 overflow-hidden">
                    <div className="bg-gradient-to-r from-pink-300 to-purple-300 h-full rounded-full animate-pulse" style={{ width: '100%' }} />
                </div>
                <p className="text-xs text-gray-400 font-semibold mt-3">Redirecting you now…</p>
            </div>
        </div>
    )
}
