import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Building2, Clock3, HelpCircle, Loader2, ShieldCheck, Users } from 'lucide-react'
import PortalAuditEventItem from '../../components/portal/PortalAuditEventItem'
import PortalHintBox from '../../components/portal/PortalHintBox'
import PortalPageHeader from '../../components/portal/PortalPageHeader'
import PortalOverviewInfoCard from '../../components/portal/PortalOverviewInfoCard'
import PortalOverviewPanel from '../../components/portal/PortalOverviewPanel'
import PortalOverviewStatCard from '../../components/portal/PortalOverviewStatCard'
import PortalPill from '../../components/portal/PortalPill'
import { apiFetch, getApiBase, resolveApiAssetUrl } from '../../lib/api-base'
import { LOGIN_SECTION_LABEL, WORKSPACE_LABEL, WORKSPACE_LABEL_PLURAL, WORKSPACE_LABEL_PLURAL_LOWER } from '../../lib/domain-labels'
import { workspaceIconContainerClass } from '../../lib/login-style'
import { Organization, OrganizationActivityItem, OrganizationMember } from '../../lib/portal-types'
import { portalRoutes } from '../../lib/routes'

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

type SecurityAlertReview = {
    alert_key: string
    reviewed_by_user_id: string | null
    reviewed_by_display_name?: string | null
    reviewed_by_email?: string | null
    reviewed_at: string
}

function detectAlerts(activity: OrganizationActivityItem[]): AlertSignal[] {
    const last1h = Date.now() - 60 * 60 * 1000
    const recent = activity.filter(l => new Date(l.created_at).getTime() >= last1h)
    const failures = recent.filter(l => l.action.includes('failed') || l.action.includes('suspicious'))
    const signals: AlertSignal[] = []

    // Brute force: 3+ failures on same account
    const byAccount: Record<string, number> = {}
    for (const f of failures) {
        const key = f.actor_email || f.actor_user_id || ''
        if (key) byAccount[key] = (byAccount[key] ?? 0) + 1
    }
    for (const [account, count] of Object.entries(byAccount)) {
        if (count >= 3) {
            signals.push({ type: 'brute-force', message: `${count} failed sign-ins on one account`, detail: account })
        }
    }

    // Spray: 3+ different accounts failed from same IP
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
            signals.push({ type: 'spray', message: `${accounts.size} different accounts failed from one IP`, detail: ip })
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

type Props = {
    currentOrg: Organization | null
    members: OrganizationMember[]
    activity: OrganizationActivityItem[]
    membersLoaded: boolean
    activityLoaded: boolean
    currentPortalTitle: string
}

export default function PortalWorkspaceOverview({
    currentOrg,
    members,
    activity,
    membersLoaded,
    activityLoaded,
    currentPortalTitle,
}: Props) {
    const SEEN_KEY = `rooiam_security_seen_${currentOrg?.id ?? 'global'}`
    const [activeTab, setActiveTab] = useState<'all' | 'security' | 'apikeys'>('all')
    const [lastSeen, setLastSeen] = useState<number>(() => {
        const stored = localStorage.getItem(SEEN_KEY)
        return stored ? parseInt(stored, 10) : 0
    })
    const [reviewedAlerts, setReviewedAlerts] = useState<SecurityAlertReview[]>([])
    const [alertView, setAlertView] = useState<'open' | 'reviewed' | 'all'>('open')
    const [severityFilter, setSeverityFilter] = useState<'all' | 'high' | 'medium'>('all')

    const workspaceIconSrc = resolveApiAssetUrl(currentOrg?.icon_url)
    const adminCount = members.filter(member => member.role_codes?.includes('owner') || member.role_codes?.includes('admin')).length
    const userCount = Math.max(0, members.length - adminCount)
    const signInMethods = currentOrg
        ? [
            currentOrg.allow_magic_link ? 'Magic link' : null,
            currentOrg.allow_google ? 'Google' : null,
            currentOrg.allow_microsoft ? 'Microsoft' : null,
            currentOrg.allow_passkey ? 'Passkey' : null,
        ].filter(Boolean)
        : []
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000)
    const newMembers24h = members.filter(member => new Date(member.created_at).getTime() >= oneDayAgo)

    const securityEvents = activity.filter(item =>
        item.action.includes('failed') ||
        item.action.includes('suspicious') ||
        item.action.includes('blocked') ||
        item.action.includes('mismatch') ||
        item.action.includes('mfa.required') ||
        item.action.includes('mfa.challenge') ||
        item.action.includes('denied')
    ).slice(0, 20)

    const apiKeyEvents = activity.filter(item =>
        item.action.includes('api_key.') ||
        item.action.includes('oauth_client.')
    ).slice(0, 20)

    const allEvents = activity.slice(0, 20)

    const unseenSecurityCount = activityLoaded
        ? securityEvents.filter(item => new Date(item.created_at).getTime() > lastSeen).length
        : 0

    const recentSignIns24h = activity.filter(item =>
        new Date(item.created_at).getTime() >= oneDayAgo &&
        (
            item.action.includes('auth.login.success') ||
            item.action.includes('oauth.login.success') ||
            item.action.includes('demo.oauth.login.success') ||
            item.action.includes('passkey.login.success')
        )
    ).length

    const handleSecurityTab = () => {
        setActiveTab('security')
        const now = Date.now()
        setLastSeen(now)
        localStorage.setItem(SEEN_KEY, String(now))
    }

    const tabEvents = activeTab === 'security' ? securityEvents : activeTab === 'apikeys' ? apiKeyEvents : allEvents
    const alerts = useMemo(() => detectAlerts(activity), [activity])
    const highRiskSecurityEvents = useMemo(
        () => securityEvents.filter(item =>
            item.action.includes('suspicious')
            || item.action.includes('blocked')
            || item.action.includes('mismatch')
            || item.action.includes('denied')
        ).slice(0, 5),
        [securityEvents],
    )
    const operatorAlerts = useMemo<OperatorAlert[]>(() => {
        const groupedAlerts = alerts.map((alert, index) => {
            const severity: OperatorAlert['severity'] = alert.type === 'suspicious' ? 'medium' : 'high'
            return {
                key: `group:${alert.type}:${alert.detail}:${index}`,
                severity,
                title: alert.message,
                detail: alert.detail || 'Recent workspace auth risk',
                secondary: alert.type === 'spray' ? 'Multiple accounts from one IP' : 'Needs operator review',
                searchTerm: alert.detail,
            }
        })
        const eventAlerts = highRiskSecurityEvents.map(item => {
            const severity: OperatorAlert['severity'] =
                item.action.includes('blocked') || item.action.includes('denied') ? 'high' : 'medium'
            return {
                key: `event:${item.id}`,
                severity,
                title: item.action,
                detail: item.actor_email || item.actor_display_name || item.ip || 'Recent workspace auth risk',
                secondary: new Date(item.created_at).toLocaleString(),
                searchTerm: item.actor_email || item.ip || item.target_id || item.action,
            }
        })
        return [...groupedAlerts, ...eventAlerts]
    }, [alerts, highRiskSecurityEvents])
    const reviewMap = useMemo(
        () => new Map(reviewedAlerts.map(review => [review.alert_key, review])),
        [reviewedAlerts],
    )
    const filteredOperatorAlerts = useMemo(() => {
        return operatorAlerts
            .filter(alert => severityFilter === 'all' || alert.severity === severityFilter)
            .filter(alert => {
                const reviewed = reviewMap.has(alert.key)
                if (alertView === 'open') return !reviewed
                if (alertView === 'reviewed') return reviewed
                return true
            })
            .slice(0, 8)
    }, [alertView, operatorAlerts, reviewMap, severityFilter])

    useEffect(() => {
        let cancelled = false
        const loadReviews = async () => {
            if (!currentOrg?.id) {
                setReviewedAlerts([])
                return
            }
            const res = await apiFetch(`${getApiBase()}/orgs/current/security-alert-reviews`)
            if (!res.ok) return
            const data = await res.json().catch(() => ({ items: [] }))
            if (!cancelled) {
                setReviewedAlerts((data.items || []) as SecurityAlertReview[])
            }
        }
        void loadReviews()
        return () => {
            cancelled = true
        }
    }, [currentOrg?.id])

    const markAlertReviewed = (alertKey: string) => {
        void (async () => {
            const res = await apiFetch(`${getApiBase()}/orgs/current/security-alert-reviews`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ alert_key: alertKey }),
            })
            if (!res.ok) return
            const data = await res.json().catch(() => ({ ok: true }))
            void data
            const refresh = await apiFetch(`${getApiBase()}/orgs/current/security-alert-reviews`)
            if (!refresh.ok) return
            const reviews = await refresh.json().catch(() => ({ items: [] }))
            setReviewedAlerts((reviews.items || []) as SecurityAlertReview[])
        })()
    }

    const resetReviewedAlerts = () => {
        void (async () => {
            const res = await apiFetch(`${getApiBase()}/orgs/current/security-alert-reviews`, {
                method: 'DELETE',
            })
            if (!res.ok) return
            setReviewedAlerts([])
        })()
    }

    const summaryStats = [
        {
            title: `Active ${WORKSPACE_LABEL}`,
            value: currentOrg?.name || 'Not selected',
            desc: currentOrg?.slug || `Choose a ${WORKSPACE_LABEL.toLowerCase()}`,
            icon: Building2,
            color: 'text-pink-500',
            bg: 'bg-pink-50 border-pink-100',
        },
        {
            title: 'Members',
            value: membersLoaded ? String(members.length) : '—',
            desc: membersLoaded
                ? `${adminCount} admins · ${userCount} users${newMembers24h.length > 0 ? ` · +${newMembers24h.length} new / 24h` : ''}`
                : 'Workspace members',
            icon: Users,
            color: 'text-purple-500',
            bg: 'bg-purple-50 border-purple-100',
        },
        {
            title: 'Security Attention',
            value: activityLoaded ? String(securityEvents.length) : '—',
            desc: currentOrg?.require_mfa ? 'Review recent auth risks in this workspace' : 'Failed, suspicious, blocked, or MFA-related events',
            icon: ShieldCheck,
            color: 'text-blue-500',
            bg: 'bg-blue-50 border-blue-100',
        },
        {
            title: 'Recent Sign-Ins · 24h',
            value: activityLoaded ? String(recentSignIns24h) : '—',
            desc: 'Successful workspace sign-ins in the last day',
            icon: Clock3,
            color: 'text-emerald-500',
            bg: 'bg-emerald-50 border-emerald-100',
        },
    ]

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PortalPageHeader
                title={currentPortalTitle}
                description={currentOrg ? `Overview for ${currentOrg.name}.` : `Overview for the active ${WORKSPACE_LABEL.toLowerCase()}.`}
                actions={
                    <a
                        title="Help & Docs"
                        href="/docs/quick-start"
                        target="_blank"
                        rel="noreferrer"
                        className="w-10 h-10 rounded-full bg-accent border border-accent/50 flex items-center justify-center hover:scale-110 transition-transform shadow-sm"
                    >
                        <HelpCircle className="w-5 h-5 text-accent-foreground" />
                    </a>
                }
            />

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {summaryStats.map((stat) => (
                    <PortalOverviewStatCard
                        key={stat.title}
                        title={stat.title}
                        value={stat.value}
                        description={stat.desc}
                        icon={stat.icon}
                        colorClass={stat.color}
                        surfaceClass={stat.bg}
                    />
                ))}
            </div>

            {activityLoaded && operatorAlerts.length > 0 ? (
                <PortalHintBox
                    tone="amber"
                    title="Suspicious Auth Alerts"
                    className="px-5 py-4"
                >
                    <div className="space-y-3">
                        <p>
                            Tenant owners and admins should review recent sign-in anomalies here before they become account takeover issues.
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
                            {currentOrg ? (
                                <a
                                    href={`${portalRoutes.workspaceAuditLogs(currentOrg.slug)}?action=suspicious`}
                                    className="rounded-full border border-amber-300 bg-white/80 px-2.5 py-1 hover:bg-white"
                                >
                                    Open suspicious audit logs
                                </a>
                            ) : null}
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
                                            {currentOrg ? (
                                                <a
                                                    href={`${portalRoutes.workspaceAuditLogs(currentOrg.slug)}?action=suspicious${alert.searchTerm ? `&search=${encodeURIComponent(alert.searchTerm)}` : ''}`}
                                                    className="rounded-full border border-amber-300 bg-white/80 px-2 py-0.5 text-[11px] font-bold text-amber-900 hover:bg-white"
                                                >
                                                    Logs
                                                </a>
                                            ) : null}
                                            <button
                                                type="button"
                                                onClick={() => !review && markAlertReviewed(alert.key)}
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
                        ) : (
                            <div className="rounded-2xl border border-amber-200 bg-white/70 px-3 py-3">
                                <p className="text-sm font-black text-amber-900">All current alerts are reviewed.</p>
                                <p className="text-xs font-semibold text-amber-800">
                                    {reviewedAlerts[0]
                                        ? `Last review: ${(reviewedAlerts[0].reviewed_by_display_name || reviewedAlerts[0].reviewed_by_email || 'An operator')} at ${new Date(reviewedAlerts[0].reviewed_at).toLocaleString()}.`
                                        : 'New suspicious auth events will appear here automatically.'}
                                </p>
                            </div>
                        )}
                    </div>
                </PortalHintBox>
            ) : null}

            <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                <PortalOverviewPanel
                    icon={Building2}
                    title={`${WORKSPACE_LABEL} Summary`}
                    subtitle="Identity and branding for the selected workspace."
                    tone="indigo"
                >
                    {currentOrg ? (
                        <div className="space-y-4">
                            <PortalOverviewInfoCard>
                                <div className="flex items-center gap-4">
                                    {currentOrg.icon_url ? (
                                        <img
                                            src={workspaceIconSrc}
                                            alt={currentOrg.name}
                                            className={`h-14 w-14 border border-border object-cover shadow-sm ${workspaceIconContainerClass(currentOrg.icon_container)}`}
                                        />
                                    ) : (
                                        <div className={`flex h-14 w-14 items-center justify-center border border-border bg-background shadow-sm ${workspaceIconContainerClass(currentOrg.icon_container)}`}>
                                            <img src="/rooiam-app-white.svg" alt="Workspace avatar" className="h-10 w-10 object-contain" />
                                        </div>
                                    )}
                                    <div className="min-w-0">
                                        <p className="truncate text-base font-black">{currentOrg.name}</p>
                                        <p className="truncate text-sm font-semibold text-muted-foreground">{currentOrg.slug}</p>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            <PortalPill tone={currentOrg.status === 'active' ? 'green' : 'gray'} className="px-2 py-0.5 text-xs">
                                                {currentOrg.status}
                                            </PortalPill>
                                            <PortalPill className="border-border bg-white px-2 py-0.5 text-xs text-muted-foreground">
                                                Created {new Date(currentOrg.created_at).toLocaleDateString()}
                                            </PortalPill>
                                        </div>
                                    </div>
                                </div>
                            </PortalOverviewInfoCard>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <PortalOverviewInfoCard title="Workspace Slug">
                                    <p className="mt-2 text-base font-black font-mono">{currentOrg.slug}</p>
                                    <p className="mt-1 text-xs font-medium text-muted-foreground">URL identifier — cannot be changed.</p>
                                </PortalOverviewInfoCard>

                                <PortalOverviewInfoCard title="Brand Color">
                                    <div className="mt-2 flex items-center gap-3">
                                        <span
                                            className="h-5 w-5 rounded-full border border-border shadow-sm"
                                            style={{ background: currentOrg.brand_color || '#c96b8a' }}
                                        />
                                        <p className="text-base font-black">{currentOrg.brand_color || '#c96b8a'}</p>
                                    </div>
                                </PortalOverviewInfoCard>

                                <PortalOverviewInfoCard title={LOGIN_SECTION_LABEL} className="sm:col-span-2">
                                    <p className="mt-2 text-sm font-black">
                                        {signInMethods.length > 0 ? signInMethods.join(' · ') : 'No methods enabled'}
                                    </p>
                                    <p className="mt-1 text-xs font-medium text-muted-foreground">
                                        {currentOrg.require_mfa ? 'MFA is required for this workspace.' : 'MFA is optional for this workspace.'}
                                    </p>
                                </PortalOverviewInfoCard>
                            </div>
                        </div>
                    ) : (
                        <div className="rounded-3xl border border-violet-100 bg-violet-50 p-4">
                            <p className="font-bold text-violet-900">{`No active ${WORKSPACE_LABEL.toLowerCase()} selected`}</p>
                            <p className="mt-1 text-sm font-medium text-violet-800">{`Choose one of your ${WORKSPACE_LABEL_PLURAL_LOWER} from the ${WORKSPACE_LABEL_PLURAL} section first.`}</p>
                        </div>
                    )}
                </PortalOverviewPanel>

                <PortalOverviewPanel
                    icon={ShieldCheck}
                    title="Workspace Audit Logs"
                    subtitle="Recent audit logs across the workspace."
                    tone="emerald"
                    action={activityLoaded ? <span className="cute-badge bg-secondary text-secondary-foreground">{allEvents.length} recent</span> : undefined}
                    bodyClassName="mt-3 sm:mt-4"
                >
                    {/* Tab bar */}
                    <div className="flex gap-1 border-b pb-0 mb-3" style={{ borderColor: 'hsl(var(--border))' }}>
                        {([
                            { id: 'all' as const, label: 'All', badge: null as number | null },
                            { id: 'security' as const, label: 'Security', badge: unseenSecurityCount > 0 ? unseenSecurityCount : null as number | null },
                            { id: 'apikeys' as const, label: 'API Keys', badge: null as number | null },
                        ]).map(tab => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={tab.id === 'security' ? handleSecurityTab : () => setActiveTab(tab.id)}
                                className={`relative flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-t-xl border-b-2 -mb-px transition-all ${
                                    activeTab === tab.id
                                        ? 'text-emerald-600 border-emerald-400 bg-emerald-50'
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

                    {/* Alert strip — only on All tab */}
                    {activityLoaded && activeTab === 'all' && alerts.length > 0 && (
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

                    {/* Tab content */}
                    <div className="space-y-2">
                        {!activityLoaded ? (
                            <div className="flex items-center gap-2 rounded-2xl border border-border bg-white px-3 py-3 text-sm font-bold text-muted-foreground">
                                <Loader2 className="w-4 h-4 animate-spin shrink-0" /> Loading activity…
                            </div>
                        ) : tabEvents.length === 0 ? (
                            <div className="rounded-2xl border border-border bg-white px-3 py-3 text-sm font-bold text-muted-foreground">
                                {activeTab === 'security' ? 'No security events — all clear.' : activeTab === 'apikeys' ? 'No API key events recently.' : 'No recent workspace activity.'}
                            </div>
                        ) : (
                            tabEvents.map(item => (
                                <PortalAuditEventItem key={item.id} item={item} compact />
                            ))
                        )}
                    </div>
                </PortalOverviewPanel>
            </div>
        </div>
    )
}
