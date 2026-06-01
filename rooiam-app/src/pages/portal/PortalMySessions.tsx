import React, { useEffect, useState } from 'react'
import { Shield, Monitor, Globe, Clock, LogIn, Loader2 } from 'lucide-react'
import { tenantAuthApi, type TenantSession } from '../../lib/auth-api'
import PortalPageHeader from '../../components/portal/PortalPageHeader'
import PortalSectionCard from '../../components/portal/PortalSectionCard'
import PortalPaginationControls from '../../components/portal/PortalPaginationControls'

const SESSION_PAGE_SIZE = 6

function SessionCard({ session, onRevoke, revoking }: {
    session: TenantSession
    onRevoke?: (id: string) => void
    revoking?: boolean
}) {
    const context = [session.login_app_name, session.login_workspace_slug ? `Workspace ${session.login_workspace_slug}` : null].filter(Boolean).join(' · ')

    return (
        <div className={`rounded-2xl border-2 p-4 transition-colors ${session.is_current ? 'border-emerald-200 bg-emerald-50/40' : 'border-border bg-card hover:bg-muted/20'}`}>
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                    <Monitor className={`w-4 h-4 shrink-0 ${session.is_current ? 'text-emerald-600' : 'text-muted-foreground'}`} />
                    <span className="text-sm font-bold truncate text-foreground" title={session.user_agent || 'Unknown device'}>
                        {session.user_agent || 'Unknown device'}
                    </span>
                </div>
                {session.is_current ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-black text-emerald-700 shrink-0">Current</span>
                ) : (
                    <span className="inline-flex items-center rounded-full bg-muted border border-border px-2.5 py-0.5 text-[11px] font-black text-muted-foreground shrink-0">Active</span>
                )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs mb-3">
                <div className="flex items-center gap-1.5 min-w-0">
                    <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="font-mono text-muted-foreground truncate">{session.ip || '—'}</span>
                </div>
                <div className="flex items-center gap-1.5 min-w-0">
                    <LogIn className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="font-semibold text-muted-foreground truncate">{new Date(session.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-1.5 min-w-0">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="font-semibold text-muted-foreground truncate">{new Date(session.last_seen_at).toLocaleString()}</span>
                </div>
                {context && (
                    <div className="col-span-2 sm:col-span-3 flex items-center gap-1.5 min-w-0">
                        <Shield className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="font-semibold text-muted-foreground truncate">{context}</span>
                    </div>
                )}
            </div>

            {!session.is_current && onRevoke && (
                <div className="flex justify-end pt-1 border-t border-border">
                    <button
                        type="button"
                        onClick={() => onRevoke(session.id)}
                        disabled={revoking}
                        className="text-xs font-black px-3 py-1.5 rounded-xl bg-white border border-border text-rose-600 hover:bg-rose-50 hover:border-rose-200 disabled:opacity-50 transition-colors"
                    >
                        {revoking ? <Loader2 className="w-3.5 h-3.5 animate-spin inline" /> : 'Revoke'}
                    </button>
                </div>
            )}
        </div>
    )
}

export default function PortalMySessions() {
    const [sessions, setSessions] = useState<TenantSession[]>([])
    const [loading, setLoading] = useState(true)
    const [revoking, setRevoking] = useState(false)
    const [revokingId, setRevokingId] = useState<string | null>(null)
    const [error, setError] = useState('')
    const [status, setStatus] = useState('')
    const [otherPage, setOtherPage] = useState(1)

    const load = async () => {
        setLoading(true)
        try {
            setSessions(await tenantAuthApi.sessions())
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not load sessions.')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { void load() }, [])
    useEffect(() => { setOtherPage(1) }, [sessions.length])

    const revokeOne = async (id: string) => {
        setRevokingId(id); setError(''); setStatus('')
        try {
            const r = await tenantAuthApi.revokeSession(id)
            setStatus(r.message || 'Session revoked.')
            await load()
        } catch (err) { setError(err instanceof Error ? err.message : 'Could not revoke session.') }
        finally { setRevokingId(null) }
    }

    const revokeOthers = async () => {
        setRevoking(true); setError(''); setStatus('')
        try {
            const r = await tenantAuthApi.revokeOtherSessions()
            setStatus(r.revoked_count > 0 ? `Revoked ${r.revoked_count} other session${r.revoked_count === 1 ? '' : 's'}.` : 'No other sessions were active.')
            await load()
        } catch (err) { setError(err instanceof Error ? err.message : 'Could not revoke sessions.') }
        finally { setRevoking(false) }
    }

    const current = sessions.find(s => s.is_current)
    const others = sessions.filter(s => !s.is_current)
    const pagedOthers = others.slice((otherPage - 1) * SESSION_PAGE_SIZE, otherPage * SESSION_PAGE_SIZE)

    return (
        <div className="space-y-5 sm:space-y-6">
            <PortalPageHeader title="My Sessions" />

            {status && <p className="text-xs font-bold text-green-700 bg-green-50 border border-green-200 rounded-2xl px-4 py-3">{status}</p>}
            {error && <p className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">{error}</p>}

            <PortalSectionCard icon={Shield} title="Current Session" subtitle="This is the browser session you are using right now." tone="emerald">
                {loading ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm py-2 px-4 pb-4">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                    </div>
                ) : current ? (
                    <div className="p-4"><SessionCard session={current} /></div>
                ) : (
                    <p className="text-sm font-semibold text-muted-foreground px-4 pb-4">No current session found.</p>
                )}
            </PortalSectionCard>

            <PortalSectionCard
                icon={Monitor}
                title="Other Active Sessions"
                subtitle="Sign out old browsers and devices you no longer trust."
                tone="neutral"
                action={
                    <button
                        type="button"
                        onClick={revokeOthers}
                        disabled={revoking || loading || others.length === 0}
                        className="inline-flex items-center gap-2 text-xs font-black px-3 py-2 rounded-xl bg-white border border-border text-rose-600 hover:bg-rose-50 hover:border-rose-200 disabled:opacity-50 transition-colors"
                    >
                        {revoking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        {revoking ? 'Revoking…' : 'Revoke All Others'}
                    </button>
                }
            >
                <div className="p-4">
                    {loading ? (
                        <div className="flex items-center gap-2 text-muted-foreground text-sm">
                            <Loader2 className="w-4 h-4 animate-spin" /> Loading sessions…
                        </div>
                    ) : others.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <p className="text-3xl mb-2">✓</p>
                            <p className="font-semibold text-sm">No other active sessions</p>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-3">
                                {pagedOthers.map(s => (
                                    <SessionCard key={s.id} session={s} onRevoke={revokeOne} revoking={revokingId === s.id} />
                                ))}
                            </div>
                            <div className="mt-3">
                                <PortalPaginationControls
                                    page={otherPage}
                                    totalItems={others.length}
                                    pageSize={SESSION_PAGE_SIZE}
                                    label="sessions"
                                    onPageChange={setOtherPage}
                                />
                            </div>
                        </>
                    )}
                </div>
            </PortalSectionCard>
        </div>
    )
}
