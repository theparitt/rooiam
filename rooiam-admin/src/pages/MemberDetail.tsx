import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { ArrowLeft, Building2, ExternalLink, Loader2, LogOut, Monitor, PauseCircle, PlayCircle, Search, ShieldCheck, UserRound } from 'lucide-react'

import { resolveApiAssetUrl } from '@/lib/api-base'
import { sysAdminApi } from '@/lib/api'
import type { AdminUserDetail, AdminSession } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import PageHeader from '@/components/ui/PageHeader'
import SectionHeader from '@/components/ui/SectionHeader'
import PaginationControls from '@/components/ui/PaginationControls'
import Pill from '@/components/ui/Pill'
import PlatformRolePill from '@/components/ui/PlatformRolePill'
import WorkspaceRolePill from '@/components/ui/WorkspaceRolePill'
import { useToast } from '@/lib/toast'
import { adminRoutes } from '@/lib/routes'

const MEMBERSHIP_PAGE_SIZE = 8
const ACTIVITY_PAGE_SIZE = 8

function displayRole(detail: AdminUserDetail['user']) {
    if (detail.is_platform_owner) return 'Platform Owner'
    if (detail.is_superuser) return 'Platform Admin'
    if (detail.highest_workspace_role === 'owner') return 'Workspace Owner'
    if (detail.highest_workspace_role === 'admin') return 'Workspace Admin'
    if (detail.highest_workspace_role === 'member') return 'User'
    return 'User'
}

export default function MemberDetail() {
    const { memberId } = useParams()
    const location = useLocation()
    const fromTenantMembers = (location.state as { from?: string } | null)?.from === 'tenant/members'
    const [detail, setDetail] = useState<AdminUserDetail | null>(null)
    const [loading, setLoading] = useState(true)
    const toast = useToast()
    const [error, setError] = useState('')
    const { user: currentUser } = useAuthStore()
    const [statusBusy, setStatusBusy] = useState(false)
    const [roleBusy, setRoleBusy] = useState(false)
    const [sessions, setSessions] = useState<AdminSession[] | null>(null)
    const [sessionsLoading, setSessionsLoading] = useState(false)
    const [revoking, setRevoking] = useState(false)
    const [membershipSearch, setMembershipSearch] = useState('')
    const [membershipPage, setMembershipPage] = useState(1)
    const [activityPage, setActivityPage] = useState(1)

    useEffect(() => {
        if (!memberId) {
            setError('Missing member id.')
            setLoading(false)
            return
        }

        sysAdminApi.userDetail(memberId)
            .then(setDetail)
            .catch(err => setError(err instanceof Error ? err.message : 'Could not load member details.'))
            .finally(() => setLoading(false))
    }, [memberId])

    useEffect(() => {
        setMembershipPage(1)
    }, [membershipSearch])

    const filteredMemberships = useMemo(() => {
        if (!detail) return []
        const query = membershipSearch.trim().toLowerCase()
        return detail.workspace_memberships.filter(membership => {
            if (!query) return true
            return (
                membership.organization_name.toLowerCase().includes(query) ||
                membership.organization_slug.toLowerCase().includes(query) ||
                membership.role_names.some(role => role.toLowerCase().includes(query))
            )
        })
    }, [detail, membershipSearch])

    const pagedMemberships = useMemo(() => {
        const start = (membershipPage - 1) * MEMBERSHIP_PAGE_SIZE
        return filteredMemberships.slice(start, start + MEMBERSHIP_PAGE_SIZE)
    }, [filteredMemberships, membershipPage])

    const pagedActivity = useMemo(() => {
        if (!detail) return []
        const start = (activityPage - 1) * ACTIVITY_PAGE_SIZE
        return detail.recent_activity.slice(start, start + ACTIVITY_PAGE_SIZE)
    }, [activityPage, detail])

    useEffect(() => {
        if (!memberId || !detail) return
        setSessionsLoading(true)
        sysAdminApi.userSessions(memberId)
            .then(setSessions)
            .catch(() => setSessions([]))
            .finally(() => setSessionsLoading(false))
    }, [memberId, detail])

    const handleRevokeAllSessions = async () => {
        if (!memberId) return
        setRevoking(true)
        try {
            const res = await sysAdminApi.revokeUserSessions(memberId)
            toast.success(`Signed out ${res.revoked_count} active session${res.revoked_count !== 1 ? 's' : ''}.`)
            setSessions([])
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not revoke sessions.')
        } finally {
            setRevoking(false)
        }
    }

    const handleRoleToggle = async () => {
        if (!detail || !memberId) return
        const grant = !detail.user.is_superuser
        if (!confirm(`${grant ? 'Grant' : 'Revoke'} platform admin for ${detail.user.display_name || detail.user.email}?`)) return
        setRoleBusy(true)
        try {
            const user = await sysAdminApi.updateUserRole(memberId, grant ? 'platform_admin' : 'user')
            setDetail(current => current ? { ...current, user } : current)
            toast.success(grant ? 'Platform admin granted.' : 'Platform admin revoked.')
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not update role.')
        } finally {
            setRoleBusy(false)
        }
    }

    const handleStatusChange = async (status: 'active' | 'suspended') => {
        if (!detail || !memberId) return
        setStatusBusy(true)
        try {
            const user = await sysAdminApi.updateUserStatus(memberId, status)
            setDetail(current => current ? { ...current, user } : current)
            toast.success(status === 'active' ? 'Member resumed.' : 'Member suspended and active sessions revoked.')
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Could not update member status.')
        } finally {
            setStatusBusy(false)
        }
    }

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <div className="flex items-center gap-3">
                <Link
                    to={fromTenantMembers ? '/tenant/members' : '/admin/members'}
                    className="inline-flex items-center gap-2 rounded-2xl border border-border bg-white px-4 py-2 text-xs font-black text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                >
                    <ArrowLeft className="h-4 w-4" />
                    {fromTenantMembers ? 'Back to Tenant Members' : 'Back to Members'}
                </Link>
            </div>

            {loading ? (
                <div className="glass-card rounded-4xl px-6 py-16 text-center text-muted-foreground">
                    <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" />
                    Loading member details…
                </div>
            ) : error || !detail ? (
                <div className="glass-card rounded-4xl px-6 py-16 text-center text-red-500">
                    <p className="text-5xl mb-3">🛑</p>
                    <p className="text-lg font-black">Member detail unavailable</p>
                    <p className="mt-2 text-sm font-semibold">{error || 'Not Found'}</p>
                </div>
            ) : (
                <>
                    <PageHeader
                        title={detail.user.display_name || detail.user.email}
                        description="View platform role, workspace memberships, recent activity, and safe lifecycle controls."
                        actions={(
                            !detail.user.is_platform_owner && (
                                <button
                                    type="button"
                                    onClick={() => handleStatusChange(detail.user.status === 'active' ? 'suspended' : 'active')}
                                    disabled={statusBusy}
                                    className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-xs font-black disabled:opacity-50 ${
                                        detail.user.status === 'active'
                                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                            : 'border-amber-200 bg-amber-50 text-amber-800'
                                    }`}
                                >
                                    {detail.user.status === 'active'
                                        ? <><PlayCircle className="h-4 w-4" /> Active</>
                                        : <><PauseCircle className="h-4 w-4" /> Suspended</>
                                    }
                                </button>
                            )
                        )}
                    />

                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                        <section className="glass-card rounded-4xl p-5 sm:p-6">
                            <SectionHeader
                                title="Member Summary"
                                subtitle="Platform-level account state and role summary."
                                icon={UserRound}
                            />
                            <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
                                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border border-border bg-white shadow-sm">
                                    <img src="/rooiam-app-white.svg" alt={detail.user.display_name || detail.user.email} className="h-full w-full object-cover scale-[1.06]" />
                                </div>
                                <div className="min-w-0 flex-1 space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <PlatformRolePill user={detail.user} />
                                        {!detail.user.is_platform_owner && !detail.user.is_superuser ? (
                                            <WorkspaceRolePill
                                                roleNames={detail.user.highest_workspace_role ? [displayRole(detail.user)] : ['User']}
                                            />
                                        ) : null}
                                        <Pill tone="gray">
                                            {detail.user.workspace_count} {detail.user.workspace_count === 1 ? 'workspace' : 'workspaces'}
                                        </Pill>
                                    </div>
                                    <p className="break-all font-mono text-sm text-muted-foreground">{detail.user.email}</p>
                                    <p className="text-xs font-semibold text-muted-foreground">
                                        Created {new Date(detail.user.created_at).toLocaleString()}
                                    </p>
                                    <p className="text-xs font-semibold text-muted-foreground">
                                        Last seen {detail.user.last_seen_at ? new Date(detail.user.last_seen_at).toLocaleString() : 'Never'}
                                    </p>
                                </div>
                            </div>
                        </section>

                        <section className="glass-card rounded-4xl p-5 sm:p-6">
                            <SectionHeader
                                title="Platform Roles"
                                subtitle="Current platform-scope access flags for this account."
                                icon={ShieldCheck}
                            />
                            <div className="mt-5 space-y-3">
                                <div className="flex items-center justify-between rounded-2xl border border-border bg-white/80 px-4 py-3">
                                    <span className="text-sm font-bold text-foreground">Platform Owner</span>
                                    <Pill tone={detail.user.is_platform_owner ? 'amber' : 'gray'}>
                                        {detail.user.is_platform_owner ? 'Yes' : 'No'}
                                    </Pill>
                                </div>
                                <div className="flex items-center justify-between rounded-2xl border border-border bg-white/80 px-4 py-3">
                                    <span className="text-sm font-bold text-foreground">Platform Admin</span>
                                    <div className="flex items-center gap-2">
                                        <Pill tone={detail.user.is_superuser ? 'purple' : 'gray'}>
                                            {detail.user.is_superuser ? 'Yes' : 'No'}
                                        </Pill>
                                        {currentUser?.is_platform_owner && !detail.user.is_platform_owner && detail.user.id !== currentUser?.id ? (
                                            <button
                                                type="button"
                                                onClick={handleRoleToggle}
                                                disabled={roleBusy}
                                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-colors disabled:opacity-50 ${
                                                    detail.user.is_superuser
                                                        ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                                                        : 'border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100'
                                                }`}
                                            >
                                                {roleBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                                                {detail.user.is_superuser ? 'Revoke' : 'Grant'}
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>

                    <section className="glass-card rounded-4xl p-5 sm:p-6">
                        <SectionHeader
                            title="Active Sessions"
                            subtitle="Sessions currently signed in for this account across all devices."
                            icon={Monitor}
                            action={
                                sessions && sessions.length > 0 ? (
                                    <button
                                        type="button"
                                        onClick={handleRevokeAllSessions}
                                        disabled={revoking}
                                        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
                                    >
                                        {revoking ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
                                        Sign out all sessions
                                    </button>
                                ) : null
                            }
                        />
                        <div className="mt-5 overflow-hidden rounded-3xl border border-border bg-white/80">
                            {sessionsLoading ? (
                                <div className="flex items-center justify-center py-8 text-muted-foreground">
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading sessions…
                                </div>
                            ) : sessions === null || sessions.length === 0 ? (
                                <div className="px-4 py-8 text-center text-sm font-semibold text-muted-foreground">
                                    {sessions === null ? 'Could not load sessions.' : 'No active sessions.'}
                                </div>
                            ) : (
                                <div className="divide-y divide-border">
                                    {sessions.map(session => (
                                        <div key={session.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="min-w-0">
                                                <p className="truncate text-xs font-semibold text-foreground">
                                                    {session.user_agent || 'Unknown device'}
                                                </p>
                                                <p className="text-[11px] font-medium text-muted-foreground">
                                                    {session.ip || 'Unknown IP'}
                                                    {session.last_seen_at ? ` · Last seen ${new Date(session.last_seen_at).toLocaleString()}` : ''}
                                                </p>
                                            </div>
                                            <p className="shrink-0 text-[11px] font-medium text-muted-foreground">
                                                Created {new Date(session.created_at).toLocaleDateString()}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>

                    <section className="glass-card rounded-4xl p-5 sm:p-6">
                        <SectionHeader
                            title="Workspace Memberships"
                            subtitle="All workspace roles and membership status for this account."
                            icon={Building2}
                        />

                        <div className="relative mt-5">
                            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input
                                type="text"
                                value={membershipSearch}
                                onChange={event => setMembershipSearch(event.target.value)}
                                placeholder="Search memberships by workspace or role…"
                                className="w-full rounded-2xl border-2 border-border bg-card py-3 pl-11 pr-4 text-sm font-medium outline-none transition-all focus:ring-2 focus:ring-primary"
                            />
                        </div>

                        <div className="mt-5 overflow-hidden rounded-3xl border border-border bg-white/80">
                            <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-muted/25">
                                        <tr className="text-left">
                                            <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">Workspace</th>
                                            <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">Roles</th>
                                            <th className="px-4 py-3 text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {pagedMemberships.length > 0 ? pagedMemberships.map(membership => (
                                            <tr key={membership.membership_id}>
                                                <td className="px-4 py-3.5">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-white shadow-sm">
                                                            {resolveApiAssetUrl(membership.organization_icon_url) ? (
                                                                <img
                                                                    src={resolveApiAssetUrl(membership.organization_icon_url)!}
                                                                    alt={membership.organization_name}
                                                                    className="h-full w-full rounded-full object-cover"
                                                                    onError={e => {
                                                                        e.currentTarget.style.display = 'none'
                                                                        const fb = e.currentTarget.nextElementSibling as HTMLElement | null
                                                                        if (fb) fb.style.display = 'flex'
                                                                    }}
                                                                />
                                                            ) : null}
                                                            <Building2
                                                                style={{ display: resolveApiAssetUrl(membership.organization_icon_url) ? 'none' : 'flex' }}
                                                                className="h-4 w-4 text-muted-foreground"
                                                            />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <Link
                                                                to={adminRoutes.tenantWorkspace(membership.organization_id)}
                                                                className="font-black text-foreground transition-colors hover:text-sky-700"
                                                                title={`Open workspace overview for ${membership.organization_name}`}
                                                            >
                                                                {membership.organization_name}
                                                            </Link>
                                                            <Link
                                                                to={adminRoutes.tenantWorkspace(membership.organization_id)}
                                                                className="truncate text-xs font-semibold text-muted-foreground transition-colors hover:text-sky-700"
                                                                title={`Open workspace overview for ${membership.organization_name}`}
                                                            >
                                                                {membership.organization_slug}
                                                            </Link>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3.5">
                                                    <div className="flex flex-wrap gap-2">
                                                        <WorkspaceRolePill
                                                            roleCodes={membership.role_codes}
                                                            roleNames={membership.role_names}
                                                        />
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3.5">
                                                    <Pill tone={membership.membership_status === 'active' ? 'green' : 'amber'}>
                                                        {membership.membership_status}
                                                    </Pill>
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan={3} className="px-4 py-8 text-center text-sm font-semibold text-muted-foreground">
                                                    No matching workspace memberships.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            <PaginationControls
                                page={membershipPage}
                                totalItems={filteredMemberships.length}
                                pageSize={MEMBERSHIP_PAGE_SIZE}
                                label="memberships"
                                onPageChange={setMembershipPage}
                            />
                        </div>
                    </section>

                    <section className="glass-card rounded-4xl p-5 sm:p-6">
                        <SectionHeader
                            title="Recent Activity"
                            subtitle="Most recent audit events performed by this account."
                            icon={ShieldCheck}
                            action={
                                <Link
                                    to={`${fromTenantMembers ? '/tenant/audit-logs' : '/admin/audit-logs'}?search=${encodeURIComponent(detail.user.email || '')}`}
                                    className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-white px-3 py-1.5 text-xs font-black text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                                >
                                    <ExternalLink className="h-3 w-3" />
                                    View full audit logs
                                </Link>
                            }
                        />

                        <div className="mt-5 overflow-hidden rounded-3xl border border-border bg-white/80">
                            <div className="divide-y divide-border">
                                {pagedActivity.length > 0 ? pagedActivity.map(log => (
                                    <div key={log.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors">
                                        <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                                            log.action.includes('success')
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                : log.action.includes('failed')
                                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                                    : log.action.includes('suspicious')
                                                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                                                        : 'bg-blue-50 text-blue-700 border-blue-200'
                                        }`}>
                                            {log.action.split('.').slice(1).join('.')}
                                        </span>
                                        <span className="text-xs font-semibold text-muted-foreground truncate flex-1 min-w-0">
                                            {log.target_type || 'platform'}
                                        </span>
                                        <span className="text-[10px] font-medium text-muted-foreground shrink-0 hidden sm:block">
                                            {new Date(log.created_at).toLocaleString()}
                                        </span>
                                    </div>
                                )) : (
                                    <div className="px-4 py-8 text-center text-sm font-semibold text-muted-foreground">
                                        No recent activity for this member.
                                    </div>
                                )}
                            </div>
                            <PaginationControls
                                page={activityPage}
                                totalItems={detail.recent_activity.length}
                                pageSize={ACTIVITY_PAGE_SIZE}
                                label="activity events"
                                onPageChange={setActivityPage}
                            />
                        </div>
                    </section>
                </>
            )}
        </div>
    )
}
