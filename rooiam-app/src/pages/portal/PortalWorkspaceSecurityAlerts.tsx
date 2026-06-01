import React, { useEffect, useMemo, useState } from 'react'
import { ShieldAlert, ExternalLink, RotateCcw, CheckCircle2, Loader2 } from 'lucide-react'
import PortalPageHeader from '../../components/portal/PortalPageHeader'
import PortalSectionCard from '../../components/portal/PortalSectionCard'
import PortalPaginationControls from '../../components/portal/PortalPaginationControls'
import { apiFetch, getApiBase } from '../../lib/api-base'
import { portalRoutes } from '../../lib/routes'
import { TONE_STYLES, detectAlerts, buildAlerts, isSecurityLog } from '../../lib/security-alerts'
import type { Organization, OrganizationActivityItem } from '../../lib/portal-types'

type SecurityAlertReview = {
    alert_key: string
    reviewed_by_display_name?: string | null
    reviewed_by_email?: string | null
    reviewed_at: string
}

const DEFAULT_PAGE_SIZE = 20
const PAGE_SIZE_OPTIONS = [20, 50, 100, 200]

type Props = {
    currentOrg: Organization | null
    activity: OrganizationActivityItem[]
    activityLoaded: boolean
}

export default function PortalWorkspaceSecurityAlerts({ currentOrg, activity, activityLoaded }: Props) {
    const [reviewedAlerts, setReviewedAlerts] = useState<SecurityAlertReview[]>([])
    const [reviewsLoading, setReviewsLoading] = useState(false)
    const [actionLoading, setActionLoading] = useState(false)
    const [severityFilter, setSeverityFilter] = useState<'all' | 'high' | 'medium'>('all')
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

    const applyFilter = (term: string) => { setSearch(term); setPage(1) }

    const API = getApiBase()

    useEffect(() => {
        if (!currentOrg?.id) return
        setReviewsLoading(true)
        apiFetch(`${API}/orgs/current/security-alert-reviews`)
            .then(res => res.ok ? res.json().catch(() => ({ items: [] })) : { items: [] })
            .then(data => setReviewedAlerts((data.items ?? []) as SecurityAlertReview[]))
            .finally(() => setReviewsLoading(false))
    }, [currentOrg?.id, API])

    const securityLogs = useMemo(() =>
        activity.filter(l => isSecurityLog(l.action))
    , [activity])

    const signals = useMemo(() => detectAlerts(activity, currentOrg?.slug ?? ''), [activity, currentOrg?.slug])
    const allAlerts = useMemo(() => buildAlerts(signals, securityLogs), [signals, securityLogs])

    const reviewMap = useMemo(
        () => new Map(reviewedAlerts.map(r => [r.alert_key, r])),
        [reviewedAlerts],
    )

    const filteredAlerts = useMemo(() => {
        const q = search.trim().toLowerCase()
        return allAlerts
            .filter(a => !reviewMap.has(a.key))
            .filter(a => severityFilter === 'all' || a.severity === severityFilter)
            .filter(a => !q || a.actor.toLowerCase().includes(q) || a.ip.toLowerCase().includes(q) || a.event.toLowerCase().includes(q))
    }, [allAlerts, reviewMap, severityFilter, search])

    const pagedAlerts = filteredAlerts.slice((page - 1) * pageSize, page * pageSize)
    const openCount = filteredAlerts.length

    const markReviewed = async (key: string) => {
        setActionLoading(true)
        try {
            await apiFetch(`${API}/orgs/current/security-alert-reviews`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ alert_key: key }),
            })
            const res = await apiFetch(`${API}/orgs/current/security-alert-reviews`)
            if (res.ok) {
                const data = await res.json().catch(() => ({ items: [] }))
                setReviewedAlerts((data.items ?? []) as SecurityAlertReview[])
            }
        } finally {
            setActionLoading(false)
        }
    }

    const resetAll = async () => {
        setActionLoading(true)
        try {
            await apiFetch(`${API}/orgs/current/security-alert-reviews`, { method: 'DELETE' })
            setReviewedAlerts([])
        } finally {
            setActionLoading(false)
        }
    }

    const loading = !activityLoaded || reviewsLoading
    const orgSlug = currentOrg?.slug ?? ''

    return (
        <div className="space-y-5 sm:space-y-6">
            <PortalPageHeader
                title="Security Alerts"
                description={
                    loading
                        ? 'Loading workspace security events…'
                        : openCount > 0
                            ? `${openCount} unreviewed alert${openCount > 1 ? 's' : ''} detected in workspace ${orgSlug ? `"${orgSlug}"` : ''}. Press ✓ to mark as acknowledged — reviewed alerts are hidden from this view.`
                            : 'No unreviewed alerts. Workspace looks clean.'
                }
                actions={
                    reviewedAlerts.length > 0 ? (
                        <button
                            type="button"
                            onClick={resetAll}
                            disabled={actionLoading}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl border border-border bg-card text-sm font-black hover:bg-muted/40 transition-colors disabled:opacity-50"
                        >
                            <RotateCcw className="w-4 h-4" /> Reset reviewed
                        </button>
                    ) : undefined
                }
            />

            <PortalSectionCard
                icon={ShieldAlert}
                title="Open Alerts"
                subtitle="Unreviewed security events requiring attention. Mark as reviewed once investigated."
                tone="amber"
                bodyClassName=""
            >
                {/* Summary + filters */}
                <div className="flex flex-wrap items-center gap-3 px-4 pt-4 pb-3 border-b">
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${openCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
                        {openCount > 0 ? `${openCount} open` : 'All clear'}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground">
                        {allAlerts.length} total · {reviewedAlerts.length} reviewed
                    </span>
                    {search && (
                        <button type="button" onClick={() => { setSearch(''); setPage(1) }}
                            className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-black text-indigo-700 hover:bg-indigo-100 transition-colors">
                            {search} ✕
                        </button>
                    )}
                    <div className="ml-auto flex items-center gap-1.5">
                        <span className="text-xs font-black uppercase tracking-wider text-muted-foreground mr-1">Severity</span>
                        {(['all', 'high', 'medium'] as const).map(v => (
                            <button key={v} type="button" onClick={() => { setSeverityFilter(v); setPage(1) }}
                                className={`rounded-full border px-2.5 py-1 text-xs font-black transition ${severityFilter === v ? 'border-rose-400 bg-rose-100 text-rose-800' : 'border-border bg-card text-muted-foreground hover:bg-muted/40'}`}>
                                {v.charAt(0).toUpperCase() + v.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-16 text-muted-foreground">
                        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading alerts…
                    </div>
                ) : pagedAlerts.length === 0 ? (
                    <div className="px-6 py-12 text-center">
                        <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
                        <p className="font-black text-green-800">No open alerts</p>
                        <p className="text-sm font-semibold text-green-600 mt-1">
                            {severityFilter !== 'all' ? 'No open alerts match this severity filter.' : 'All alerts reviewed. Workspace looks clean.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm min-w-[700px]">
                            <thead>
                                <tr className="border-b bg-white/70 text-xs font-semibold text-muted-foreground">
                                    <th className="px-4 py-3">Severity</th>
                                    <th className="px-4 py-3">Event</th>
                                    <th className="px-4 py-3">Actor</th>
                                    <th className="px-4 py-3 hidden md:table-cell">IP Address</th>
                                    <th className="px-4 py-3 hidden sm:table-cell">Timestamp</th>
                                    <th className="px-4 py-3 w-20"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {pagedAlerts.map((alert, i) => {
                                    const toneStyle = TONE_STYLES[alert.eventTone] ?? TONE_STYLES.info
                                    const isLast = i === pagedAlerts.length - 1
                                    return (
                                        <React.Fragment key={alert.key}>
                                            <tr className={`hover:bg-muted/20 transition-colors ${!isLast ? 'border-b' : ''}`}>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${alert.severity === 'high' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                                                        {alert.severity === 'high' ? 'High' : 'Medium'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="space-y-1.5">
                                                        <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-bold ${toneStyle}`}>
                                                            {alert.event}
                                                        </span>
                                                        <p className="text-[11px] text-muted-foreground">{alert.reason}</p>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 max-w-[160px]">
                                                    <button type="button" onClick={() => applyFilter(alert.actor)}
                                                        className="text-xs font-semibold text-foreground truncate block max-w-full text-left hover:text-primary transition-colors"
                                                        title={`Filter by actor: ${alert.actor}`}>
                                                        {alert.actor}
                                                    </button>
                                                </td>
                                                <td className="px-4 py-3 font-mono text-xs text-muted-foreground hidden md:table-cell whitespace-nowrap">
                                                    {alert.ip !== '—' ? (
                                                        <button type="button" onClick={() => applyFilter(alert.ip)}
                                                            className="hover:text-primary transition-colors"
                                                            title={`Filter by IP: ${alert.ip}`}>
                                                            {alert.ip}
                                                        </button>
                                                    ) : '—'}
                                                </td>
                                                <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell whitespace-nowrap">
                                                    {alert.timestamp}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-1.5 justify-end">
                                                        <a
                                                            href={`${portalRoutes.workspaceAuditLogs(orgSlug)}${alert.searchTerm ? `?search=${encodeURIComponent(alert.searchTerm)}` : ''}`}
                                                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-border text-muted-foreground hover:bg-muted/40 transition-colors"
                                                            title="Review in audit logs"
                                                        >
                                                            <ExternalLink className="w-3.5 h-3.5" />
                                                        </a>
                                                        <button
                                                            type="button"
                                                            onClick={() => markReviewed(alert.key)}
                                                            disabled={actionLoading}
                                                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition-colors disabled:opacity-50"
                                                            title="Mark reviewed"
                                                        >
                                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        </React.Fragment>
                                    )
                                })}
                            </tbody>
                        </table>
                        <PortalPaginationControls
                            page={page}
                            totalItems={filteredAlerts.length}
                            pageSize={pageSize}
                            label="alerts"
                            onPageChange={setPage}
                            onPageSizeChange={n => { setPageSize(n); setPage(1) }}
                            pageSizeOptions={PAGE_SIZE_OPTIONS}
                        />
                    </div>
                )}
            </PortalSectionCard>
        </div>
    )
}
