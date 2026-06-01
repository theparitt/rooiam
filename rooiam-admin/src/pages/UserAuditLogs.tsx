import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Loader2, Database, ArrowLeft, RefreshCw } from 'lucide-react'
import { actionStyle } from '@/lib/audit-style'
import { actionLabel, auditActionContext, apiRouteArea, apiRoutePurpose } from '@/lib/audit-events'
import HelpTooltip from '@/components/ui/HelpTooltip'
import DateRangeFilter from '@/components/ui/DateRangeFilter'
import { sysAdminApi } from '@/lib/api'
import type { AdminAuditLog, AdminUserDetail } from '@/lib/api'
import PaginationControls from '@/components/ui/PaginationControls'
import PageHeader from '@/components/ui/PageHeader'
import SectionCard from '@/components/ui/SectionCard'
import { adminRoutes } from '@/lib/routes'

const DEFAULT_PAGE_SIZE = 50

export default function UserAuditLogs() {
    const { userId } = useParams<{ userId: string }>()
    const navigate = useNavigate()

    const [user, setUser] = useState<AdminUserDetail | null>(null)
    const [logs, setLogs] = useState<AdminAuditLog[]>([])
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
    const [search, setSearch] = useState('')
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [refreshKey, setRefreshKey] = useState(0)

    const handlePageSizeChange = (n: number) => { setPageSize(n); setPage(1) }
    const applySearchTerm = (term: string | null | undefined) => {
        const next = term?.trim()
        if (!next) return
        setSearch(next)
        setPage(1)
    }

    useEffect(() => {
        if (!userId) return
        sysAdminApi.userDetail(userId)
            .then(setUser)
            .catch(() => setUser(null))
    }, [userId])

    useEffect(() => {
        if (!userId) return
        setLoading(true)
        setError('')
        sysAdminApi.userAuditLogs(userId, { page, page_size: pageSize, search: search || undefined, date_from: dateFrom || undefined, date_to: dateTo || undefined })
            .then(result => {
                setLogs(result.items)
                setTotal(result.total)
            })
            .catch(err => setError(err instanceof Error ? err.message : 'Could not load audit logs.'))
            .finally(() => setLoading(false))
    }, [userId, page, pageSize, search, dateFrom, dateTo, refreshKey])

    const displayName = user?.user.display_name || user?.user.email || userId || 'User'
    const email = user?.user.email

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={() => navigate(-1)}
                    className="inline-flex items-center gap-1.5 text-xs font-black px-3 py-2 rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors text-muted-foreground"
                >
                    <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
            </div>

            <PageHeader
                title={<>{`Audit Logs — ${displayName}`} <HelpTooltip text="Everything this user personally did across all workspaces — logins, logouts, app registrations, member invites, branding changes, and more." /></>}
                description={email ? `All recorded activity for ${email}` : `All recorded activity for user ${userId}`}
            />

            <SectionCard
                icon={Database}
                title="Activity"
                subtitle="All audit events where this user was the actor, most recent first."
                tone="indigo"
                action={
                    user ? (
                        <button
                            type="button"
                            onClick={() => navigate(adminRoutes.adminMember(userId!))}
                            className="text-xs font-black px-3 py-1.5 rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors text-muted-foreground"
                        >
                            View Member
                        </button>
                    ) : undefined
                }
                bodyClassName=""
            >
                {/* Filter bar */}
                <div className="flex flex-col gap-3 border-b bg-white/80 px-4 py-3 sm:flex-row sm:px-5">
                    <div className="relative flex-1">
                        <input
                            type="text"
                            placeholder="Search action, target, or IP…"
                            value={search}
                            onChange={e => { setSearch(e.target.value); setPage(1) }}
                            className="w-full pl-4 pr-4 py-2.5 bg-card border-2 border-border rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary transition-all"
                        />
                    </div>
                    <DateRangeFilter
                        dateFrom={dateFrom}
                        dateTo={dateTo}
                        onDateFromChange={v => { setDateFrom(v); setPage(1) }}
                        onDateToChange={v => { setDateTo(v); setPage(1) }}
                    />
                    <button
                        type="button"
                        onClick={() => setRefreshKey(value => value + 1)}
                        disabled={loading}
                        title="Refresh audit logs"
                        className="inline-flex items-center justify-center px-3 py-2.5 bg-card border-2 border-border rounded-2xl text-sm font-bold hover:bg-muted/40 transition-colors disabled:opacity-50 shrink-0"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
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
                        <p className="font-bold text-lg">No audit events found for this user</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm min-w-[640px]">
                            <thead>
                                <tr className="border-b bg-muted/5 font-semibold text-muted-foreground">
                                    <th className="px-3 sm:px-5 py-3 sm:py-4">Timestamp</th>
                                    <th className="px-3 sm:px-5 py-3 sm:py-4">Action</th>
                                    <th className="px-3 sm:px-5 py-3 sm:py-4 hidden sm:table-cell">Target</th>
                                    <th className="px-3 sm:px-5 py-3 sm:py-4 hidden md:table-cell">IP Address</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((log, i) => (
                                    <tr key={log.id} className={`hover:bg-muted/20 transition-colors ${i !== logs.length - 1 ? 'border-b' : ''}`}>
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
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <PaginationControls
                            page={page}
                            totalItems={total}
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
