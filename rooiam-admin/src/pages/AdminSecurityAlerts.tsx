import React, { useEffect, useMemo, useState } from 'react'
import { ExternalLink, RotateCcw, CheckCircle2, Loader2 } from 'lucide-react'
import { sysAdminApi } from '@/lib/api'
import type { AdminAuditLog, SecurityAlertReview } from '@/lib/api'
import PageHeader from '@/components/ui/PageHeader'
import PaginationControls from '@/components/ui/PaginationControls'
import { adminRoutes } from '@/lib/routes'
import { TONE_STYLES, detectAlerts, buildAlerts, isSecurityLog } from '@/lib/security-alerts'

const DEFAULT_PAGE_SIZE = 50
const PAGE_SIZE_OPTIONS = [20, 50, 100, 200]

export default function AdminSecurityAlerts() {
    const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([])
    const [reviewedAlerts, setReviewedAlerts] = useState<SecurityAlertReview[]>([])
    const [loading, setLoading] = useState(true)
    const [actionLoading, setActionLoading] = useState(false)
    const [error, setError] = useState('')
    const [severityFilter, setSeverityFilter] = useState<'all' | 'high' | 'medium'>('all')
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

    const applyFilter = (term: string) => { setSearch(term); setPage(1) }

    const load = async () => {
        setLoading(true)
        setError('')
        try {
            const [logsRes, reviewsRes] = await Promise.all([
                sysAdminApi.auditLogs({ page: 1, page_size: 1000 }),
                sysAdminApi.securityAlertReviews(),
            ])
            setAuditLogs(Array.isArray(logsRes) ? logsRes : (logsRes as { items?: AdminAuditLog[] }).items ?? [])
            setReviewedAlerts((reviewsRes as { items?: SecurityAlertReview[] }).items ?? [])
        } catch {
            setError('Could not load security alerts.')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { void load() }, [])

    const last1h = useMemo(() => Date.now() - 60 * 60 * 1000, [])

    const securityLogs = useMemo(() =>
        auditLogs.filter(l => isSecurityLog(l.action))
    , [auditLogs])

    const signals = useMemo(() => detectAlerts(auditLogs, last1h), [auditLogs, last1h])
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

    const openCount = filteredAlerts.length
    const pagedAlerts = filteredAlerts.slice((page - 1) * pageSize, page * pageSize)

    const markReviewed = async (key: string) => {
        setActionLoading(true)
        try {
            await sysAdminApi.markSecurityAlertReviewed(key)
            const refreshed = await sysAdminApi.securityAlertReviews()
            setReviewedAlerts((refreshed as { items?: SecurityAlertReview[] }).items ?? [])
        } finally {
            setActionLoading(false)
        }
    }

    const resetAll = async () => {
        setActionLoading(true)
        try {
            await sysAdminApi.resetSecurityAlertReviews()
            setReviewedAlerts([])
        } finally {
            setActionLoading(false)
        }
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title="Security Alerts"
                description={
                    loading
                        ? 'Loading platform security events…'
                        : openCount > 0
                            ? `${openCount} unreviewed alert${openCount > 1 ? 's' : ''} detected from recent platform activity. Review each one and press ✓ to mark as acknowledged — reviewed alerts are hidden from this view.`
                            : 'No unreviewed alerts. All detected patterns have been acknowledged or the platform is clean.'
                }
                actions={
                    reviewedAlerts.length > 0 ? (
                        <button
                            type="button"
                            onClick={resetAll}
                            disabled={actionLoading}
                            className="wizard-btn-secondary flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-black disabled:opacity-50"
                        >
                            <RotateCcw className="w-4 h-4" /> Reset reviewed
                        </button>
                    ) : undefined
                }
            />

            {error && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</div>
            )}

            {/* Summary + filters */}
            <div className="flex flex-wrap items-center gap-3">
                <span className={`rounded-full px-3 py-1.5 text-sm font-black ${openCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
                    {openCount > 0 ? `${openCount} open alert${openCount > 1 ? 's' : ''}` : 'All clear'}
                </span>
                <span className="text-sm font-semibold text-muted-foreground">
                    {allAlerts.length} total · {reviewedAlerts.length} reviewed
                </span>
                {search && (
                    <button type="button" onClick={() => { setSearch(''); setPage(1) }}
                        className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-black text-indigo-700 hover:bg-indigo-100 transition-colors">
                        {search} ✕
                    </button>
                )}
                <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">Severity</span>
                    {(['all', 'high', 'medium'] as const).map(v => (
                        <button key={v} type="button" onClick={() => { setSeverityFilter(v); setPage(1) }}
                            className={`rounded-full border px-3 py-1.5 text-xs font-black transition ${severityFilter === v ? 'border-rose-400 bg-rose-100 text-rose-800' : 'border-border bg-card text-muted-foreground hover:bg-muted/40'}`}>
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
                <div className="rounded-3xl border border-green-100 bg-green-50 px-6 py-10 text-center">
                    <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
                    <p className="font-black text-green-800">No open alerts</p>
                    <p className="text-sm font-semibold text-green-600 mt-1">
                        {severityFilter !== 'all' || search ? 'No open alerts match the current filters.' : 'All alerts have been reviewed. Platform looks clean.'}
                    </p>
                </div>
            ) : (
                <div className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden overflow-x-auto">
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
                                                        href={`${adminRoutes.adminAuditLogs()}${alert.searchTerm ? `?search=${encodeURIComponent(alert.searchTerm)}` : ''}`}
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
                    <PaginationControls
                        page={page}
                        totalItems={filteredAlerts.length}
                        pageSize={pageSize}
                        label="alerts"
                        onPageChange={p => setPage(p)}
                        onPageSizeChange={n => { setPageSize(n); setPage(1) }}
                        pageSizeOptions={PAGE_SIZE_OPTIONS}
                    />
                </div>
            )}
        </div>
    )
}
