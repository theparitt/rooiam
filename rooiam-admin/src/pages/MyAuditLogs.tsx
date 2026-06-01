import React, { useEffect, useState, useMemo } from 'react'
import { Loader2, Database, Search, Braces, RefreshCw } from 'lucide-react'
import { authApi } from '@/lib/api'
import { actionStyle } from '@/lib/audit-style'
import { actionLabel, auditActionContext, apiRouteArea, apiRoutePurpose } from '@/lib/audit-events'
import PaginationControls from '@/components/ui/PaginationControls'
import PageHeader from '@/components/ui/PageHeader'
import SectionCard from '@/components/ui/SectionCard'
import DateRangeFilter from '@/components/ui/DateRangeFilter'

const DEFAULT_PAGE_SIZE = 25

type MyAuditLog = {
    id: number
    action: string
    target_type: string
    target_id: string | null
    ip: string | null
    user_agent: string | null
    metadata: Record<string, unknown>
    created_at: string
}


function hasMetadata(meta: Record<string, unknown>): boolean {
    return meta != null && typeof meta === 'object' && Object.keys(meta).length > 0
}

export default function MyAuditLogs() {
    const [logs, setLogs] = useState<MyAuditLog[]>([])
    const [pageSize] = useState(1000) // fetch all, filter client-side
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [search, setSearch] = useState('')
    const [actionFilter, setActionFilter] = useState<string>('all')
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [displayPage, setDisplayPage] = useState(1)
    const [expandedId, setExpandedId] = useState<number | null>(null)
    const [refreshKey, setRefreshKey] = useState(0)
    const DISPLAY_PAGE_SIZE = DEFAULT_PAGE_SIZE

    useEffect(() => {
        setLoading(true)
        setError('')
        authApi.myAuditLogs(1, pageSize)
            .then(data => {
                setLogs((data.items ?? []) as MyAuditLog[])
            })
            .catch(err => setError(err instanceof Error ? err.message : 'Could not load activity logs.'))
            .finally(() => setLoading(false))
    }, [pageSize, refreshKey])

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        const from = dateFrom ? new Date(dateFrom).getTime() : null
        const to = dateTo ? new Date(dateTo + 'T23:59:59').getTime() : null
        return logs.filter(log => {
            const matchesSearch = !q || [log.action, log.target_type, log.target_id || '', log.ip || ''].join(' ').toLowerCase().includes(q)
            const matchesAction = actionFilter === 'all' || log.action.includes(actionFilter)
            const t = new Date(log.created_at).getTime()
            const matchesDate = (!from || t >= from) && (!to || t <= to)
            return matchesSearch && matchesAction && matchesDate
        })
    }, [logs, search, actionFilter, dateFrom, dateTo])

    const paged = useMemo(() => {
        const start = (displayPage - 1) * DISPLAY_PAGE_SIZE
        return filtered.slice(start, start + DISPLAY_PAGE_SIZE)
    }, [filtered, displayPage, DISPLAY_PAGE_SIZE])

    const handleSearch = (value: string) => { setSearch(value); setDisplayPage(1) }
    const handleFilter = (value: string) => { setActionFilter(value); setDisplayPage(1) }
    const handleDateFrom = (v: string) => { setDateFrom(v); setDisplayPage(1) }
    const handleDateTo = (v: string) => { setDateTo(v); setDisplayPage(1) }

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PageHeader
                title="My Audit Logs"
                description="Your personal account activity only — sign-ins, MFA changes, linked accounts, passkeys, and session events. Excludes tenant, workspace, and platform-wide history."
            />

            <SectionCard
                icon={Database}
                title="My Event Stream"
                subtitle="All actions performed by you or on your account, most recent first."
                tone="indigo"
                bodyClassName=""
            >
                {/* Filter bar */}
                <div className="flex flex-col gap-3 border-b bg-white/80 px-4 py-3 sm:flex-row sm:px-5">
                    <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search action, target, or IP…"
                            value={search}
                            onChange={e => handleSearch(e.target.value)}
                            className="w-full pl-11 pr-4 py-2.5 bg-card border-2 border-border rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary transition-all"
                        />
                    </div>
                    <select
                        value={actionFilter}
                        onChange={e => handleFilter(e.target.value)}
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
                            <option value="identity.">Identity / profile</option>
                            <option value="user.">User account</option>
                        </optgroup>
                    </select>
                    <DateRangeFilter
                        dateFrom={dateFrom}
                        dateTo={dateTo}
                        onDateFromChange={handleDateFrom}
                        onDateToChange={handleDateTo}
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
                ) : filtered.length === 0 ? (
                    <div className="text-center py-16 text-muted-foreground">
                        <p className="text-5xl mb-3">🔍</p>
                        <p className="font-bold text-lg">{logs.length === 0 ? 'No activity recorded yet' : 'No events match your filter'}</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm min-w-[640px]">
                            <thead>
                                <tr className="border-b bg-white/70 font-semibold text-muted-foreground">
                                    <th className="px-3 sm:px-5 py-3 sm:py-4">Timestamp</th>
                                    <th className="px-3 sm:px-5 py-3 sm:py-4">Action</th>
                                    <th className="px-3 sm:px-5 py-3 sm:py-4 hidden sm:table-cell">Target</th>
                                    <th className="px-3 sm:px-5 py-3 sm:py-4 hidden md:table-cell">IP Address</th>
                                    <th className="px-3 sm:px-5 py-3 sm:py-4 w-8"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {paged.map((log, i) => {
                                    const { className, icon } = actionStyle(log.action)
                                    const showMeta = hasMetadata(log.metadata)
                                    const isExpanded = expandedId === log.id
                                    const isLast = i === paged.length - 1 && !isExpanded
                                    return (
                                        <React.Fragment key={log.id}>
                                            <tr className={`hover:bg-muted/20 transition-colors ${!isLast ? 'border-b' : ''}`}>
                                                <td className="px-3 sm:px-5 py-3 sm:py-4 whitespace-nowrap text-xs text-muted-foreground">
                                                    {new Date(log.created_at).toLocaleString()}
                                                </td>
                                                <td className="px-3 sm:px-5 py-3 sm:py-4">
                                                    <div className="space-y-1">
                                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${className}`}>
                                                            {icon}
                                                            {actionLabel(log.action)}
                                                        </span>
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
                                                        <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[150px]" title={(log.target_type === 'tenant_api_key'
                                                            ? (typeof log.metadata?.path === 'string' ? log.metadata.path : '')
                                                            : (log.target_id || ''))}>
                                                            {log.target_type === 'tenant_api_key'
                                                                ? (typeof log.metadata?.path === 'string' ? log.metadata.path : '—')
                                                                : log.target_id}
                                                        </span>
                                                        {log.target_type === 'tenant_api_key' && typeof log.metadata?.path === 'string' ? (
                                                            <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[180px]">
                                                                {apiRoutePurpose(log.metadata.path)}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                </td>
                                                <td className="px-3 sm:px-5 py-3 sm:py-4 font-mono text-xs text-muted-foreground hidden md:table-cell">
                                                    {log.ip || '-'}
                                                </td>
                                                <td className="px-2 sm:px-3 py-3 sm:py-4 text-right">
                                                    {showMeta && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setExpandedId(isExpanded ? null : log.id)}
                                                            title="Show metadata"
                                                            className={`inline-flex items-center justify-center w-6 h-6 rounded-md border text-[10px] font-black transition-colors ${
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
                                                <tr key={`${log.id}-meta`} className={i !== paged.length - 1 ? 'border-b' : ''}>
                                                    <td colSpan={5} className="px-3 sm:px-5 pb-3 pt-0">
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
                            page={displayPage}
                            totalItems={filtered.length}
                            pageSize={DISPLAY_PAGE_SIZE}
                            label="events"
                            onPageChange={setDisplayPage}
                            onPageSizeChange={() => {}}
                        />
                    </div>
                )}
            </SectionCard>
        </div>
    )
}
