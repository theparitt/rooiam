import React, { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Activity, ArrowLeft, Loader2, Search, Download, Braces, RefreshCw } from 'lucide-react'
import { actionStyle } from '@/lib/audit-style'
import { actionLabel, auditActionContext, apiRouteArea, apiRoutePurpose } from '@/lib/audit-events'
import HelpTooltip from '@/components/ui/HelpTooltip'
import DateRangeFilter from '@/components/ui/DateRangeFilter'
import { sysAdminApi } from '@/lib/api'
import type { AdminAuditLog } from '@/lib/api'
import PaginationControls from '@/components/ui/PaginationControls'
import PageHeader from '@/components/ui/PageHeader'
import SectionCard from '@/components/ui/SectionCard'

const DEFAULT_PAGE_SIZE = 50
const QUICK_VIEWS = [
    { id: 'all', label: 'All', action: 'all', search: '' },
    { id: 'suspicious-auth', label: 'Suspicious Auth', action: 'suspicious', search: '' },
    { id: 'api-keys', label: 'API Key Activity', action: 'api_key', search: '' },
    { id: 'app-changes', label: 'App Changes', action: 'oauth_client', search: '' },
    { id: 'members', label: 'Members', action: 'workspace.member', search: '' },
] as const

export default function TenantWorkspaceAuditLogs() {
    const { workspaceId } = useParams()
    const [searchParams, setSearchParams] = useSearchParams()
    const [logs, setLogs] = useState<AdminAuditLog[]>([])
    const [totalLogs, setTotalLogs] = useState(0)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [search, setSearch] = useState(() => searchParams.get('search') || '')
    const [actionFilter, setActionFilter] = useState<string>(() => searchParams.get('action') || 'all')
    const [quickView, setQuickView] = useState<string>(() => searchParams.get('view') || 'all')
    const [page, setPage] = useState(() => {
        const value = Number(searchParams.get('page') || '1')
        return Number.isFinite(value) && value > 0 ? value : 1
    })
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [exporting, setExporting] = useState(false)
    const [expandedId, setExpandedId] = useState<number | null>(null)
    const [refreshKey, setRefreshKey] = useState(0)

    const handlePageSizeChange = (n: number) => { setPageSize(n); setPage(1) }

    const handleExport = (format: 'csv' | 'json') => {
        if (!workspaceId) return
        setExporting(true)
        sysAdminApi.workspaceAuditLogs(workspaceId, { page: 1, page_size: 1000, search, action: actionFilter, date_from: dateFrom || undefined, date_to: dateTo || undefined })
            .then(result => {
                const rows = result.items
                if (format === 'json') {
                    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
                    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'workspace-audit-logs.json'; a.click(); URL.revokeObjectURL(a.href)
                } else {
                    const header = 'timestamp,action,actor_email,target_type,target_id,ip\n'
                    const csv = rows.map(r => [r.created_at, r.action, r.actor_email ?? '', r.target_type, r.target_id ?? '', r.ip ?? ''].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
                    const blob = new Blob([header + csv], { type: 'text/csv' })
                    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'workspace-audit-logs.csv'; a.click(); URL.revokeObjectURL(a.href)
                }
            })
            .finally(() => setExporting(false))
    }

    useEffect(() => {
        if (!workspaceId) return
        setLoading(true)
        sysAdminApi.workspaceAuditLogs(workspaceId, { page, page_size: pageSize, search, action: actionFilter, date_from: dateFrom || undefined, date_to: dateTo || undefined })
            .then(result => {
                setLogs(result.items)
                setTotalLogs(result.total)
            })
            .catch(err => setError(err instanceof Error ? err.message : 'Could not load workspace audit logs.'))
            .finally(() => setLoading(false))
    }, [workspaceId, page, pageSize, search, actionFilter, dateFrom, dateTo, refreshKey])

    useEffect(() => {
        const next = new URLSearchParams()
        if (search.trim()) next.set('search', search.trim())
        if (actionFilter !== 'all') next.set('action', actionFilter)
        if (quickView !== 'all') next.set('view', quickView)
        if (page > 1) next.set('page', String(page))
        setSearchParams(next, { replace: true })
    }, [actionFilter, page, quickView, search, setSearchParams])

    const applyQuickView = (viewId: string) => {
        const view = QUICK_VIEWS.find(candidate => candidate.id === viewId)
        if (!view) return
        setQuickView(view.id)
        setActionFilter(view.action)
        setSearch(view.search)
        setPage(1)
    }

    const applySearchTerm = (term: string | null | undefined) => {
        const next = term?.trim()
        if (!next) return
        setSearch(next)
        setPage(1)
    }

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PageHeader
                eyebrow={
                    <Link
                        to={`/tenant-workspace/workspaces/${workspaceId}`}
                        className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-800"
                    >
                        <ArrowLeft className="h-4 w-4" /> Back to Workspace
                    </Link>
                }
                title={<>Workspace Audit Logs <HelpTooltip text="All events that occurred in this specific workspace — by any actor (owner, admin, or member). Other workspaces under the same tenant are not included." /></>}
                description="Events scoped to this workspace only. Excludes tenant-wide operator sign-ins and cross-workspace operator activity."
            />

            <SectionCard
                icon={Activity}
                title="Workspace Event Stream"
                subtitle="Workspace members, workspace settings, app events, and workspace-scoped auth events only. Use Tenant Audit Logs for owner and admin operator history."
                tone="emerald"
                action={
                    <span className="cute-badge border border-emerald-200 bg-emerald-100 font-bold text-emerald-700">
                        {totalLogs} events
                    </span>
                }
                bodyClassName=""
            >
                {/* Filter bar */}
                <div className="flex flex-col gap-3 border-b bg-white/80 px-4 py-3 sm:flex-row sm:px-5">
                    <div className="flex flex-wrap items-center gap-2 sm:order-last">
                        <span className="text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">Quick Views</span>
                        {QUICK_VIEWS.map(view => (
                            <button
                                key={view.id}
                                type="button"
                                onClick={() => applyQuickView(view.id)}
                                className={`rounded-full border px-3 py-1.5 text-[11px] font-black transition ${
                                    quickView === view.id
                                        ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                                        : 'border-border bg-white text-muted-foreground hover:bg-muted/40'
                                }`}
                            >
                                {view.label}
                            </button>
                        ))}
                    </div>
                    <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Search action, target, actor, or IP…"
                                value={search}
                                onChange={e => {
                                    setSearch(e.target.value)
                                    setQuickView('all')
                                    setPage(1)
                                }}
                                className="w-full pl-11 pr-4 py-2.5 bg-card border-2 border-border rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary transition-all"
                            />
                        </div>
                    <select
                        value={actionFilter}
                        onChange={e => { setActionFilter(e.target.value); setQuickView('all'); setPage(1) }}
                        className="px-4 py-2.5 bg-card border-2 border-border rounded-2xl text-sm font-bold outline-none shrink-0"
                    >
                        <option value="all">All events</option>
                        <optgroup label="By outcome">
                            <option value="success">✓ Success</option>
                            <option value="failed">✗ Failed / Blocked</option>
                            <option value="suspicious">⚠ Suspicious</option>
                        </optgroup>
                        <optgroup label="By category">
                            <option value="auth.login">Auth — sign-in</option>
                            <option value="auth.logout">Auth — sign-out</option>
                            <option value="auth.magic_link">Auth — magic link</option>
                            <option value="auth.mfa">MFA</option>
                            <option value="auth.passkey">Passkeys</option>
                            <option value="oauth.">OAuth / social login</option>
                            <option value="workspace.member">Members</option>
                            <option value="workspace.invite">Invites</option>
                            <option value="workspace.auth_policy">Access policy</option>
                            <option value="workspace.branding">Branding</option>
                            <option value="workspace.client_policy">Client policy</option>
                            <option value="workspace.ip_policy">IP policy</option>
                            <option value="workspace.security_alert">Security alerts</option>
                            <option value="workspace.">Workspace (all)</option>
                            <option value="oauth_client">Apps / OAuth clients</option>
                            <option value="api_key">API keys</option>
                        </optgroup>
                    </select>
                    <DateRangeFilter
                        dateFrom={dateFrom}
                        dateTo={dateTo}
                        onDateFromChange={v => { setDateFrom(v); setQuickView('all'); setPage(1) }}
                        onDateToChange={v => { setDateTo(v); setQuickView('all'); setPage(1) }}
                    />
                    <div className="flex gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={() => setRefreshKey(value => value + 1)}
                            disabled={loading}
                            title="Refresh audit logs"
                            className="inline-flex items-center justify-center px-3 py-2.5 bg-card border-2 border-border rounded-2xl text-sm font-bold hover:bg-muted/40 transition-colors disabled:opacity-50"
                        >
                            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                            type="button"
                            onClick={() => handleExport('csv')}
                            disabled={exporting || loading}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-card border-2 border-border rounded-2xl text-sm font-bold hover:bg-muted/40 transition-colors disabled:opacity-50"
                        >
                            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} CSV
                        </button>
                        <button
                            type="button"
                            onClick={() => handleExport('json')}
                            disabled={exporting || loading}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-card border-2 border-border rounded-2xl text-sm font-bold hover:bg-muted/40 transition-colors disabled:opacity-50"
                        >
                            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} JSON
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-16 text-muted-foreground">
                        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading audit events…
                    </div>
                ) : error ? (
                    <div className="text-center py-16 text-red-500 bg-red-50 m-4 rounded-3xl">
                        <p className="text-5xl mb-3">🛑</p>
                        <p className="font-bold text-lg max-w-sm mx-auto">{error}</p>
                    </div>
                ) : logs.length === 0 ? (
                    <div className="text-center py-16 text-muted-foreground">
                        <p className="text-5xl mb-3">🔍</p>
                        <p className="font-bold text-lg">No audit events found</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm min-w-[640px]">
                            <thead>
                                <tr className="border-b bg-white/70 font-semibold text-muted-foreground">
                                    <th className="px-3 sm:px-5 py-3 sm:py-4">Timestamp</th>
                                    <th className="px-3 sm:px-5 py-3 sm:py-4">Action</th>
                                    <th className="px-3 sm:px-5 py-3 sm:py-4">Actor</th>
                                    <th className="px-3 sm:px-5 py-3 sm:py-4 hidden sm:table-cell">Target</th>
                                    <th className="px-3 sm:px-5 py-3 sm:py-4 hidden md:table-cell">IP Address</th>
                                    <th className="px-3 sm:px-5 py-3 sm:py-4 w-8"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((log, i) => {
                                    const isExpanded = expandedId === log.id
                                    const hasExtra = log.metadata != null && Object.keys(log.metadata).length > 0
                                    return (
                                    <React.Fragment key={log.id}>
                                    <tr className={`hover:bg-muted/20 transition-colors ${i !== logs.length - 1 || isExpanded ? 'border-b' : ''}`}>
                                        <td className="px-3 sm:px-5 py-3 sm:py-4 whitespace-nowrap text-xs text-muted-foreground">
                                            {new Date(log.created_at).toLocaleString()}
                                        </td>
                                        <td className="px-3 sm:px-5 py-3 sm:py-4">
                                            <div className="space-y-1">
                                                <button
                                                    type="button"
                                                    onClick={() => applySearchTerm(log.action)}
                                                    title={`Filter by action: ${actionLabel(log.action)}`}
                                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border hover:opacity-80 transition-opacity ${actionStyle(log.action).className}`}>
                                                    {actionStyle(log.action).icon}
                                                    {actionLabel(log.action)}
                                                </button>
                                                {auditActionContext(log) ? (
                                                    <p className="text-[11px] font-semibold text-muted-foreground truncate">
                                                        {auditActionContext(log)}
                                                    </p>
                                                ) : null}
                                            </div>
                                        </td>
                                        <td className="px-3 sm:px-5 py-3 sm:py-4 text-xs">
                                            <div className="flex flex-col max-w-[180px]">
                                                <button
                                                    type="button"
                                                    onClick={() => applySearchTerm(log.actor_display_name || log.actor_email || log.actor_user_id)}
                                                    className="font-semibold truncate text-foreground text-left hover:text-primary transition-colors"
                                                    title={`Filter by actor: ${log.actor_display_name || log.actor_email || log.actor_user_id || 'System'}`}
                                                >
                                                    {log.actor_display_name || log.actor_email || (log.actor_user_id ? 'Unknown user' : 'System')}
                                                </button>
                                                {log.actor_email && log.actor_display_name ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => applySearchTerm(log.actor_email)}
                                                        className="text-[10px] text-muted-foreground truncate font-mono text-left hover:text-primary transition-colors"
                                                        title={`Filter by actor email: ${log.actor_email}`}
                                                    >
                                                        {log.actor_email}
                                                    </button>
                                                ) : log.actor_user_id ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => applySearchTerm(log.actor_user_id)}
                                                        className="text-[10px] text-muted-foreground truncate font-mono text-left hover:text-primary transition-colors"
                                                        title={`Filter by actor ID: ${log.actor_user_id}`}
                                                    >
                                                        {log.actor_user_id}
                                                    </button>
                                                ) : null}
                                            </div>
                                        </td>
                                        <td className="px-3 sm:px-5 py-3 sm:py-4 hidden sm:table-cell">
                                            <div className="flex flex-col">
                                                <span className="font-semibold text-xs">
                                                    {log.target_type === 'tenant_api_key'
                                                        ? apiRouteArea(typeof log.metadata?.path === 'string' ? log.metadata.path : null)
                                                        : log.target_type.replace(/_/g, ' ')}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => applySearchTerm(log.target_type === 'tenant_api_key'
                                                        ? (typeof log.metadata?.path === 'string' ? log.metadata.path : null)
                                                        : log.target_id)}
                                                    className="font-mono text-[10px] text-muted-foreground truncate max-w-[150px] text-left hover:text-primary transition-colors disabled:cursor-default disabled:hover:text-muted-foreground"
                                                    title={(log.target_type === 'tenant_api_key'
                                                        ? (typeof log.metadata?.path === 'string' ? log.metadata.path : null)
                                                        : log.target_id) ? 'Filter by target' : ''}
                                                    disabled={!(log.target_type === 'tenant_api_key'
                                                        ? (typeof log.metadata?.path === 'string' ? log.metadata.path : null)
                                                        : log.target_id)}
                                                >
                                                    {log.target_type === 'tenant_api_key'
                                                        ? (typeof log.metadata?.path === 'string' ? log.metadata.path : '—')
                                                        : log.target_id}
                                                </button>
                                                {log.target_type === 'tenant_api_key' && typeof log.metadata?.path === 'string' ? (
                                                    <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[180px]">
                                                        {apiRoutePurpose(log.metadata.path)}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </td>
                                        <td className="px-3 sm:px-5 py-3 sm:py-4 font-mono text-xs text-muted-foreground hidden md:table-cell">
                                            {log.ip ? (
                                                <button
                                                    type="button"
                                                    onClick={() => applySearchTerm(log.ip)}
                                                    className="hover:text-primary transition-colors"
                                                    title={`Filter by IP: ${log.ip}`}
                                                >
                                                    {log.ip}
                                                </button>
                                            ) : '—'}
                                        </td>
                                        <td className="px-2 sm:px-3 py-3 sm:py-4 text-right">
                                            {hasExtra && (
                                                <button
                                                    type="button"
                                                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                                                    title="Show event metadata — extra context captured with this event (app, device, reason, etc.)"
                                                    className={`inline-flex items-center justify-center w-6 h-6 rounded-md border transition-colors ${
                                                        isExpanded
                                                            ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                                                            : 'bg-muted/30 border-muted-foreground/20 text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                                                    }`}
                                                >
                                                    <Braces className="w-3 h-3" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                        <tr className={i !== logs.length - 1 ? 'border-b' : ''}>
                                            <td colSpan={6} className="px-3 sm:px-5 pb-3 pt-0">
                                                <pre className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-[11px] font-mono text-slate-700 overflow-x-auto whitespace-pre-wrap break-all">
                                                    {JSON.stringify(log.metadata, null, 2)}
                                                </pre>
                                            </td>
                                        </tr>
                                    )}
                                    </React.Fragment>
                                    )
                                })}
                            </tbody>
                        </table>
                        <PaginationControls
                            page={page}
                            totalItems={totalLogs}
                            pageSize={pageSize}
                            label="events"
                            onPageChange={setPage}
                            onPageSizeChange={handlePageSizeChange}
                        />
                    </div>
                )}
            </SectionCard>
        </div>
    )
}
