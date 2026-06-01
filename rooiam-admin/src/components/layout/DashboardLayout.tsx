import { Suspense, useEffect, useState } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/lib/store'
import { LayoutDashboard, Users, Building2, LogOut, Settings, Database, AppWindow, Menu, X, ShieldCheck, ShieldAlert, UserCircle, KeyRound, Monitor, Link2, Scale, Clock3 } from 'lucide-react'
import { authApi } from '@/lib/api'
import { adminRoutes } from '@/lib/routes'
import DemoBadge from '@/components/DemoBadge'

function RoutePaneFallback() {
    return (
        <div className="min-h-[40vh] flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <div className="w-8 h-8 rounded-full border-4 border-rose-100 border-t-rose-500 animate-spin" />
                <p className="text-sm font-bold text-slate-400">Loading page...</p>
            </div>
        </div>
    )
}

export default function DashboardLayout()
{
    const { user, logout, setUser } = useAuthStore()
    const location = useLocation()
    const navigate = useNavigate()
    const [mobileOpen, setMobileOpen] = useState(false)
    const [openSectionHelp, setOpenSectionHelp] = useState<string | null>(null)
    const [loggingOut, setLoggingOut] = useState(false)
    const [barKey, setBarKey] = useState(0)
    const [showBar, setShowBar] = useState(false)

    const currentRoute = `${location.pathname}${location.search}`
    const isPlatformAdmin = Boolean(user?.is_platform_owner || user?.is_superuser)
    const navSections = [
        {
            title: 'Platform',
            subtitle: 'Instance settings and deep system config',
            items: [
                { name: 'Overview', href: adminRoutes.platformOverview(), icon: LayoutDashboard },
                ...(isPlatformAdmin && user?.is_platform_owner
                    ? [{ name: 'Settings', href: adminRoutes.platformSettings(), icon: Settings }]
                    : []),
            ],
        },
        {
            title: 'Admin',
            subtitle: 'Platform operators, access, and operator sessions',
            items: isPlatformAdmin
                ? [
                    { name: 'Members', href: adminRoutes.adminMembers(), icon: Users },
                    { name: 'Access', href: adminRoutes.adminAccess(), icon: ShieldCheck },
                    { name: 'Session Policy', href: adminRoutes.adminSessionPolicy(), icon: Clock3 },
                    { name: 'Risk Detection', href: adminRoutes.adminRiskSettings(), icon: ShieldAlert },
                    { name: 'Security Alerts', href: adminRoutes.adminSecurityAlerts(), icon: ShieldAlert },
                    { name: 'Audit Logs', href: adminRoutes.adminAuditLogs(), icon: Database },
                ]
                : [],
        },
        {
            title: 'Tenant',
            subtitle: 'Tenant operators, workspaces, access, and audit',
            items: isPlatformAdmin
                ? [
                    { name: 'Members', href: adminRoutes.tenantMembers(), icon: Users },
                    { name: 'Workspaces', href: adminRoutes.tenantWorkspaceWorkspaces(), icon: Building2 },
                    { name: 'Workspace Rules', href: adminRoutes.tenantWorkspaceRules(), icon: Scale },
                    { name: 'Apps', href: adminRoutes.tenantWorkspaceApps(), icon: AppWindow },
                    { name: 'Access', href: adminRoutes.tenantAccess(), icon: ShieldCheck },
                    { name: 'Session Policy', href: adminRoutes.tenantSessionPolicy(), icon: Clock3 },
                    { name: 'Audit Logs', href: adminRoutes.tenantAuditLogs(), icon: Database },
                ]
                : [],
        },
        {
            title: 'My',
            subtitle: 'My profile, account, sessions, and security',
            items: [
                { name: 'Profile', href: adminRoutes.myProfile(), icon: UserCircle },
                { name: 'Account', href: adminRoutes.myAccount(), icon: Link2 },
                { name: 'Sessions', href: adminRoutes.mySessions(), icon: Monitor },
                { name: 'Security', href: adminRoutes.mySecurity(), icon: KeyRound },
                { name: 'Audit Logs', href: adminRoutes.myAuditLogs(), icon: Database },
            ],
        },
    ]

    const displayName = user?.display_name || 'Admin'
    const avatarSrc = '/rooiam-app-white.svg'
    const showDemoBadge = ['admin@rooiam.demo', 'owner@rooiam.demo'].includes(user?.email?.trim().toLowerCase() || '')
    const accessLabel = user?.is_platform_owner
        ? 'Platform Owner'
        : user?.is_superuser
            ? 'Platform Admin'
            : 'Limited Access'

    const handleLogout = async () =>
    {
        setLoggingOut(true)
        logout()
        try {
            await authApi.logout()
        } catch {
            // ignore
        } finally {
            window.location.replace(adminRoutes.login())
        }
    }

    useEffect(() => {
        setMobileOpen(false)
        setShowBar(true)
        setBarKey(k => k + 1)
        const t = setTimeout(() => setShowBar(false), 700)
        return () => clearTimeout(t)
    }, [location.pathname])

    useEffect(() => {
        let cancelled = false
        let lastCheck = Date.now()

        const checkSession = async () => {
            try {
                const me = await authApi.me()
                if (!cancelled) {
                    lastCheck = Date.now()
                    setUser(me)
                }
            } catch (err) {
                if (cancelled) return
                if (err instanceof Error && err.message === 'RATE_LIMITED') return
                if (err instanceof Error && err.message === 'UNAUTHORIZED') {
                    logout()
                    navigate(adminRoutes.login(), { replace: true })
                }
            }
        }

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && Date.now() - lastCheck > 5 * 60_000) {
                void checkSession()
            }
        }

        document.addEventListener('visibilitychange', handleVisibilityChange)

        return () => {
            cancelled = true
            document.removeEventListener('visibilitychange', handleVisibilityChange)
        }
    }, [logout, navigate, setUser])

    // ── Sidebar layout — DO NOT CHANGE ──────────────────────────────────────
    // This sidebar design is finalized. Scrollbar sits flush against the right
    // edge (-mr-4 pr-4 on nav-scroll). Scrollbar track is always present but
    // invisible; thumb fades in on hover. No layout shift on scroll appearance.
    const sidebarContent = (
        <>
            <div className="px-3 py-4 flex items-center justify-between gap-3 shrink-0">
                <div className="relative inline-flex">
                    <img
                        src="/wordmark-horizontal-transparent.svg"
                        alt="Rooiam"
                        className="h-10 w-auto"
                        style={{ maxWidth: '170px' }}
                    />
                    {showDemoBadge ? <DemoBadge className="absolute -bottom-1 -right-2" /> : null}
                </div>
                <button
                    type="button"
                    onClick={() => setMobileOpen(false)}
                    className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-2xl border border-white/80 bg-white/70 text-slate-500 hover:text-slate-700 hover:bg-white transition-colors"
                    aria-label="Close navigation"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="nav-scroll min-h-0 flex-1 overflow-y-auto pt-4 -mr-4 pr-4">
                <nav className="flex flex-col gap-4">
                    {navSections.map(section => (
                        <div key={section.title} className="space-y-1">
                            <div className="px-4">
                                <div className="flex items-center gap-2">
                                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-rose-400/80">
                                        {section.title}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => setOpenSectionHelp(current => current === section.title ? null : section.title)}
                                        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-rose-200 bg-white/80 text-[10px] font-black text-rose-500 transition-colors hover:bg-white hover:text-rose-600"
                                        aria-label={`About ${section.title}`}
                                        aria-expanded={openSectionHelp === section.title}
                                    >
                                        ?
                                    </button>
                                </div>
                                {openSectionHelp === section.title ? (
                                    <div className="mt-1.5 rounded-2xl border border-white/80 bg-white/85 px-3 py-2 shadow-sm">
                                        <p className="text-[11px] font-medium leading-tight text-slate-500">
                                            {section.subtitle}
                                        </p>
                                    </div>
                                ) : null}
                            </div>
                            <div className="flex flex-col gap-1">
                                {section.items.map((item) =>
                                {
                                    const active = currentRoute === item.href || (item.href === '/' && location.pathname === '/' && !location.search)
                                    const Icon = item.icon
                                    return (
                                        <Link
                                            key={`${section.title}-${item.href}-${item.name}`}
                                            to={item.href}
                                            className={`nav-link ${active ? 'nav-link-active' : 'nav-link-inactive'}`}
                                        >
                                            <Icon className="w-4 h-4 shrink-0" />
                                            <span>{item.name}</span>
                                        </Link>
                                    )
                                })}
                            </div>
                        </div>
                    ))}
                </nav>
            </div>

            <div className="pt-4 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.5)' }}>
                <div className="rounded-3xl bg-white/70 border border-white/80 shadow-sm p-3">
                    <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl overflow-hidden border border-border bg-white shadow-sm shrink-0">
                            <img
                                src={avatarSrc}
                                alt={displayName}
                                className="w-full h-full object-cover scale-[1.06]"
                                onError={event => {
                                    event.currentTarget.src = '/rooiam-app-white.svg'
                                }}
                            />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm truncate" title={displayName}>{displayName}</p>
                            <p
                                className="text-[11px] leading-tight font-medium truncate"
                                title={accessLabel}
                                style={{ color: 'hsl(var(--muted-foreground))' }}
                            >
                                {accessLabel}
                            </p>
                        </div>
                        <button
                            onClick={handleLogout}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-black border border-rose-100 bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors shrink-0"
                        >
                            <LogOut className="w-3.5 h-3.5" />
                            Logout
                        </button>
                    </div>
                </div>
            </div>
        </>
    )

    if (loggingOut) {
        return (
            <div className="h-screen flex items-center justify-center bg-white">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 rounded-full border-4 border-rose-200 border-t-rose-500 animate-spin" />
                    <p className="text-sm font-medium text-slate-400">Signing out…</p>
                </div>
            </div>
        )
    }

    return (
        <div className="h-screen overflow-hidden flex bg-white/50">
            {showBar && <div key={barKey} className="route-bar" />}
            <aside
                className="hidden lg:flex h-screen w-72 shrink-0 flex-col p-4 gap-3 overflow-hidden"
                style={{
                    background: 'linear-gradient(180deg, hsl(346 100% 97%) 0%, hsl(270 80% 97%) 100%)',
                    borderRight: '1px solid hsl(346 100% 90%)',
                }}
            >
                {sidebarContent}
            </aside>

            {mobileOpen && (
                <div className="lg:hidden fixed inset-0 z-40">
                    <button
                        type="button"
                        className="absolute inset-0 bg-black/20 backdrop-blur-[1px]"
                        onClick={() => setMobileOpen(false)}
                        aria-label="Close navigation overlay"
                    />
                    <aside
                        className="absolute inset-y-0 left-0 w-[18.5rem] max-w-[calc(100vw-2rem)] flex flex-col p-4 gap-3 shadow-2xl overflow-hidden"
                        style={{
                            background: 'linear-gradient(180deg, hsl(346 100% 97%) 0%, hsl(270 80% 97%) 100%)',
                            borderRight: '1px solid hsl(346 100% 90%)',
                        }}
                    >
                        {sidebarContent}
                    </aside>
                </div>
            )}

            <main className="main-scroll flex-1 min-w-0 h-screen overflow-y-auto">
                <div className="lg:hidden sticky top-0 z-30 px-4 py-3 border-b border-rose-100/80 bg-white/85 backdrop-blur-xl">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => setMobileOpen(true)}
                            className="inline-flex items-center justify-center w-11 h-11 rounded-2xl border border-rose-100 bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors shrink-0"
                            aria-label="Open navigation"
                        >
                            <Menu className="w-5 h-5" />
                        </button>
                        <div className="min-w-0">
                            <p className="text-xs font-bold uppercase tracking-[0.2em] text-rose-400">Rooiam Admin</p>
                            <p className="text-sm font-black truncate">{displayName}</p>
                        </div>
                    </div>
                </div>

                <div className="p-4 sm:p-6 lg:p-8">
                    <div className="max-w-6xl mx-auto">
                        <Suspense fallback={<RoutePaneFallback />}>
                            <Outlet />
                        </Suspense>
                    </div>
                </div>
            </main>
        </div>
    )
}
