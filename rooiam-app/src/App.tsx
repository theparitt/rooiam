import { Suspense, lazy, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
const loadMagicLinkPage = () => import('./pages/MagicLink')
const loadVerifyPage = () => import('./pages/Verify')
const loadVerifyEmailChangePage = () => import('./pages/VerifyEmailChange')
const loadDeleteAccountConfirmPage = () => import('./pages/DeleteAccountConfirm')
const loadAcceptInvitePage = () => import('./pages/AcceptInvite')
const loadOAuthCallbackPage = () => import('./pages/OAuthCallback')
const loadSuccessPage = () => import('./pages/Success')
const loadPortalHomePage = () => import('./pages/PortalHome')
const MagicLinkPage = lazy(loadMagicLinkPage)
const VerifyPage = lazy(loadVerifyPage)
const VerifyEmailChangePage = lazy(loadVerifyEmailChangePage)
const DeleteAccountConfirmPage = lazy(loadDeleteAccountConfirmPage)
const AcceptInvitePage = lazy(loadAcceptInvitePage)
const OAuthCallbackPage = lazy(loadOAuthCallbackPage)
const SuccessPage = lazy(loadSuccessPage)
const PortalHomePage = lazy(loadPortalHomePage)
import { getApiConfigError } from './lib/api-base'

function RouteLoadingFallback() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-white px-6">
            <div className="flex flex-col items-center gap-4">
                <img src="/rooiam-logo-wordmark-horizontal-pink.svg" alt="Rooiam" className="h-10 w-auto" />
                <div className="w-8 h-8 rounded-full border-4 border-rose-100 border-t-rose-500 animate-spin" />
                <p className="text-sm font-bold text-gray-400">Loading page...</p>
            </div>
        </div>
    )
}

function App()
{
    const apiConfigError = getApiConfigError()

    useEffect(() => {
        const preload = () => {
            void loadPortalHomePage()
            void loadVerifyPage()
            void loadOAuthCallbackPage()
            void loadAcceptInvitePage()
            void loadSuccessPage()
            void loadVerifyEmailChangePage()
            void loadDeleteAccountConfirmPage()
        }

        const idle = (window as Window & {
            requestIdleCallback?: (cb: () => void) => number
            cancelIdleCallback?: (id: number) => void
        }).requestIdleCallback

        if (idle) {
            const id = idle(preload)
            return () => {
                (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id)
            }
        }

        const timeout = window.setTimeout(preload, 250)
        return () => window.clearTimeout(timeout)
    }, [])

    if (apiConfigError)
    {
        return (
            <div className="min-h-screen flex items-center justify-center p-6">
                <div className="w-full max-w-md rounded-3xl border border-red-100 bg-white p-8 shadow-xl">
                    <h1 className="text-2xl font-black text-gray-800 mb-3">Auth UI Misconfigured</h1>
                    <p className="text-sm font-semibold text-gray-500 mb-4">
                        The hosted sign-in app cannot call the Rooiam API until its API base is configured.
                    </p>
                    <p className="text-sm font-bold text-red-500 bg-red-50 rounded-2xl px-4 py-3">
                        {apiConfigError}
                    </p>
                </div>
            </div>
        )
    }

    return (
        <ErrorBoundary>
        <Suspense fallback={<RouteLoadingFallback />}>
        <Routes>
            <Route path="/" element={<MagicLinkPage />} />
            <Route path="/verify" element={<VerifyPage />} />
            <Route path="/settings/email-change/verify" element={<VerifyEmailChangePage />} />
            <Route path="/settings/delete-account/confirm" element={<DeleteAccountConfirmPage />} />
            <Route path="/accept-invite" element={<AcceptInvitePage />} />
            <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
            <Route path="/success" element={<SuccessPage />} />
            <Route path="/workspace/:orgSlug/apps/register" element={<PortalHomePage />} />
            <Route path="/workspace/:orgSlug/apps/:appId" element={<PortalHomePage />} />
            <Route path="/workspace/:orgSlug/:section" element={<PortalHomePage />} />
            <Route path="/workspace/:orgSlug" element={<PortalHomePage />} />
            <Route path="/tenant/:section" element={<PortalHomePage />} />
            <Route path="/tenant" element={<PortalHomePage />} />
            <Route path="/my/:section" element={<PortalHomePage />} />
            <Route path="/my" element={<PortalHomePage />} />
            <Route path="/app" element={<PortalHomePage />} />
            {/* Legacy routes */}
            <Route path="/:context/:section" element={<PortalHomePage />} />
            <Route path="/:context" element={<PortalHomePage />} />
        </Routes>
        </Suspense>
        </ErrorBoundary>
    )
}

export default App
