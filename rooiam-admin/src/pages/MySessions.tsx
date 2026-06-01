import { useEffect, useState } from 'react'
import { Shield, Monitor, Globe, Clock, LogIn, Loader2 } from 'lucide-react'
import { authApi } from '@/lib/api'
import type { ApiSession } from '@/lib/api'
import PaginationControls from '@/components/ui/PaginationControls'
import PageHeader from '@/components/ui/PageHeader'
import SectionCard from '@/components/ui/SectionCard'

const SESSION_PAGE_SIZE = 6

function SessionCard({ session, onRevoke, revoking }: {
    session: ApiSession
    onRevoke?: (id: string) => void
    revoking?: boolean
}) {
    const context = [session.login_app_name, session.login_workspace_slug ? `Workspace ${session.login_workspace_slug}` : null].filter(Boolean).join(' · ')

    return (
        <div className={`rounded-2xl border-2 p-4 transition-colors ${session.is_current ? 'border-emerald-200 bg-emerald-50/40' : 'border-border bg-card hover:bg-muted/20'}`}>
            {/* Top row: device + badge */}
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                    <Monitor className={`w-4 h-4 shrink-0 ${session.is_current ? 'text-emerald-600' : 'text-muted-foreground'}`} />
                    <span className="text-sm font-bold truncate text-foreground" title={session.user_agent || 'Unknown device'}>
                        {session.user_agent || 'Unknown device'}
                    </span>
                </div>
                {session.is_current ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-black text-emerald-700 shrink-0">
                        Current
                    </span>
                ) : (
                    <span className="inline-flex items-center rounded-full bg-muted border border-border px-2.5 py-0.5 text-[11px] font-black text-muted-foreground shrink-0">
                        Active
                    </span>
                )}
            </div>

            {/* Info columns */}
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

            {/* Revoke button (other sessions only) */}
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

export default function MySessions() {
    const [sessions, setSessions] = useState<ApiSession[]>([])
    const [loading, setLoading] = useState(true)
    const [revoking, setRevoking] = useState(false)
    const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null)
    const [error, setError] = useState('')
    const [status, setStatus] = useState('')
    const [otherSessionsPage, setOtherSessionsPage] = useState(1)

    const load = async () => {
        setLoading(true)
        try {
            const mySessions = await authApi.sessions()
            setSessions(mySessions)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not load sessions.')
            setSessions([])
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { void load() }, [])
    useEffect(() => { setOtherSessionsPage(1) }, [sessions.length])

    const revokeSingleSession = async (sessionId: string) => {
        setRevokingSessionId(sessionId)
        setError('')
        setStatus('')
        try {
            const result = await authApi.revokeSession(sessionId)
            setStatus(result.message || 'Session revoked.')
            await load()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not revoke that session.')
        } finally {
            setRevokingSessionId(null)
        }
    }

    const revokeOtherSessions = async () => {
        setRevoking(true)
        setError('')
        setStatus('')
        try {
            const result = await authApi.revokeOtherSessions()
            setStatus(result.revoked_count > 0
                ? `Revoked ${result.revoked_count} other session${result.revoked_count === 1 ? '' : 's'}.`
                : 'No other sessions were active.')
            await load()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not revoke other sessions.')
        } finally {
            setRevoking(false)
        }
    }

    const currentSession = sessions.find(s => s.is_current)
    const otherSessions = sessions.filter(s => !s.is_current)
    const pagedOtherSessions = otherSessions.slice((otherSessionsPage - 1) * SESSION_PAGE_SIZE, otherSessionsPage * SESSION_PAGE_SIZE)

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PageHeader
                title="My Sessions"
                description="Review your active sessions and remove ones you no longer trust."
            />

            {status && <p className="text-xs font-bold text-green-700 bg-green-50 border border-green-200 rounded-2xl px-4 py-3">{status}</p>}
            {error && <p className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">{error}</p>}

            {/* Current Session */}
            <SectionCard
                icon={Shield}
                title="Current Session"
                subtitle="This is the browser session you are using right now."
                tone="emerald"
                bodyClassName="p-4"
            >
                {loading ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
                    </div>
                ) : currentSession ? (
                    <SessionCard session={currentSession} />
                ) : (
                    <p className="text-sm font-semibold text-muted-foreground">No current session found.</p>
                )}
            </SectionCard>

            {/* Other Sessions */}
            <SectionCard
                icon={Monitor}
                title="Other Active Sessions"
                subtitle="Sign out old browsers and devices if they are no longer in use."
                tone="neutral"
                action={
                    <button
                        type="button"
                        onClick={revokeOtherSessions}
                        disabled={revoking || loading || otherSessions.length === 0}
                        className="inline-flex items-center gap-2 text-xs font-black px-3 py-2 rounded-xl bg-white border border-border text-rose-600 hover:bg-rose-50 hover:border-rose-200 disabled:opacity-50 transition-colors"
                    >
                        {revoking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        {revoking ? 'Revoking…' : 'Revoke All Others'}
                    </button>
                }
                bodyClassName="p-4"
            >
                {loading ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" /> Loading sessions…
                    </div>
                ) : otherSessions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        <p className="text-3xl mb-2">✓</p>
                        <p className="font-semibold text-sm">No other active sessions</p>
                    </div>
                ) : (
                    <>
                        <div className="space-y-3">
                            {pagedOtherSessions.map(session => (
                                <SessionCard
                                    key={session.id}
                                    session={session}
                                    onRevoke={revokeSingleSession}
                                    revoking={revokingSessionId === session.id}
                                />
                            ))}
                        </div>
                        <div className="mt-3">
                            <PaginationControls
                                page={otherSessionsPage}
                                totalItems={otherSessions.length}
                                pageSize={SESSION_PAGE_SIZE}
                                label="sessions"
                                onPageChange={setOtherSessionsPage}
                            />
                        </div>
                    </>
                )}
            </SectionCard>
        </div>
    )
}
