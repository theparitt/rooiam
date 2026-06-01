import React, { useEffect, useMemo, useState } from 'react'
import { Users, Activity, HelpCircle, TrendingUp, Loader2, AlertTriangle, LogIn, ShieldCheck } from 'lucide-react'

import { authApi, sysAdminApi } from '@/lib/api'
import { WORKSPACE_LABEL_PLURAL } from '@/lib/domain-labels'
import type { AdminAuditLog, AdminOrg, AdminUser, ApiSession, SecurityAlertReview } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { getDocsUrl } from '@/lib/api-base'
import PageHeader from '@/components/ui/PageHeader'
import HintBox from '@/components/ui/HintBox'
import OverviewInfoCard from '@/components/ui/OverviewInfoCard'
import OverviewPanel from '@/components/ui/OverviewPanel'
import OverviewStatCard from '@/components/ui/OverviewStatCard'
import { adminRoutes } from '@/lib/routes'

type Stat = {
    title: string
    value: string
    icon: React.FC<React.SVGProps<SVGSVGElement>>
    desc: string
    color: string
    bg: string
}

type AlertSignal = {
    type: 'brute-force' | 'spray' | 'suspicious'
    message: string
    detail: string
}

type OperatorAlert = {
    key: string
    severity: 'high' | 'medium'
    title: string
    detail: string
    secondary: string
    searchTerm: string
}

function actionBadgeClass(action: string) {
    if (action.includes('success')) return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    if (action.includes('failed')) return 'bg-rose-50 text-rose-700 border-rose-200'
    if (action.includes('suspicious')) return 'bg-amber-50 text-amber-700 border-amber-200'
    return 'bg-blue-50 text-blue-700 border-blue-200'
}

function LogRow({ log, actor }: { log: AdminAuditLog; actor?: string }) {
    return (
        <div className="grid items-center gap-3 px-1 py-2.5 hover:bg-muted/20 transition-colors" style={{ gridTemplateColumns: '160px 1fr auto' }}>
            <span className={`justify-self-start inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold border ${actionBadgeClass(log.action)}`}>
                {log.action.split('.').slice(1).join('.')}
            </span>
            <span className="text-xs font-semibold text-muted-foreground truncate min-w-0">
                {actor ?? log.actor_email ?? log.actor_display_name ?? 'System'}
            </span>
            <span className="text-[10px] font-medium text-muted-foreground hidden sm:block tabular-nums">
                {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
        </div>
    )
}

function detectAlerts(logs: AdminAuditLog[], last1h: number): AlertSignal[] {
    const recent = logs.filter(l => new Date(l.created_at).getTime() >= last1h)
    const failures = recent.filter(l => l.action.includes('failed') || l.action.includes('suspicious'))
    const signals: AlertSignal[] = []

    // Brute force: >3 failures on the same account
    const byAccount: Record<string, number> = {}
    for (const f of failures) {
        const key = f.actor_email || f.actor_user_id || ''
        if (key) byAccount[key] = (byAccount[key] ?? 0) + 1
    }
    for (const [account, count] of Object.entries(byAccount)) {
        if (count >= 3) {
            signals.push({
                type: 'brute-force',
                message: `${count} failed sign-ins on one account`,
                detail: account,
            })
        }
    }

    // Spray: >3 failures from the same IP across different accounts
    const byIp: Record<string, Set<string>> = {}
    for (const f of failures) {
        const ip = f.ip || ''
        const account = f.actor_email || f.actor_user_id || ''
        if (ip && account) {
            if (!byIp[ip]) byIp[ip] = new Set()
            byIp[ip].add(account)
        }
    }
    for (const [ip, accounts] of Object.entries(byIp)) {
        if (accounts.size >= 3) {
            signals.push({
                type: 'spray',
                message: `${accounts.size} different accounts failed from one IP`,
                detail: ip,
            })
        }
    }

    // Suspicious events
    const suspicious = recent.filter(l => l.action.includes('suspicious'))
    if (suspicious.length > 0) {
        signals.push({
            type: 'suspicious',
            message: `${suspicious.length} suspicious sign-in event${suspicious.length > 1 ? 's' : ''}`,
            detail: suspicious[0].actor_email || suspicious[0].ip || '',
        })
    }

    return signals
}

export default function PlatformOverview()
{
    const { user, currentOrg } = useAuthStore()
    const [loading, setLoading] = useState(true)
    const [adminAccessError, setAdminAccessError] = useState('')
    const [sessions, setSessions] = useState<ApiSession[]>([])
    const [systemUsers, setSystemUsers] = useState<AdminUser[]>([])
    const [systemOrgs, setSystemOrgs] = useState<AdminOrg[]>([])
    const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([])

    useEffect(() =>
    {
        const load = async () =>
        {
            setLoading(true)
            setAdminAccessError('')

            const results = await Promise.allSettled([
                authApi.sessions(),
                sysAdminApi.users({ page: 1, page_size: 100 }),
                sysAdminApi.organizations({ page: 1, page_size: 100 }),
                sysAdminApi.auditLogs({ page: 1, page_size: 200 }),
                sysAdminApi.securityAlertReviews(),
            ])

            const [mySessions, sUsers, sOrgs, logs, reviews] = results

            if (mySessions.status === 'fulfilled') setSessions(mySessions.value || [])
            if (sUsers.status === 'fulfilled') setSystemUsers(sUsers.value.items || [])
            if (sOrgs.status === 'fulfilled') setSystemOrgs(sOrgs.value.items || [])
            if (logs.status === 'fulfilled') setAuditLogs(logs.value.items || [])
            if (reviews.status === 'fulfilled') setReviewedAlerts((reviews.value.items || []) as SecurityAlertReview[])

            const firstFailure = results.find(
                (result): result is PromiseRejectedResult => result.status === 'rejected'
            )
            if (firstFailure) {
                const message = firstFailure.reason instanceof Error ? firstFailure.reason.message : String(firstFailure.reason || '')
                if (message.includes('Forbidden')) {
                    setAdminAccessError(
                        `This session is signed in as ${user?.email || 'a non-superuser account'}. Log out and sign back in with the configured superuser email to view admin-wide data.`
                    )
                } else if (message) {
                    setAdminAccessError(`Some dashboard data could not be loaded: ${message}`)
                }
            }

            setLoading(false)
        }

        void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const displayName = user?.display_name || 'Admin'
    const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'

    const now = Date.now()
    const last24h = useMemo(() => now - 24 * 60 * 60 * 1000, [now])
    const last1h = useMemo(() => now - 60 * 60 * 1000, [now])

    const signIns24h = useMemo(() =>
        auditLogs.filter(l => l.action.includes('login.success') && new Date(l.created_at).getTime() >= last24h).length
    , [auditLogs, last24h])

    const [activityTab, setActivityTab] = useState<'all' | 'security' | 'apikeys'>('all')
    const SEEN_KEY = 'rooiam_admin_security_seen'
    const [lastSeen, setLastSeen] = useState<number>(() => {
        const stored = localStorage.getItem(SEEN_KEY)
        return stored ? parseInt(stored, 10) : 0
    })
    const [reviewedAlerts, setReviewedAlerts] = useState<SecurityAlertReview[]>([])
    const [alertView, setAlertView] = useState<'open' | 'reviewed' | 'all'>('open')
    const [severityFilter, setSeverityFilter] = useState<'all' | 'high' | 'medium'>('all')

    const securityLogs = useMemo(() =>
        auditLogs.filter(l =>
            l.action.includes('failed') ||
            l.action.includes('suspicious') ||
            l.action.includes('blocked') ||
            l.action.includes('mismatch') ||
            l.action.includes('mfa.required') ||
            l.action.includes('mfa.challenge') ||
            l.action.includes('denied')
        ).slice(0, 20)
    , [auditLogs])

    const apiKeyLogs = useMemo(() =>
        auditLogs.filter(l =>
            l.action.includes('api_key.') ||
            l.action.includes('oauth_client.') ||
            l.action.includes('signing_key.')
        ).slice(0, 20)
    , [auditLogs])

    const unseenSecurityCount = loading ? 0
        : securityLogs.filter(l => new Date(l.created_at).getTime() > lastSeen).length

    const handleSecurityTab = () => {
        setActivityTab('security')
        const now = Date.now()
        setLastSeen(now)
        localStorage.setItem(SEEN_KEY, String(now))
    }

    const tabLogs = activityTab === 'security' ? securityLogs
        : activityTab === 'apikeys' ? apiKeyLogs
        : auditLogs.slice(0, 20)

    const alerts = useMemo(() => detectAlerts(auditLogs, last1h), [auditLogs, last1h])
    const operatorAlerts = useMemo<OperatorAlert[]>(() => {
        const groupedAlerts = alerts.map((alert, index) => {
            const severity: OperatorAlert['severity'] = alert.type === 'suspicious' ? 'medium' : 'high'
            return {
                key: `group:${alert.type}:${alert.detail}:${index}`,
                severity,
                title: alert.message,
                detail: alert.detail || 'Recent platform auth risk',
                secondary: alert.type === 'spray' ? 'Cross-account activity from one IP' : 'Needs platform review',
                searchTerm: alert.detail,
            }
        })
        const eventAlerts = securityLogs.slice(0, 6).map(log => {
            const severity: OperatorAlert['severity'] =
                log.action.includes('blocked') || log.action.includes('denied') || log.action.includes('mismatch') ? 'high' : 'medium'
            return {
                key: `event:${log.id}`,
                severity,
                title: log.action,
                detail: log.actor_email || log.actor_display_name || log.ip || log.target_type || 'Recent platform auth risk',
                secondary: [
                    log.organization_id ? `Workspace ${log.organization_id}` : '',
                    new Date(log.created_at).toLocaleString(),
                ].filter(Boolean).join(' · '),
                searchTerm: log.actor_email || log.ip || log.target_id || log.action,
            }
        })
        return [...groupedAlerts, ...eventAlerts]
    }, [alerts, securityLogs])
    const reviewMap = useMemo(
        () => new Map(reviewedAlerts.map(review => [review.alert_key, review])),
        [reviewedAlerts],
    )
    const allFilteredOperatorAlerts = useMemo(() => {
        return operatorAlerts
            .filter(alert => severityFilter === 'all' || alert.severity === severityFilter)
            .filter(alert => {
                const reviewed = reviewMap.has(alert.key)
                if (alertView === 'open') return !reviewed
                if (alertView === 'reviewed') return reviewed
                return true
            })
    }, [alertView, operatorAlerts, reviewMap, severityFilter])
    const filteredOperatorAlerts = useMemo(() => allFilteredOperatorAlerts.slice(0, 5), [allFilteredOperatorAlerts])

    const markAlertReviewed = async (alertKey: string) => {
        await sysAdminApi.markSecurityAlertReviewed(alertKey)
        const refreshed = await sysAdminApi.securityAlertReviews()
        setReviewedAlerts(refreshed.items || [])
    }

    const resetReviewedAlerts = async () => {
        await sysAdminApi.resetSecurityAlertReviews()
        setReviewedAlerts([])
    }

    const [myTab, setMyTab] = useState<'activity' | 'sessions'>('activity')

    const myActivity = useMemo(() => {
        if (!user?.id) return []
        return auditLogs.filter(log => log.actor_user_id === user.id).slice(0, 10)
    }, [auditLogs, user?.id])

    const stats: Stat[] = [
        {
            title: 'Members',
            value: loading ? '…' : String(systemUsers.length),
            icon: Users,
            desc: 'Platform-wide accounts',
            color: 'text-pink-500',
            bg: 'bg-pink-50 border-pink-100',
        },
        {
            title: 'My Sessions',
            value: loading ? '…' : String(sessions.length),
            icon: Activity,
            desc: 'Your active devices',
            color: 'text-purple-500',
            bg: 'bg-purple-50 border-purple-100',
        },
        {
            title: WORKSPACE_LABEL_PLURAL,
            value: loading ? '…' : String(systemOrgs.length),
            icon: TrendingUp,
            desc: 'Platform workspaces',
            color: 'text-blue-500',
            bg: 'bg-blue-50 border-blue-100',
        },
        {
            title: 'Sign-ins (24h)',
            value: loading ? '…' : String(signIns24h),
            icon: LogIn,
            desc: 'Successful logins today',
            color: 'text-emerald-500',
            bg: 'bg-emerald-50 border-emerald-100',
        },
    ]

    return (
        <div className="space-y-6 sm:space-y-8 animate-slide-up">
            <PageHeader
                eyebrow={`${greeting} 👋`}
                title={displayName}
                description={currentOrg ? <>Viewing workspace: <strong>{currentOrg.name}</strong></> : undefined}
                actions={
                    <a
                        title="Help & Docs"
                        href={getDocsUrl('/docs/quick-start')}
                        target="_blank"
                        rel="noreferrer"
                        className="w-10 h-10 rounded-full bg-accent border border-accent/50 flex items-center justify-center hover:scale-110 transition-transform shadow-sm"
                    >
                        <HelpCircle className="w-5 h-5 text-accent-foreground" />
                    </a>
                }
            />

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {stats.map((stat, index) => (
                    <OverviewStatCard
                        key={index}
                        title={stat.title}
                        value={stat.value}
                        description={stat.desc}
                        icon={stat.icon}
                        colorClass={stat.color}
                        surfaceClass={stat.bg}
                        className="cursor-default"
                    />
                ))}
            </div>

            {!loading && operatorAlerts.length > 0 ? (
                <HintBox title="Suspicious Auth Alerts" tone="amber">
                    <div className="space-y-3">
                        <p>
                            Platform operators should review suspicious sign-in patterns here and then drill into the audit logs for the affected workspace or account.
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-amber-900">
                            <span>{operatorAlerts.filter(alert => !reviewMap.has(alert.key)).length} open</span>
                            <div className="flex flex-wrap gap-1">
                                {([
                                    { id: 'open' as const, label: 'Open' },
                                    { id: 'reviewed' as const, label: 'Reviewed' },
                                    { id: 'all' as const, label: 'All' },
                                ]).map(view => (
                                    <button
                                        key={view.id}
                                        type="button"
                                        onClick={() => setAlertView(view.id)}
                                        className={`rounded-full border px-2.5 py-1 ${
                                            alertView === view.id ? 'border-amber-400 bg-amber-200/70' : 'border-amber-300 bg-white/80 hover:bg-white'
                                        }`}
                                    >
                                        {view.label}
                                    </button>
                                ))}
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {([
                                    { id: 'all' as const, label: 'All severities' },
                                    { id: 'high' as const, label: 'High only' },
                                    { id: 'medium' as const, label: 'Medium only' },
                                ]).map(filter => (
                                    <button
                                        key={filter.id}
                                        type="button"
                                        onClick={() => setSeverityFilter(filter.id)}
                                        className={`rounded-full border px-2.5 py-1 ${
                                            severityFilter === filter.id ? 'border-amber-400 bg-amber-200/70' : 'border-amber-300 bg-white/80 hover:bg-white'
                                        }`}
                                    >
                                        {filter.label}
                                    </button>
                                ))}
                            </div>
                            {reviewedAlerts.length > 0 ? (
                                <button
                                    type="button"
                                    onClick={resetReviewedAlerts}
                                    className="rounded-full border border-amber-300 bg-white/80 px-2.5 py-1 hover:bg-white"
                                >
                                    Reset reviewed
                                </button>
                            ) : null}
                            <a
                                href={`${adminRoutes.adminAuditLogs()}?action=suspicious`}
                                className="rounded-full border border-amber-300 bg-white/80 px-2.5 py-1 hover:bg-white"
                            >
                                Open suspicious audit logs
                            </a>
                        </div>
                        {filteredOperatorAlerts.length > 0 ? (
                            <div className="space-y-2">
                                {filteredOperatorAlerts.map(alert => {
                                    const review = reviewMap.get(alert.key)
                                    return (
                                    <div key={alert.key} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-0.5 rounded-2xl border border-amber-200 bg-white/70 px-3 py-2">
                                        <span className={`row-span-2 self-center rounded-full px-2 py-0.5 text-[11px] font-black ${
                                            alert.severity === 'high'
                                                ? 'bg-rose-100 text-rose-700'
                                                : 'bg-amber-100 text-amber-700'
                                        }`}>
                                            {alert.severity === 'high' ? 'High' : 'Medium'}
                                        </span>
                                        <p className="truncate text-xs font-black text-amber-900">{alert.title} <span className="font-semibold text-amber-700">· {alert.detail}</span></p>
                                        <div className="row-span-2 flex items-center gap-1.5 self-center">
                                            <a
                                                href={`${adminRoutes.adminAuditLogs()}${alert.searchTerm ? `?search=${encodeURIComponent(alert.searchTerm)}` : ''}`}
                                                className="rounded-full border border-amber-300 bg-white/80 px-2 py-0.5 text-[11px] font-bold text-amber-900 hover:bg-white"
                                            >
                                                Logs
                                            </a>
                                            <button
                                                type="button"
                                                onClick={() => markAlertReviewed(alert.key)}
                                                disabled={Boolean(review)}
                                                className="rounded-full border border-amber-300 bg-white/80 px-2 py-0.5 text-[11px] font-bold text-amber-900 hover:bg-white disabled:cursor-default disabled:opacity-70"
                                            >
                                                {review ? '✓' : 'Review'}
                                            </button>
                                        </div>
                                        <p className="truncate text-[11px] font-medium text-amber-600">
                                            {alert.secondary}
                                            {review ? ` · Reviewed by ${review.reviewed_by_display_name || review.reviewed_by_email || 'an operator'} at ${new Date(review.reviewed_at).toLocaleString()}` : ''}
                                        </p>
                                    </div>
                                )})}
                            </div>
                        ) : null}
                        {allFilteredOperatorAlerts.length > 5 ? (
                            <a
                                href={adminRoutes.adminSecurityAlerts()}
                                className="block text-center rounded-2xl border border-amber-300 bg-white/80 px-3 py-2 text-xs font-black text-amber-900 hover:bg-white"
                            >
                                View all {allFilteredOperatorAlerts.length} alerts →
                            </a>
                        ) : filteredOperatorAlerts.length === 0 ? (
                            <div className="rounded-2xl border border-amber-200 bg-white/70 px-3 py-3">
                                <p className="text-sm font-black text-amber-900">All current alerts are reviewed.</p>
                                <p className="text-xs font-semibold text-amber-800">
                                    {reviewedAlerts[0]
                                        ? `Last review: ${(reviewedAlerts[0].reviewed_by_display_name || reviewedAlerts[0].reviewed_by_email || 'An operator')} at ${new Date(reviewedAlerts[0].reviewed_at).toLocaleString()}.`
                                        : 'New suspicious auth events will appear here automatically.'}
                                </p>
                            </div>
                        ) : null}
                    </div>
                </HintBox>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-7">
                <OverviewPanel
                    title="Platform Activity"
                    subtitle="Recent identity and admin events across the platform."
                    icon={Activity}
                    tone="indigo"
                    action={<span className="cute-badge bg-secondary text-secondary-foreground">{tabLogs.length} recent</span>}
                    className="lg:col-span-4"
                    bodyClassName="mt-3 sm:mt-4"
                >
                    {/* Tab bar */}
                    <div className="flex gap-1 border-b mb-3">
                        {([
                            { id: 'all' as const, label: 'All', badge: null as number | null },
                            { id: 'security' as const, label: 'Security', badge: unseenSecurityCount > 0 ? unseenSecurityCount : null as number | null },
                            { id: 'apikeys' as const, label: 'API Keys', badge: null as number | null },
                        ]).map(tab => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={tab.id === 'security' ? handleSecurityTab : () => setActivityTab(tab.id)}
                                className={`relative flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-t-xl border-b-2 -mb-px transition-all ${
                                    activityTab === tab.id
                                        ? 'text-indigo-600 border-indigo-400 bg-indigo-50'
                                        : 'text-muted-foreground border-transparent hover:text-foreground'
                                }`}
                            >
                                {tab.label}
                                {tab.badge ? (
                                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-rose-500 text-[9px] font-black text-white">
                                        {tab.badge > 9 ? '9+' : tab.badge}
                                    </span>
                                ) : null}
                            </button>
                        ))}
                    </div>

                    {/* Alert strip for patterns — only on All tab */}
                    {!loading && activityTab === 'all' && alerts.length > 0 && (
                        <div className="mb-3 space-y-2">
                            {alerts.map((alert, i) => (
                                <div key={i} className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-amber-900">{alert.message}</p>
                                        <p className="text-[11px] font-medium text-amber-700 truncate">{alert.detail}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {loading ? (
                        <div className="flex items-center justify-center py-10 text-muted-foreground">
                            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
                        </div>
                    ) : tabLogs.length > 0 ? (
                        <div className="divide-y">
                            {tabLogs.map((log) => (
                                <LogRow key={log.id} log={log} />
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-10 text-muted-foreground">
                            <p className="text-4xl mb-3">{activityTab === 'security' ? '✅' : activityTab === 'apikeys' ? '🔑' : '🛰️'}</p>
                            <p className="font-semibold">
                                {activityTab === 'security' ? 'No security events — all clear.' : activityTab === 'apikeys' ? 'No API key events recently.' : 'No platform activity yet.'}
                            </p>
                        </div>
                    )}
                </OverviewPanel>

                <OverviewPanel
                    title="My Activity"
                    subtitle="Your recent admin actions and active devices."
                    icon={ShieldCheck}
                    tone="emerald"
                    className="lg:col-span-3"
                    bodyClassName="mt-3 sm:mt-4"
                    action={
                        <div className="flex items-center gap-1 text-xs font-bold text-emerald-500">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            {sessions.length} sessions
                        </div>
                    }
                >
                    {/* Tab bar */}
                    <div className="flex gap-1 border-b mb-3">
                        {([
                            { id: 'activity' as const, label: 'Activity' },
                            { id: 'sessions' as const, label: 'Sessions' },
                        ]).map(tab => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setMyTab(tab.id)}
                                className={`px-3 py-2 text-xs font-bold rounded-t-xl border-b-2 -mb-px transition-all ${
                                    myTab === tab.id
                                        ? 'text-emerald-600 border-emerald-400 bg-emerald-50'
                                        : 'text-muted-foreground border-transparent hover:text-foreground'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-10 text-muted-foreground">
                            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
                        </div>
                    ) : myTab === 'activity' ? (
                        myActivity.length > 0 ? (
                            <div className="divide-y">
                                {myActivity.map((log) => (
                                    <div key={log.id} className="grid items-center gap-3 px-1 py-2.5 hover:bg-muted/20 transition-colors" style={{ gridTemplateColumns: '160px 1fr auto' }}>
                                        <span className={`justify-self-start inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold border ${actionBadgeClass(log.action)}`}>
                                            {log.action.split('.').slice(1).join('.')}
                                        </span>
                                        <span className="text-xs font-semibold text-muted-foreground truncate min-w-0">
                                            {log.target_type}
                                        </span>
                                        <span className="text-[10px] font-medium text-muted-foreground hidden sm:block tabular-nums">
                                            {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-10 text-muted-foreground">
                                <p className="text-4xl mb-3">🛰️</p>
                                <p className="font-semibold">No personal activity yet</p>
                                <p className="text-sm">Your recent admin actions will appear here.</p>
                            </div>
                        )
                    ) : (
                        sessions.length > 0 ? (
                            <div className="space-y-3">
                                {sessions.slice(0, 4).map((session) => (
                                    <OverviewInfoCard key={session.id} className={session.is_current ? 'bg-emerald-50' : 'bg-slate-50'}>
                                        <div className="flex items-start gap-3">
                                            <span className="text-xl">{session.is_current ? '💻' : '📱'}</span>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-semibold">{session.user_agent || 'Unknown device'}</p>
                                                <p className="text-xs font-medium leading-relaxed text-muted-foreground">
                                                    {session.ip || 'Unknown IP'} · Last seen {new Date(session.last_seen_at).toLocaleString()}
                                                </p>
                                            </div>
                                        </div>
                                    </OverviewInfoCard>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-10 text-muted-foreground">
                                <p className="text-4xl mb-3">🔐</p>
                                <p className="font-semibold">No active sessions</p>
                            </div>
                        )
                    )}
                </OverviewPanel>
            </div>

            {adminAccessError ? (
                <HintBox title="Admin access limited" tone="amber">
                    {adminAccessError}
                </HintBox>
            ) : null}
        </div>
    )
}
