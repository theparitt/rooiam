import React from 'react'
import { useSearchParams } from 'react-router-dom'
import { Activity, Download, Loader2, RefreshCw } from 'lucide-react'
import PortalHelpTooltip from '../../components/portal/PortalHelpTooltip'
import PortalAuditEventTableRow from '../../components/portal/PortalAuditEventTableRow'
import PortalPageHeader from '../../components/portal/PortalPageHeader'
import PortalPaginationControls from '../../components/portal/PortalPaginationControls'
import { actionLabel, activityContextSummary } from '../../lib/audit-events'
import PortalSectionCard from '../../components/portal/PortalSectionCard'
import { Organization, OrganizationActivityItem } from '../../lib/portal-types'
import { apiFetch, getApiBase } from '../../lib/api-base'
import PortalDateRangeFilter from '../../components/portal/PortalDateRangeFilter'

type Props = {
    currentOrg: Organization | null
    canViewActivity: boolean
    activity: OrganizationActivityItem[]
    loading?: boolean
    onRefresh?: () => void
}

const DEFAULT_PAGE_SIZE = 20

export default function PortalWorkspaceAuditLogs({ currentOrg, canViewActivity, activity, loading = false, onRefresh }: Props) {
    const [searchParams, setSearchParams] = useSearchParams()
    const [search, setSearch] = React.useState(() => searchParams.get('search') || '')
    const [actionFilter, setActionFilter] = React.useState<string>(() => searchParams.get('action') || 'all')
    const [page, setPage] = React.useState(() => {
        const value = Number(searchParams.get('page') || '1')
        return Number.isFinite(value) && value > 0 ? value : 1
    })
    const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE)
    const [dateFrom, setDateFrom] = React.useState('')
    const [dateTo, setDateTo] = React.useState('')
    const [exporting, setExporting] = React.useState(false)
    const [exportError, setExportError] = React.useState('')

    const handlePageSizeChange = (n: number) => { setPageSize(n); setPage(1) }
    const applySearchTerm = (term: string | null | undefined) => {
        const next = term?.trim()
        if (!next) return
        setSearch(next)
        setPage(1)
    }

    const handleExport = async (format: 'csv' | 'json') => {
        setExporting(true)
        setExportError('')
        try {
            const params = new URLSearchParams({ format })
            if (search.trim()) params.set('search', search.trim())
            if (actionFilter !== 'all') params.set('action', actionFilter)
            const url = `${getApiBase()}/orgs/workspace/activity/export?${params}`
            const res = await apiFetch(url)
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                setExportError(data?.error?.message || `Export failed (${res.status}).`)
                return
            }
            const blob = await res.blob()
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = `activity.${format}`
            a.click()
            URL.revokeObjectURL(a.href)
        } catch {
            setExportError('Could not reach the server. Check your connection.')
        } finally {
            setExporting(false)
        }
    }

    const filteredActivity = React.useMemo(() => {
        const query = search.trim().toLowerCase()
        const from = dateFrom ? new Date(dateFrom).getTime() : null
        const to = dateTo ? new Date(dateTo + 'T23:59:59').getTime() : null
        return activity.filter(item => {
            const actor = item.actor_display_name || item.actor_email || 'System'
            const haystack = [actionLabel(item.action), actor, item.ip || '', activityContextSummary(item), item.action].join(' ').toLowerCase()
            const matchesSearch = !query || haystack.includes(query)
            const matchesAction = actionFilter === 'all' || item.action.includes(actionFilter)
            const t = new Date(item.created_at).getTime()
            const matchesDate = (!from || t >= from) && (!to || t <= to)
            return matchesSearch && matchesAction && matchesDate
        })
    }, [actionFilter, activity, search, dateFrom, dateTo])

    React.useEffect(() => {
        const next = new URLSearchParams()
        if (search.trim()) next.set('search', search.trim())
        if (actionFilter !== 'all') next.set('action', actionFilter)
        if (page > 1) next.set('page', String(page))
        setSearchParams(next, { replace: true })
    }, [actionFilter, page, search, setSearchParams])

    const pagedActivity = React.useMemo(() => {
        const start = (page - 1) * pageSize
        return filteredActivity.slice(start, start + pageSize)
    }, [filteredActivity, page, pageSize])

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PortalPageHeader
                title={<>Workspace Audit Logs <PortalHelpTooltip text="All events that occurred in this specific workspace — by any actor (owner, admin, or member). Other workspaces are not included." /></>}
                description={currentOrg ? `Events scoped to ${currentOrg.name} only. Excludes tenant-wide operator sign-ins and cross-workspace operator activity.` : 'Workspace-scoped security and access events only.'}
            />

            {!currentOrg ? (
                <div className="rounded-3xl border border-violet-100 bg-violet-50 p-4">
                    <p className="font-bold text-violet-900">No workspace selected</p>
                    <p className="mt-1 text-sm font-medium text-violet-800">Select a workspace first.</p>
                </div>
            ) : !canViewActivity ? (
                <div className="rounded-3xl border border-violet-100 bg-violet-50 p-4">
                    <p className="font-bold text-violet-900">Read-only access</p>
                    <p className="mt-1 text-sm font-medium text-violet-800">You do not have permission to view activity.</p>
                </div>
            ) : (
                <PortalSectionCard
                    icon={Activity}
                    title="Event Stream"
                    subtitle="Workspace members, workspace settings, app events, and workspace-scoped auth events only. Use Tenant Audit Logs for workspace owner and workspace admin operator history."
                    action={<span className="cute-badge border border-indigo-200 bg-indigo-100 font-bold text-indigo-700">Workspace View</span>}
                    bodyClassName=""
                >
                    <div className="flex flex-col gap-3 border-b bg-white/80 px-4 py-3 sm:flex-row sm:px-5">
                        <div className="relative flex-1">
                            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                            <input
                                type="text"
                                placeholder="Search action, target, actor, or IP…"
                                value={search}
                                onChange={e => { setSearch(e.target.value); setPage(1) }}
                                className="w-full pl-11 pr-4 py-2.5 bg-card border-2 border-border rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary transition-all"
                            />
                        </div>
                        <select
                            value={actionFilter}
                            onChange={e => { setActionFilter(e.target.value); setPage(1) }}
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
                        <PortalDateRangeFilter
                            dateFrom={dateFrom}
                            dateTo={dateTo}
                            onDateFromChange={v => { setDateFrom(v); setPage(1) }}
                            onDateToChange={v => { setDateTo(v); setPage(1) }}
                        />
                        <div className="flex gap-2 shrink-0">
                            <button
                                type="button"
                                onClick={onRefresh}
                                disabled={loading || !onRefresh}
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
                    {exportError && (
                        <p className="mx-4 mt-3 text-xs font-bold text-rose-700 border border-rose-200 bg-rose-50 rounded-2xl px-4 py-2.5">{exportError}</p>
                    )}
                    {loading ? (
                        <div className="flex items-center justify-center py-16 text-muted-foreground">
                            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading audit events…
                        </div>
                    ) : filteredActivity.length === 0 ? (
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
                                    {pagedActivity.map((item, index) => (
                                        <PortalAuditEventTableRow
                                            key={item.id}
                                            item={item}
                                            showBorder={index !== pagedActivity.length - 1}
                                            onFilterClick={applySearchTerm}
                                        />
                                    ))}
                                </tbody>
                            </table>
                            <PortalPaginationControls
                                page={page}
                                totalItems={filteredActivity.length}
                                pageSize={pageSize}
                                label="events"
                                onPageChange={setPage}
                                onPageSizeChange={handlePageSizeChange}
                            />
                        </div>
                    )}
                </PortalSectionCard>
            )}
        </div>
    )
}
