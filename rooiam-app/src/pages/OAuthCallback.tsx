import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { resolveAuthRedirect } from '../lib/redirect'
import { getTenantContext } from '../lib/tenant-context'

export default function OAuthCallbackPage()
{
    useEffect(() =>
    {
        // The actual callback is handled by rooiam-server which redirects to redirect_uri with session cookie set.
        // This page acts as a landing point if the redirect_uri points here.
        const { redirectUri } = getTenantContext(window.location.search)
        setTimeout(() => { window.location.href = resolveAuthRedirect(redirectUri) }, 500)
    }, [])

    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="text-center animate-fade-in">
                <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #FFB5C8, #D5B7FF)' }}>
                    <Loader2 className="w-8 h-8 text-white animate-spin" />
                </div>
                <p className="font-black text-gray-700 text-lg">Completing sign in…</p>
            </div>
        </div>
    )
}
