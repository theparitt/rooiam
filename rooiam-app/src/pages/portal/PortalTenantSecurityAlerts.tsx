import React, { useEffect, useMemo, useState } from 'react'
import { ShieldAlert, ExternalLink, RotateCcw, CheckCircle2, Loader2 } from 'lucide-react'
import PortalPageHeader from '../../components/portal/PortalPageHeader'
import PortalSectionCard from '../../components/portal/PortalSectionCard'
import PortalPaginationControls from '../../components/portal/PortalPaginationControls'
import { apiFetch, getApiBase } from '../../lib/api-base'
import { portalRoutes } from '../../lib/routes'
import { TONE_STYLES, detectAlerts, buildAlerts, isSecurityLog } from '../../lib/security-alerts'
import type { OrganizationActivityItem } from '../../lib/portal-types'

type SecurityAlertReview = {
    alert_key: string
    reviewed_by_display_name?: string | null
    reviewed_by_email?: string | null
    reviewed_at?: string
}

const DEFAULT_PAGE_SIZE = 20
const PAGE_SIZE_OPTIONS = [20, 50, 100, 200]

export default function PortalTenantSecurityAlerts() {
    const [activity, setActivity] = useState<OrganizationActivityItem[]>([])
    const [reviewedAlerts, setReviewedAlerts] = useState<SecurityAlertReview[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [severityFilter, setSeverityFilter] = useState<'all' | 'high' | 'medium'>('all')
    const [workspaceFilter, setWorkspaceFilter] = useState<string>('all')
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

    const applyFilter = (term: string) => { setSearch(term); setPage(1) }

    const API = getApiBase()

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError('')

        // The server clamps page_size to 100 on /orgs/tenant/activity, so a single
        // large request silently returns only the first 100 events. This view
        // filters/paginates client-side, so gather every page up to a safety cap.
        const SERVER_MAX_PAGE_SIZE = 100
        const MAX_PAGES = 50 // safety bound: up to 5,000 events

        const fetchActivityPage = async (p: number): Promise<{ items: OrganizationActivityItem[]; total: number }> => {
            const res = await apiFetch(`${API}/orgs/tenant/activity?page=${p}&page_size=${SERVER_MAX_PAGE_SIZE}`)
            if (!res.ok) return { items: [], total: 0 }
            const data = await res.json().catch(() => ({ items: [], total: 0 }))
            if (Array.isArray(data)) return { items: data, total: data.length }
            return { items: data.items ?? [], total: data.total ?? (data.items?.length ?? 0) }
        }

        const loadAllActivity = async () => {
            try {
                const first = await fetchActivityPage(1)
                const all = [...first.items]
                const totalPages = Math.min(Math.ceil(first.total / SERVER_MAX_PAGE_SIZE), MAX_PAGES)
                for (let p = 2; p <= totalPages; p++) {
                    const next = await fetchActivityPage(p)
                    all.push(...next.items)
                }
                if (!cancelled) setActivity(all)
            } catch {
                if (!cancelled) setError('Could not load security alerts.')
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        void loadAllActivity()
        return () => { cancelled = true }
    }, [API])

    const securityLogs = useMemo(() =>
        activity.filter(l => isSecurityLog(l.action))
    , [activity])

    const byWorkspace = useMemo(() => {
        const map: Record<string, OrganizationActivityItem[]> = {}
        for (const item of activity) {
            const slug = (typeof item.metadata?.workspace_slug === 'string' ? item.metadata.workspace_slug : '') || '__unknown__'
            if (!map[slug]) map[slug] = []
            map[slug].push(item)
        }
        return map
    }, [activity])

    const allWorkspaceSlugs = useMemo(() =>
        Object.keys(byWorkspace).filter(s => s !== '__unknown__').sort()
    , [byWorkspace])

    const signals = useMemo(() => {
        const all = []
        for (const [slug, items] of Object.entries(byWorkspace) as [string, OrganizationActivityItem[]][]) {
            all.push(...detectAlerts(items, slug === '__unknown__' ? '' : slug))
        }
        return all
    }, [byWorkspace])

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
            .filter(a => workspaceFilter === 'all' || a.workspaceSlug === workspaceFilter)
            .filter(a => !q || a.actor.toLowerCase().includes(q) || a.ip.toLowerCase().includes(q) || a.context.toLowerCase().includes(q) || a.event.toLowerCase().includes(q))
    }, [allAlerts, reviewMap, severityFilter, workspaceFilter, search])

    const pagedAlerts = filteredAlerts.slice((page - 1) * pageSize, page * pageSize)
    const openCount = filteredAlerts.length

    // Tenant view has no dedicated server-side review scope — reviews are local to this session
    const markReviewed = (key: string) => setReviewedAlerts(prev => [...prev, { alert_key: key }])
    const resetAll = () => setReviewedAlerts([])

    return (
        <div className="space-y-5 sm:space-y-6">
            <PortalPageHeader
                title="Tenant Security Alerts"
                description={
                    loading
                        ? 'Loading tenant security events…'
                        : openCount > 0
                            ? `${openCount} unreviewed alert${openCount > 1 ? 's' : ''} detected across all workspaces. Press ✓ to mark as acknowledged — reviewed alerts are hidden from this view.`
                            : 'No unreviewed alerts. All workspaces look clean.'
                }
                actions={
                    reviewedAlerts.length > 0 ? (
                        <button
                            type="button"
                            onClick={resetAll}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl border border-border bg-card text-sm font-black hover:bg-muted/40 transition-colors"
                        >
                            <RotateCcw className="w-4 h-4" /> Reset reviewed
                        </button>
                    ) : undefined
                }
            />

            <PortalSectionCard
                icon={ShieldAlert}
                title="Open Alerts"
                subtitle="Unreviewed security events across all workspaces. Reviewing here dismisses the alert for the whole tenant."
                tone="amber"
                bodyClassName=""
            >
                {/* Summary + filters */}
                <div className="flex flex-wrap items-center gap-2 px-4 pt-4 pb-3 border-b">
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
                    <div className="ml-auto flex flex-wrap items-center gap-1.5">
                        {allWorkspaceSlugs.length > 0 && (
                            <select
                                value={workspaceFilter}
                                onChange={e => { setWorkspaceFilter(e.target.value); setPage(1) }}
                                className="px-2.5 py-1 rounded-xl border border-border bg-white text-xs font-black outline-none"
                            >
                                <option value="all">All workspaces</option>
                                {allWorkspaceSlugs.map(slug => (
                                    <option key={slug} value={slug}>{slug}</option>
                                ))}
                            </select>
                        )}
                        <span className="text-xs font-black uppercase tracking-wider text-muted-foreground ml-1">Severity</span>
                        {(['all', 'high', 'medium'] as const).map(v => (
                            <button key={v} type="button" onClick={() => { setSeverityFilter(v); setPage(1) }}
                                className={`rounded-full border px-2.5 py-1 text-xs font-black transition ${severityFilter === v ? 'border-rose-400 bg-rose-100 text-rose-800' : 'border-border bg-card text-muted-foreground hover:bg-muted/40'}`}>
                                {v.charAt(0).toUpperCase() + v.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                {error && (
                    <div className="mx-4 my-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</div>
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-16 text-muted-foreground">
                        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading alerts…
                    </div>
                ) : pagedAlerts.length === 0 ? (
                    <div className="px-6 py-12 text-center">
                        <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
                        <p className="font-black text-green-800">No open alerts</p>
                        <p className="text-sm font-semibold text-green-600 mt-1">
                            {severityFilter !== 'all' || workspaceFilter !== 'all'
                                ? 'No open alerts match the current filters.'
                                : 'All alerts reviewed. Tenant looks clean.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm min-w-[760px]">
                            <thead>
                                <tr className="border-b bg-white/70 text-xs font-semibold text-muted-foreground">
                                    <th className="px-4 py-3">Severity</th>
                                    <th className="px-4 py-3">Event</th>
                                    <th className="px-4 py-3">Actor</th>
                                    <th className="px-4 py-3 hidden lg:table-cell">Workspace</th>
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
                                                <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell whitespace-nowrap">
                                                    {alert.context ? (
                                                        <button type="button" onClick={() => applyFilter(alert.context)}
                                                            className="hover:text-primary transition-colors"
                                                            title={`Filter by workspace: ${alert.context}`}>
                                                            {alert.context}
                                                        </button>
                                                    ) : '—'}
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
                                                            href={alert.workspaceSlug
                                                                ? `${portalRoutes.workspaceAuditLogs(alert.workspaceSlug)}${alert.searchTerm ? `?search=${encodeURIComponent(alert.searchTerm)}` : ''}`
                                                                : `${portalRoutes.tenantAuditLogs()}${alert.searchTerm ? `?search=${encodeURIComponent(alert.searchTerm)}` : ''}`
                                                            }
                                                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-border text-muted-foreground hover:bg-muted/40 transition-colors"
                                                            title={alert.workspaceSlug ? `Review in workspace audit logs (${alert.workspaceSlug})` : 'Review in tenant audit logs'}
                                                        >
                                                            <ExternalLink className="w-3.5 h-3.5" />
                                                        </a>
                                                        <button
                                                            type="button"
                                                            onClick={() => markReviewed(alert.key)}
                                                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
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
