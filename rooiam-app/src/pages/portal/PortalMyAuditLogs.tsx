import React, { useEffect, useState, useMemo } from 'react'
import { Database, ShieldCheck, ServerCrash, Zap, Loader2, LogIn, LogOut, Braces, RefreshCw } from 'lucide-react'
import PortalHelpTooltip from '../../components/portal/PortalHelpTooltip'
import { tenantAuthApi, type TenantAuditLog } from '../../lib/auth-api'
import PortalPageHeader from '../../components/portal/PortalPageHeader'
import PortalSectionCard from '../../components/portal/PortalSectionCard'
import PortalPaginationControls from '../../components/portal/PortalPaginationControls'
import PortalDateRangeFilter from '../../components/portal/PortalDateRangeFilter'

const PAGE_SIZE = 25

function actionStyle(action: string): { className: string; icon: React.ReactNode } {
    if (action.includes('login.success'))
        return { className: 'bg-teal-50 text-teal-700 border-teal-200', icon: <LogIn className="w-3.5 h-3.5" /> }
    if (action.includes('logout.success'))
        return { className: 'bg-slate-100 text-slate-500 border-slate-300', icon: <LogOut className="w-3.5 h-3.5" /> }
    if (action.includes('success'))
        return { className: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <ShieldCheck className="w-3.5 h-3.5" /> }
    if (action.includes('failed') || action.includes('error'))
        return { className: 'bg-rose-50 text-rose-700 border-rose-200', icon: <ServerCrash className="w-3.5 h-3.5" /> }
    return { className: 'bg-blue-50 text-blue-700 border-blue-200', icon: <Zap className="w-3.5 h-3.5" /> }
}

function hasMetadata(meta: Record<string, unknown>): boolean {
    return meta != null && typeof meta === 'object' && Object.keys(meta).length > 0
}

export default function PortalMyAuditLogs() {
    const [logs, setLogs] = useState<TenantAuditLog[]>([])
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(PAGE_SIZE)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [expandedId, setExpandedId] = useState<number | null>(null)
    const [search, setSearch] = useState('')
    const [actionFilter, setActionFilter] = useState<string>('all')
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [refreshKey, setRefreshKey] = useState(0)

    useEffect(() => {
        setLoading(true)
        setError('')
        tenantAuthApi.auditLogs(page, pageSize)
            .then(data => { setLogs(data.items ?? []); setTotal(data.total ?? 0) })
            .catch(err => setError(err instanceof Error ? err.message : 'Could not load activity logs.'))
            .finally(() => setLoading(false))
    }, [page, pageSize, refreshKey])

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        const from = dateFrom ? new Date(dateFrom).getTime() : null
        const to = dateTo ? new Date(dateTo + 'T23:59:59').getTime() : null
        return logs.filter(log => {
            const matchesSearch = !q || [log.action, log.target_type, log.target_id ?? '', log.ip ?? '', log.actor_email ?? ''].join(' ').toLowerCase().includes(q)
            const matchesAction = actionFilter === 'all' || log.action.includes(actionFilter)
            const t = new Date(log.created_at).getTime()
            const matchesDate = (!from || t >= from) && (!to || t <= to)
            return matchesSearch && matchesAction && matchesDate
        })
    }, [logs, search, actionFilter, dateFrom, dateTo])

    const COL_COUNT = 6

    return (
        <div className="space-y-5 sm:space-y-6">
            <PortalPageHeader
                title={<>My Audit Logs <PortalHelpTooltip text="Everything you personally did — logins, logouts, app registrations, member invites, branding changes, and more. Scoped to your account only." /></>}
                description="Your personal account activity only — sign-ins, MFA changes, linked accounts, passkeys, and session events. Excludes tenant and workspace history."
            />

            <PortalSectionCard
                icon={Database}
                title="My Event Stream"
                subtitle="All actions performed by you or on your account, most recent first."
                tone="indigo"
                bodyClassName=""
            >
                <div className="flex flex-col gap-3 border-b bg-white/80 px-4 py-3 sm:flex-row sm:px-5">
                    <div className="relative flex-1">
                        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                        <input
                            type="text"
                            placeholder="Search action, target, or IP…"
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
                        <table className="w-full text-left text-sm min-w-[560px]">
                            <thead>
                                <tr className="border-b bg-white/70 font-semibold text-muted-foreground">
                                    <th className="px-3 sm:px-5 py-3 sm:py-4">Timestamp</th>
                                    <th className="px-3 sm:px-5 py-3 sm:py-4">Action</th>
                                    <th className="px-3 sm:px-5 py-3 sm:py-4 hidden sm:table-cell">Actor</th>
                                    <th className="px-3 sm:px-5 py-3 sm:py-4 hidden sm:table-cell">Target</th>
                                    <th className="px-3 sm:px-5 py-3 sm:py-4 hidden md:table-cell">IP</th>
                                    <th className="px-3 sm:px-5 py-3 sm:py-4 w-8"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((log, i) => {
                                    const { className, icon } = actionStyle(log.action)
                                    const meta = log.metadata
                                    const showMeta = hasMetadata(meta)
                                    const isExpanded = expandedId === log.id
                                    const isLast = i === filtered.length - 1 && !isExpanded
                                    return (
                                        <React.Fragment key={log.id}>
                                            <tr className={`hover:bg-muted/20 transition-colors ${!isLast ? 'border-b' : ''}`}>
                                                <td className="px-3 sm:px-5 py-3 sm:py-4 whitespace-nowrap text-xs text-muted-foreground">
                                                    {new Date(log.created_at).toLocaleString()}
                                                </td>
                                                <td className="px-3 sm:px-5 py-3 sm:py-4">
                                                    <button
                                                        type="button"
                                                        onClick={() => { setSearch(log.action); setPage(1) }}
                                                        title={`Filter by action: ${log.action}`}
                                                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border hover:opacity-80 transition-opacity ${className}`}
                                                    >
                                                        {icon}
                                                        {log.action}
                                                    </button>
                                                </td>
                                                <td className="px-3 sm:px-5 py-3 sm:py-4 hidden sm:table-cell">
                                                    <div className="flex flex-col gap-0.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => { setSearch(log.actor_email || ''); setPage(1) }}
                                                            className="font-semibold text-xs text-foreground text-left hover:text-primary transition-colors"
                                                            title={log.actor_email ? `Filter by actor: ${log.actor_email}` : ''}
                                                            disabled={!log.actor_email}
                                                        >
                                                            {log.actor_email || '—'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => { setSearch(log.actor_user_id || ''); setPage(1) }}
                                                            className="font-mono text-[10px] text-muted-foreground truncate max-w-[160px] text-left hover:text-primary transition-colors disabled:cursor-default disabled:hover:text-muted-foreground"
                                                            title={log.actor_user_id ? `Filter by actor ID: ${log.actor_user_id}` : ''}
                                                            disabled={!log.actor_user_id}
                                                        >
                                                            {log.actor_user_id}
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className="px-3 sm:px-5 py-3 sm:py-4 hidden sm:table-cell">
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold text-xs">{log.target_type}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => { setSearch(log.target_id || ''); setPage(1) }}
                                                            className="font-mono text-[10px] text-muted-foreground truncate max-w-[140px] text-left hover:text-primary transition-colors disabled:cursor-default disabled:hover:text-muted-foreground"
                                                            title={log.target_id ? `Filter by target: ${log.target_id}` : ''}
                                                            disabled={!log.target_id}
                                                        >
                                                            {log.target_id}
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className="px-3 sm:px-5 py-3 sm:py-4 font-mono text-xs text-muted-foreground hidden md:table-cell">
                                                    {log.ip ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => { setSearch(log.ip || ''); setPage(1) }}
                                                            className="hover:text-primary transition-colors"
                                                            title={`Filter by IP: ${log.ip}`}
                                                        >
                                                            {log.ip}
                                                        </button>
                                                    ) : '—'}
                                                </td>
                                                <td className="px-2 sm:px-3 py-3 sm:py-4 text-right">
                                                    {showMeta && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setExpandedId(isExpanded ? null : log.id)}
                                                            title="Show metadata"
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
                                                <tr className={i !== filtered.length - 1 ? 'border-b' : ''}>
                                                    <td colSpan={COL_COUNT} className="px-3 sm:px-5 pb-3 pt-0">
                                                        <pre className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-[11px] font-mono text-slate-700 overflow-x-auto whitespace-pre-wrap break-all">
                                                            {JSON.stringify(meta, null, 2)}
                                                        </pre>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    )
                                })}
                            </tbody>
                        </table>
                        <PortalPaginationControls
                            page={page}
                            totalItems={total}
                            pageSize={pageSize}
                            label="events"
                            onPageChange={setPage}
                            onPageSizeChange={n => { setPageSize(n); setPage(1) }}
                        />
                    </div>
                )}
            </PortalSectionCard>
        </div>
    )
}
