import { Suspense, lazy, useEffect, useState } from 'react'
import { Routes, Route, useNavigate, Navigate, useParams } from 'react-router-dom'
import DashboardLayout from './components/layout/DashboardLayout'
import ErrorBoundary from './components/ErrorBoundary'
const loadPlatformOverview = () => import('./pages/PlatformOverview')
const loadAdminMembers = () => import('./pages/AdminMembers')
const loadMemberDetail = () => import('./pages/MemberDetail')
const loadTenantWorkspaceWorkspaces = () => import('./pages/TenantWorkspaceWorkspaces')
const loadTenantWorkspaceDetail = () => import('./pages/TenantWorkspaceDetail')
const loadTenantWorkspaceAuditLogs = () => import('./pages/TenantWorkspaceAuditLogs')
const loadLogin = () => import('./pages/Login')
const loadVerify = () => import('./pages/Verify')
const loadSetupWizard = () => import('./pages/SetupWizard')
const loadVerifyEmailChange = () => import('./pages/VerifyEmailChange')
const loadPlatformSettings = () => import('./pages/PlatformSettings')
const loadMyAccount = () => import('./pages/MyAccount')
const loadMySessions = () => import('./pages/MySessions')
const loadMyAuditLogs = () => import('./pages/MyAuditLogs')
const loadMySecurity = () => import('./pages/MySecurity')
const loadAdminAccess = () => import('./pages/AdminAccess')
const loadTenantAccess = () => import('./pages/TenantAccess')
const loadTenantSessionPolicy = () => import('./pages/TenantSessionPolicy')
const loadTenantAuditLogs = () => import('./pages/TenantAuditLogs')
const loadTenantMembers = () => import('./pages/TenantMembers')
const loadMyProfile = () => import('./pages/MyProfile')
const loadAdminAuditLogs = () => import('./pages/AdminAuditLogs')
const loadUserAuditLogs = () => import('./pages/UserAuditLogs')
const loadTenantWorkspaceApps = () => import('./pages/TenantWorkspaceApps')
const loadTenantWorkspaceAppDetail = () => import('./pages/TenantWorkspaceAppDetail')
const loadTenantWorkspaceSessionPolicyDetail = () => import('./pages/TenantWorkspaceSessionPolicyDetail')
const loadTenantWorkspaceSessionPolicyList = () => import('./pages/TenantWorkspaceSessionPolicyList')
const PlatformOverview = lazy(loadPlatformOverview)
const AdminMembers = lazy(loadAdminMembers)
const MemberDetail = lazy(loadMemberDetail)
const TenantWorkspaceWorkspaces = lazy(loadTenantWorkspaceWorkspaces)
const TenantWorkspaceDetail = lazy(loadTenantWorkspaceDetail)
const TenantWorkspaceAuditLogs = lazy(loadTenantWorkspaceAuditLogs)
const Login = lazy(loadLogin)
const Verify = lazy(loadVerify)
const SetupWizard = lazy(loadSetupWizard)
const VerifyEmailChange = lazy(loadVerifyEmailChange)
const PlatformSettings = lazy(loadPlatformSettings)
const MyAccount = lazy(loadMyAccount)
const MySessions = lazy(loadMySessions)
const MyAuditLogs = lazy(loadMyAuditLogs)
const MySecurity = lazy(loadMySecurity)
const AdminAccess = lazy(loadAdminAccess)
const TenantAccess = lazy(loadTenantAccess)
const TenantSessionPolicy = lazy(loadTenantSessionPolicy)
const TenantAuditLogs = lazy(loadTenantAuditLogs)
const TenantMembers = lazy(loadTenantMembers)
const MyProfile = lazy(loadMyProfile)
const AdminAuditLogs = lazy(loadAdminAuditLogs)
const UserAuditLogs = lazy(loadUserAuditLogs)
const TenantWorkspaceApps = lazy(loadTenantWorkspaceApps)
const TenantWorkspaceAppDetail = lazy(loadTenantWorkspaceAppDetail)
const TenantWorkspaceSessionPolicyDetail = lazy(loadTenantWorkspaceSessionPolicyDetail)
const TenantWorkspaceSessionPolicyList = lazy(loadTenantWorkspaceSessionPolicyList)
const WorkspaceRules = lazy(async () => ({ default: (await loadPlatformSettings()).WorkspaceRules }))
const AdminSettings = lazy(async () => ({ default: (await loadPlatformSettings()).AdminSettings }))
const RiskSettings = lazy(() => import('./pages/RiskSettings'))
const AdminSecurityAlerts = lazy(() => import('./pages/AdminSecurityAlerts'))
import { useAuthStore } from './lib/store'
import { authApi } from './lib/api'
import { getApiBase, getApiConfigError } from './lib/api-base'
import { adminRoutes } from './lib/routes'

function RouteLoadingFallback() {
    return (
        <div className="min-h-screen flex items-center justify-center px-6" style={{ fontFamily: "'Nunito', sans-serif" }}>
            <div className="flex flex-col items-center gap-4">
                <img src="/wordmark.svg" alt="Rooiam" className="h-10 w-auto" />
                <div className="w-8 h-8 rounded-full border-4 border-rose-100 border-t-rose-500 animate-spin" />
                <p className="text-sm font-bold text-gray-400">Loading page...</p>
            </div>
        </div>
    )
}

// ── Setup guard — redirect to /setup if not initialized ──────────────────────

function SetupGuard({ children }: { children: React.ReactNode })
{
    const navigate = useNavigate()
    const [checked, setChecked] = useState(false)
    const [error, setError] = useState('')

    useEffect(() =>
    {
        const apiBase = getApiBase()

        fetch(`${apiBase}/setup/status`)
            .then(r => r.json())
            .then((data: { initialized: boolean }) =>
            {
                if (!data.initialized)
                {
                    navigate(adminRoutes.setup(), { replace: true })
                }
            })
            .catch((err: unknown) =>
            {
                setError(err instanceof Error ? err.message : 'Unable to reach the Rooiam API.')
            })
            .finally(() => setChecked(true))
    }, [navigate])

    if (error) return (
        <div className="min-h-screen flex items-center justify-center p-6" style={{ fontFamily: "'Nunito', sans-serif" }}>
            <div className="w-full max-w-md rounded-3xl border border-red-100 bg-white p-8 shadow-xl">
                <h1 className="text-2xl font-black text-gray-800 mb-3">Admin UI Error</h1>
                <p className="text-sm font-semibold text-gray-500 mb-4">
                    The admin UI could not determine or reach the Rooiam API.
                </p>
                <p className="text-sm font-bold text-red-500 bg-red-50 rounded-2xl px-4 py-3">
                    {error}
                </p>
            </div>
        </div>
    )

    if (!checked) return (
        <div className="min-h-screen flex items-center justify-center" style={{ fontFamily: "'Nunito', sans-serif" }}>
            <div className="flex flex-col items-center gap-4">
                <img src="/wordmark.svg" alt="Rooiam" className="h-10 w-auto animate-pulse" />
                <p className="text-sm font-bold text-gray-400">Starting up...</p>
            </div>
        </div>
    )

    return <>{children}</>
}

function loginRedirectTarget() {
    const search = window.location.search || ''
    return search ? `${adminRoutes.login()}${search}` : adminRoutes.login()
}

function LegacyAdminMemberRedirect() {
    const { memberId } = useParams()
    return <Navigate to={memberId ? adminRoutes.adminMember(memberId) : adminRoutes.adminMembers()} replace />
}

function LegacyWorkspaceRedirect() {
    const { workspaceId } = useParams()
    return <Navigate to={workspaceId ? adminRoutes.tenantWorkspace(workspaceId) : adminRoutes.tenantWorkspaceWorkspaces()} replace />
}

// ── Auth guard ──────────────────────────────────────────────────────────────

type AuthBlock = 'rate_limited' | 'session_expired' | null

function RequireAuth({ children }: { children: React.ReactNode })
{
    const { isAuthenticated, setUser, logout } = useAuthStore()
    const navigate = useNavigate()
    const [checked, setChecked] = useState(false)
    const [blocked, setBlocked] = useState<AuthBlock>(null)
    const [retryIn, setRetryIn] = useState(30)

    useEffect(() =>
    {
        let cancelled = false
        const attempt = (retries: number) => {
            authApi.me()
                .then((user) => { if (!cancelled) { setUser(user); setBlocked(null) } })
                .catch((err) => {
                    if (cancelled) return
                    const msg = err instanceof Error ? err.message : ''
                    if (msg === 'RATE_LIMITED') {
                        if (retries > 0) {
                            setTimeout(() => attempt(retries - 1), 2000)
                            return
                        }
                        setBlocked('rate_limited')
                    } else if (msg === 'UNAUTHORIZED') {
                        logout()
                        navigate(loginRedirectTarget(), { replace: true })
                    } else {
                        // Network error or unexpected — go to login
                        navigate(loginRedirectTarget(), { replace: true })
                    }
                })
                .finally(() => { if (!cancelled) setChecked(true) })
        }
        attempt(3)
        return () => { cancelled = true }
    }, [navigate, setUser, logout])

    useEffect(() =>
    {
        if (blocked !== 'rate_limited') return
        if (retryIn <= 0) {
            window.location.reload()
            return
        }
        const t = setTimeout(() => setRetryIn(s => s - 1), 1000)
        return () => clearTimeout(t)
    }, [blocked, retryIn])

    if (blocked === 'rate_limited') return (
        <div className="min-h-screen flex items-center justify-center p-6" style={{ fontFamily: "'Nunito', sans-serif" }}>
            <div className="w-full max-w-md rounded-3xl border border-amber-100 bg-white p-8 shadow-xl text-center">
                <div className="text-4xl mb-4">⏳</div>
                <h1 className="text-2xl font-black text-gray-800 mb-2">Too Many Requests</h1>
                <p className="text-sm font-semibold text-gray-500 mb-4">
                    The server is temporarily limiting requests. Please wait a moment.
                </p>
                <p className="text-sm font-bold text-amber-600 bg-amber-50 rounded-2xl px-4 py-3">
                    {retryIn > 0 ? `Retrying automatically in ${retryIn}s…` : 'Reloading…'}
                </p>
            </div>
        </div>
    )

    if (blocked === 'session_expired') return (
        <div className="min-h-screen flex items-center justify-center p-6" style={{ fontFamily: "'Nunito', sans-serif" }}>
            <div className="w-full max-w-md rounded-3xl border border-slate-100 bg-white p-8 shadow-xl text-center">
                <div className="text-4xl mb-4">🔒</div>
                <h1 className="text-2xl font-black text-gray-800 mb-2">Session Expired</h1>
                <p className="text-sm font-semibold text-gray-500 mb-6">
                    Your session has ended. Please sign in again to continue.
                </p>
                <button
                    onClick={() => navigate(adminRoutes.login(), { replace: true })}
                    className="wizard-btn px-6 py-2.5 rounded-2xl font-black text-sm"
                >
                    Sign In
                </button>
            </div>
        </div>
    )

    if (!checked && !isAuthenticated) return null
    return <>{children}</>
}

function RequirePlatformAdmin({ children }: { children: React.ReactNode })
{
    const { user } = useAuthStore()

    if (!user?.is_superuser && !user?.is_platform_owner) {
        return <Navigate to="/platform/overview" replace />
    }

    return <>{children}</>
}

function RequirePlatformOwner({ children }: { children: React.ReactNode })
{
    const { user } = useAuthStore()

    if (!user?.is_platform_owner) {
        return <Navigate to="/platform/overview" replace />
    }

    return <>{children}</>
}

// ── App ─────────────────────────────────────────────────────────────────────

function App()
{
    const apiConfigError = getApiConfigError()

    useEffect(() => {
        const preload = () => {
            void loadPlatformOverview()
            void loadPlatformSettings()
            void loadAdminMembers()
            void loadAdminAccess()
            void loadTenantWorkspaceWorkspaces()
            void loadTenantWorkspaceApps()
            void loadTenantAccess()
            void loadTenantSessionPolicy()
            void loadTenantAuditLogs()
            void loadTenantMembers()
            void loadMyProfile()
            void loadMyAccount()
            void loadMySessions()
            void loadMySecurity()
            void loadMyAuditLogs()
            void loadAdminAuditLogs()
            void loadLogin()
            void loadVerify()
            void loadSetupWizard()
            void loadVerifyEmailChange()
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
            <div className="min-h-screen flex items-center justify-center p-6" style={{ fontFamily: "'Nunito', sans-serif" }}>
                <div className="w-full max-w-md rounded-3xl border border-red-100 bg-white p-8 shadow-xl">
                    <h1 className="text-2xl font-black text-gray-800 mb-3">Admin UI Misconfigured</h1>
                    <p className="text-sm font-semibold text-gray-500 mb-4">
                        The admin UI needs an explicit API base and will not guess one automatically.
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
            {/* Setup wizard — always accessible, no auth required */}
            <Route path="/setup" element={<SetupWizard />} />

            {/* Login */}
            <Route path="/login" element={<Login />} />
            <Route path="/verify" element={<Verify />} />
            <Route path="/verify-email" element={<VerifyEmailChange />} />

            {/* Protected admin routes — check setup first, then auth */}
            <Route
                path="/"
                element={
                    <SetupGuard>
                        <RequireAuth>
                            <DashboardLayout />
                        </RequireAuth>
                    </SetupGuard>
                }
            >
                <Route index element={<Navigate to="/platform/overview" replace />} />
                <Route path="platform/overview" element={<RequirePlatformAdmin><PlatformOverview /></RequirePlatformAdmin>} />
                <Route path="platform/settings" element={<RequirePlatformOwner><PlatformSettings /></RequirePlatformOwner>} />
                <Route path="admin/members" element={<RequirePlatformAdmin><AdminMembers /></RequirePlatformAdmin>} />
                <Route path="admin/members/:memberId" element={<RequirePlatformAdmin><MemberDetail /></RequirePlatformAdmin>} />
                <Route path="admin/access" element={<RequirePlatformAdmin><AdminAccess /></RequirePlatformAdmin>} />
                <Route path="admin/session-policy" element={<RequirePlatformAdmin><AdminSettings /></RequirePlatformAdmin>} />
                <Route path="admin/risk" element={<RequirePlatformAdmin><RiskSettings /></RequirePlatformAdmin>} />
                <Route path="admin/security-alerts" element={<RequirePlatformAdmin><AdminSecurityAlerts /></RequirePlatformAdmin>} />
                <Route path="admin/audit-logs" element={<RequirePlatformAdmin><AdminAuditLogs /></RequirePlatformAdmin>} />
                <Route path="admin/members/:userId/audit-logs" element={<RequirePlatformAdmin><UserAuditLogs /></RequirePlatformAdmin>} />
                <Route path="my/profile" element={<RequirePlatformAdmin><MyProfile /></RequirePlatformAdmin>} />
                <Route path="my/account" element={<RequirePlatformAdmin><MyAccount /></RequirePlatformAdmin>} />
                <Route path="my/sessions" element={<RequirePlatformAdmin><MySessions /></RequirePlatformAdmin>} />
                <Route path="my/security" element={<RequirePlatformAdmin><MySecurity /></RequirePlatformAdmin>} />
                <Route path="my/audit-logs" element={<RequirePlatformAdmin><MyAuditLogs /></RequirePlatformAdmin>} />
                <Route path="tenant/members" element={<RequirePlatformAdmin><TenantMembers /></RequirePlatformAdmin>} />
                <Route path="tenant/members/:memberId" element={<RequirePlatformAdmin><MemberDetail /></RequirePlatformAdmin>} />
                <Route path="tenant-workspace/workspaces" element={<RequirePlatformAdmin><TenantWorkspaceWorkspaces /></RequirePlatformAdmin>} />
                <Route path="tenant-workspace/workspaces/:workspaceId" element={<RequirePlatformAdmin><TenantWorkspaceDetail /></RequirePlatformAdmin>} />
                <Route path="tenant-workspace/workspaces/:workspaceId/session-policy" element={<RequirePlatformAdmin><TenantWorkspaceSessionPolicyDetail /></RequirePlatformAdmin>} />
                <Route path="tenant-workspace/workspaces/:workspaceId/audit-logs" element={<RequirePlatformAdmin><TenantWorkspaceAuditLogs /></RequirePlatformAdmin>} />
                <Route path="tenant-workspace/apps" element={<RequirePlatformAdmin><TenantWorkspaceApps /></RequirePlatformAdmin>} />
                <Route path="tenant-workspace/apps/:appId" element={<RequirePlatformAdmin><TenantWorkspaceAppDetail /></RequirePlatformAdmin>} />
                <Route path="tenant/access" element={<RequirePlatformAdmin><TenantAccess /></RequirePlatformAdmin>} />
                <Route path="tenant-workspace/rules" element={<RequirePlatformAdmin><WorkspaceRules /></RequirePlatformAdmin>} />
                <Route path="tenant/session-policy" element={<RequirePlatformAdmin><TenantSessionPolicy /></RequirePlatformAdmin>} />
                <Route path="tenant-workspace/session-policy" element={<RequirePlatformAdmin><TenantWorkspaceSessionPolicyList /></RequirePlatformAdmin>} />
                <Route path="tenant/audit-logs" element={<RequirePlatformAdmin><TenantAuditLogs /></RequirePlatformAdmin>} />
                {/* Legacy redirects */}
                <Route path="overview" element={<Navigate to="/platform/overview" replace />} />
                <Route path="settings" element={<Navigate to="/platform/settings" replace />} />
                <Route path="members" element={<Navigate to="/admin/members" replace />} />
                <Route path="members/:memberId" element={<LegacyAdminMemberRedirect />} />
                <Route path="access" element={<Navigate to="/admin/access" replace />} />
                <Route path="audit-logs" element={<Navigate to="/admin/audit-logs" replace />} />
                <Route path="profile" element={<Navigate to="/my/profile" replace />} />
                <Route path="account" element={<Navigate to="/my/account" replace />} />
                <Route path="sessions" element={<Navigate to="/my/sessions" replace />} />
                <Route path="my-settings" element={<Navigate to="/my/security" replace />} />
                <Route path="my-audit-logs" element={<Navigate to="/my/audit-logs" replace />} />
                <Route path="my-access" element={<Navigate to="/admin/access" replace />} />
                <Route path="my-account" element={<Navigate to="/my/account" replace />} />
                <Route path="workspaces" element={<Navigate to="/tenant-workspace/workspaces" replace />} />
                <Route path="workspaces/:workspaceId" element={<LegacyWorkspaceRedirect />} />
                <Route path="clients" element={<Navigate to="/tenant-workspace/apps" replace />} />
                <Route path="tenant-access" element={<Navigate to="/tenant/access" replace />} />
                <Route path="tenant-audit-logs" element={<Navigate to="/tenant/audit-logs" replace />} />
                <Route path="tenant-members" element={<Navigate to="/tenant/members" replace />} />
                <Route path="workspace-rules" element={<Navigate to="/tenant-workspace/rules" replace />} />
                <Route path="tenant/workspaces" element={<Navigate to="/tenant-workspace/workspaces" replace />} />
                <Route path="tenant/workspaces/:workspaceId" element={<LegacyWorkspaceRedirect />} />
                <Route path="tenant/workspaces/:workspaceId/session-policy" element={<Navigate to="/tenant-workspace/workspaces" replace />} />
                <Route path="tenant/workspaces/:workspaceId/audit-logs" element={<Navigate to="/tenant-workspace/workspaces" replace />} />
                <Route path="tenant/apps" element={<Navigate to="/tenant-workspace/apps" replace />} />
                <Route path="tenant/apps/:appId" element={<Navigate to="/tenant-workspace/apps" replace />} />
                <Route path="tenant/workspace-rules" element={<Navigate to="/tenant-workspace/rules" replace />} />
                <Route path="tenant/workspace-session-policy" element={<Navigate to="/tenant-workspace/session-policy" replace />} />
                <Route path="platform-access" element={<Navigate to="/admin/access" replace />} />
                <Route path="admin-settings" element={<Navigate to="/admin/session-policy" replace />} />
                <Route path="*" element={<Navigate to="/platform/overview" replace />} />
            </Route>
        </Routes>
        </Suspense>
        </ErrorBoundary>
    )
}

export default App
