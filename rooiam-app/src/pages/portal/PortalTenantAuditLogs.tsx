import React from 'react'
import { useSearchParams } from 'react-router-dom'
import { Activity, Download, Loader2, RefreshCw } from 'lucide-react'
import PortalHelpTooltip from '../../components/portal/PortalHelpTooltip'
import PortalAuditEventTableRow from '../../components/portal/PortalAuditEventTableRow'
import PortalPageHeader from '../../components/portal/PortalPageHeader'
import PortalPaginationControls from '../../components/portal/PortalPaginationControls'
import PortalSectionCard from '../../components/portal/PortalSectionCard'
import { OrganizationActivityItem } from '../../lib/portal-types'
import { apiFetch, getApiBase } from '../../lib/api-base'
import PortalDateRangeFilter from '../../components/portal/PortalDateRangeFilter'

const DEFAULT_PAGE_SIZE = 20

export default function PortalTenantAuditLogs() {
    const API = getApiBase()
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
    const [loading, setLoading] = React.useState(true)
    const [items, setItems] = React.useState<OrganizationActivityItem[]>([])
    const [total, setTotal] = React.useState(0)
    const [error, setError] = React.useState('')
    const [refreshKey, setRefreshKey] = React.useState(0)

    const [exporting, setExporting] = React.useState(false)

    const handleExport = (format: 'csv' | 'json') => {
        setExporting(true)
        // The server clamps page_size to 100 on /orgs/tenant/activity, so a single
        // "page_size=10000" export only returns the first 100 rows. There is no
        // tenant activity export endpoint, so gather every page (up to a safety cap).
        const SERVER_MAX_PAGE_SIZE = 100
        const MAX_PAGES = 200 // safety bound: up to 20,000 rows
        const filterQuery = `${search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ''}${actionFilter !== 'all' ? `&action=${actionFilter}` : ''}${dateFrom ? `&date_from=${dateFrom}` : ''}${dateTo ? `&date_to=${dateTo}` : ''}`

        const fetchPage = async (p: number): Promise<{ items: OrganizationActivityItem[]; total: number }> => {
            const res = await apiFetch(`${API}/orgs/tenant/activity?page=${p}&page_size=${SERVER_MAX_PAGE_SIZE}${filterQuery}`)
            const data = await res.json().catch(() => ({ items: [], total: 0 }))
            return { items: Array.isArray(data.items) ? data.items : [], total: typeof data.total === 'number' ? data.total : 0 }
        }

        const gatherAllRows = async (): Promise<OrganizationActivityItem[]> => {
            const first = await fetchPage(1)
            const rows = [...first.items]
            const totalPages = Math.min(Math.ceil(first.total / SERVER_MAX_PAGE_SIZE), MAX_PAGES)
            for (let p = 2; p <= totalPages; p++) {
                const next = await fetchPage(p)
                rows.push(...next.items)
            }
            return rows
        }

        gatherAllRows()
            .then(rows => {
                if (format === 'json') {
                    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
                    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'tenant-activity.json'; a.click(); URL.revokeObjectURL(a.href)
                } else {
                    const header = 'timestamp,action,actor_email,target_type,target_id,ip\n'
                    const csv = rows.map(r => [r.created_at, r.action, r.actor_email ?? '', r.target_type, r.target_id ?? '', r.ip ?? ''].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
                    const blob = new Blob([header + csv], { type: 'text/csv' })
                    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'tenant-activity.csv'; a.click(); URL.revokeObjectURL(a.href)
                }
            })
            .finally(() => setExporting(false))
    }

    const handlePageSizeChange = (n: number) => { setPageSize(n); setPage(1) }
    const applySearchTerm = (term: string | null | undefined) => {
        const next = term?.trim()
        if (!next) return
        setSearch(next)
        setPage(1)
    }

    React.useEffect(() => {
        const next = new URLSearchParams()
        if (search.trim()) next.set('search', search.trim())
        if (actionFilter !== 'all') next.set('action', actionFilter)
        if (page > 1) next.set('page', String(page))
        setSearchParams(next, { replace: true })
    }, [actionFilter, page, search, setSearchParams])

    React.useEffect(() => {
        const controller = new AbortController()
        setLoading(true)
        setError('')
        const params = new URLSearchParams({
            page: String(page),
            page_size: String(pageSize),
        })
        if (search.trim()) params.set('search', search.trim())
        if (actionFilter !== 'all') params.set('action', actionFilter)
        if (dateFrom) params.set('date_from', dateFrom)
        if (dateTo) params.set('date_to', dateTo)
        apiFetch(`${API}/orgs/tenant/activity?${params}`, { signal: controller.signal })
            .then(res => {
                if (!res.ok) throw new Error(`Server error ${res.status}`)
                return res.json()
            })
            .then(data => {
                setItems(Array.isArray(data.items) ? data.items : [])
                setTotal(typeof data.total === 'number' ? data.total : 0)
            })
            .catch(err => {
                if (err.name !== 'AbortError') setError(`Could not load activity: ${err.message}`)
            })
            .finally(() => setLoading(false))
        return () => controller.abort()
    }, [API, page, pageSize, search, actionFilter, dateFrom, dateTo, refreshKey])

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PortalPageHeader
                title={<>Tenant Audit Logs <PortalHelpTooltip text="All events across all your workspaces — app registrations, member changes, branding updates, logins, and more. Shows activity from every workspace you own or admin." /></>}
                description="Tenant-wide operator and cross-workspace events across all your workspaces. Excludes platform-only history and single-workspace-only detail streams."
            />

            <PortalSectionCard
                icon={Activity}
                title="Event Stream"
                subtitle="Workspace owner and workspace admin activity, cross-workspace actions, and tenant-scoped security events. Use Workspace Audit Logs for one workspace only."
                action={<span className="cute-badge border border-indigo-200 bg-indigo-100 font-bold text-indigo-700">All Workspaces</span>}
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
                            <option value="identity.">Identity / profile</option>
                            <option value="user.">User account</option>
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
                ) : items.length === 0 ? (
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
                                {items.map((item, index) => (
                                    <PortalAuditEventTableRow
                                        key={item.id}
                                        item={item}
                                        showBorder={index !== items.length - 1}
                                        onFilterClick={applySearchTerm}
                                    />
                                ))}
                            </tbody>
                        </table>
                        <PortalPaginationControls
                            page={page}
                            totalItems={total}
                            pageSize={pageSize}
                            label="events"
                            onPageChange={setPage}
                            onPageSizeChange={handlePageSizeChange}
                        />
                    </div>
                )}
            </PortalSectionCard>
        </div>
    )
}
