import React, { useEffect, useMemo, useState } from 'react'
import { ShieldAlert, Loader2, CheckCircle2 } from 'lucide-react'
import PortalPageHeader from '../../components/portal/PortalPageHeader'
import PortalSectionCard from '../../components/portal/PortalSectionCard'
import PortalPaginationControls from '../../components/portal/PortalPaginationControls'
import { tenantAuthApi } from '../../lib/auth-api'
import { actionLabel, actionStatusTone } from '../../lib/audit-events'
import { TONE_STYLES } from '../../lib/security-alerts'
import type { TenantAuditLog } from '../../lib/auth-api'

// First-person phrasing intentional — this is the user's own account view
function alertReason(action: string, metadata: Record<string, unknown> | null): string {
    const metaReason = typeof metadata?.reason === 'string' ? metadata.reason : null
    if (action === 'auth.login.suspicious') {
        if (metaReason === 'new_ip') return `Sign-in from an IP address not seen in your login history.`
        if (metaReason === 'rapid_ip_change') return `IP address changed within a short time window — from ${metadata?.previous_ip ?? 'unknown'} to ${metadata?.current_ip ?? 'unknown'}.`
        if (metaReason === 'new_user_agent') return `Sign-in from an unrecognized browser or device.`
        if (metaReason === 'new_device_class') return `Device type changed from your previous sessions.`
        if (metaReason === 'repeated_blocked_embed_origin_probe') return `Repeated login attempts from a blocked embed origin.`
        if (metaReason === 'repeated_failed_magic_link_verification') return `Repeated magic link failures from your IP.`
        return `Risk engine flagged this sign-in.`
    }
    if (action === 'auth.session.binding_mismatch') return `Your session cookie did not match the request context — possible replay or hijack attempt.`
    if (action === 'auth.ip_policy.blocked') return `Your IP address is on the workspace blocklist.`
    if (action === 'auth.widget.embed_origin_blocked') return `Login widget request from an origin not in the allowed embed list.`
    if (action === 'auth.mfa.challenge.failed') return `Wrong MFA code.`
    if (action === 'auth.mfa.enrollment.failed') return `MFA setup code rejected.`
    if (action.includes('mfa.challenge')) return `MFA challenge issued — if you did not initiate this sign-in, your password may be compromised.`
    if (action.includes('mfa.required')) return `MFA was required to continue.`
    if (action === 'auth.passkey.login.failed') return `Passkey assertion rejected by the server.`
    if (action === 'oauth.login.failed') return `OAuth provider rejected the login request.`
    if (action === 'auth.login.failed') return `Wrong password.`
    return ''
}

const SECURITY_ACTIONS = ['failed', 'suspicious', 'blocked', 'mismatch', 'denied']

const DEFAULT_PAGE_SIZE = 20
const PAGE_SIZE_OPTIONS = [20, 50, 100, 200]

export default function PortalMySecurityAlerts() {
    const [logs, setLogs] = useState<TenantAuditLog[]>([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
    const [severityFilter, setSeverityFilter] = useState<'all' | 'high' | 'medium'>('all')
    const [search, setSearch] = useState('')

    const applyFilter = (term: string) => { setSearch(term); setPage(1) }

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError('')

        // The server caps page_size at 100, and this view filters/paginates
        // client-side, so gather every page (up to a safety cap) rather than
        // asking for one oversized batch (which the server rejects with 400).
        const SERVER_MAX_PAGE_SIZE = 100
        const MAX_PAGES = 50 // safety bound: up to 5,000 events

        const loadAllAuditLogs = async () => {
            try {
                const first = await tenantAuthApi.auditLogs(1, SERVER_MAX_PAGE_SIZE)
                const all = [...(first.items ?? [])]
                const totalCount = first.total ?? all.length
                const totalPages = Math.min(Math.ceil(totalCount / SERVER_MAX_PAGE_SIZE), MAX_PAGES)

                for (let p = 2; p <= totalPages; p++) {
                    const next = await tenantAuthApi.auditLogs(p, SERVER_MAX_PAGE_SIZE)
                    all.push(...(next.items ?? []))
                }

                if (!cancelled) {
                    setLogs(all)
                    setTotal(totalCount)
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Could not load security events.')
                }
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        void loadAllAuditLogs()
        return () => { cancelled = true }
    }, [])

    const securityLogs = useMemo(() =>
        logs.filter(log => SECURITY_ACTIONS.some(a => log.action.includes(a)))
    , [logs])

    type AlertEntry = {
        log: TenantAuditLog
        severity: 'high' | 'medium'
        reason: string
        tone: string
    }

    const alerts = useMemo<AlertEntry[]>(() =>
        securityLogs.map(log => ({
            log,
            severity: (
                log.action.includes('blocked') ||
                log.action.includes('denied') ||
                log.action.includes('mismatch') ||
                log.action.includes('suspicious')
                    ? 'high' : 'medium'
            ) as 'high' | 'medium',
            reason: alertReason(log.action, log.metadata as Record<string, unknown> | null),
            tone: actionStatusTone(log.action),
        }))
    , [securityLogs])

    const filteredAlerts = useMemo(() => {
        const q = search.trim().toLowerCase()
        return alerts
            .filter(a => severityFilter === 'all' || a.severity === severityFilter)
            .filter(a => !q || (a.log.ip ?? '').toLowerCase().includes(q) || a.log.action.toLowerCase().includes(q))
    }, [alerts, severityFilter, search])

    const pagedAlerts = filteredAlerts.slice((page - 1) * pageSize, page * pageSize)

    return (
        <div className="space-y-5 sm:space-y-6">
            <PortalPageHeader
                title="My Security Alerts"
                description={
                    loading
                        ? 'Loading your security events…'
                        : securityLogs.length > 0
                            ? `${securityLogs.length} security event${securityLogs.length !== 1 ? 's' : ''} on your account. Read-only — if you see activity you didn't initiate, revoke your sessions immediately.`
                            : 'No suspicious or failed activity on your account.'
                }
            />

            <PortalSectionCard
                icon={ShieldAlert}
                title="Security Events on My Account"
                subtitle="All security-relevant events where you are the actor. Read-only — contact your workspace admin to investigate blocked or suspicious activity."
                tone="amber"
                bodyClassName=""
            >
                {/* Summary + filters */}
                <div className="flex flex-wrap items-center gap-2 px-4 pt-4 pb-3 border-b">
                    <span className="text-xs font-semibold text-muted-foreground">
                        {securityLogs.length} security event{securityLogs.length !== 1 ? 's' : ''} · {total} total in account log
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

                {error && (
                    <div className="mx-4 my-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</div>
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-16 text-muted-foreground">
                        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading security events…
                    </div>
                ) : pagedAlerts.length === 0 ? (
                    <div className="px-6 py-12 text-center">
                        <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-3" />
                        <p className="font-black text-green-800">No security events found</p>
                        <p className="text-sm font-semibold text-green-600 mt-1">
                            {severityFilter !== 'all'
                                ? 'No events match this severity filter.'
                                : 'No suspicious or failed activity on your account.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm min-w-[600px]">
                            <thead>
                                <tr className="border-b bg-white/70 text-xs font-semibold text-muted-foreground">
                                    <th className="px-4 py-3">Severity</th>
                                    <th className="px-4 py-3">Event</th>
                                    <th className="px-4 py-3 hidden md:table-cell">IP Address</th>
                                    <th className="px-4 py-3 hidden sm:table-cell">Timestamp</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pagedAlerts.map(({ log, severity, reason, tone }, i) => {
                                    const toneStyle = TONE_STYLES[tone] ?? TONE_STYLES.info
                                    const isLast = i === pagedAlerts.length - 1
                                    return (
                                        <React.Fragment key={log.id}>
                                            <tr className={`hover:bg-muted/20 transition-colors ${!isLast ? 'border-b' : ''}`}>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${severity === 'high' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                                                        {severity === 'high' ? 'High' : 'Medium'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="space-y-1.5">
                                                        <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-bold ${toneStyle}`}>
                                                            {actionLabel(log.action)}
                                                        </span>
                                                        <p className="text-[11px] text-muted-foreground">
                                                            {reason}
                                                        </p>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 font-mono text-xs text-muted-foreground hidden md:table-cell whitespace-nowrap">
                                                    {log.ip ? (
                                                        <button type="button" onClick={() => applyFilter(log.ip!)}
                                                            className="hover:text-primary transition-colors"
                                                            title={`Filter by IP: ${log.ip}`}>
                                                            {log.ip}
                                                        </button>
                                                    ) : '—'}
                                                </td>
                                                <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell whitespace-nowrap">
                                                    {new Date(log.created_at).toLocaleString()}
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
                            label="events"
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
