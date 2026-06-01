import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Building2, ChevronRight, KeyRound, Loader2, PauseCircle, PlayCircle, Search, Shield, ShieldCheck, Users } from 'lucide-react'

import { sysAdminApi } from '@/lib/api'
import type { AdminOrganizationDetail, TenantWorkspaceAppGovernance } from '@/lib/api'
import { adminRoutes } from '@/lib/routes'
import PaginationControls from '@/components/ui/PaginationControls'
import PageHeader from '@/components/ui/PageHeader'
import SaveActionFooter from '@/components/ui/SaveActionFooter'
import SectionHeader from '@/components/ui/SectionHeader'
import Pill from '@/components/ui/Pill'
import WorkspaceRolePill from '@/components/ui/WorkspaceRolePill'

const MEMBER_PAGE_SIZE = 8
const WORKSPACE_APPS_PAGE_SIZE = 6
const WORKSPACE_ACTIVITY_PAGE_SIZE = 6

function PeopleTable({
    title,
    subtitle,
    badge,
    rows,
    emptyMessage,
    tone = 'gray',
    onPersonClick,
}: {
    title: string
    subtitle?: string
    badge?: React.ReactNode
    rows: Array<{
        id: string
        primary: string
        secondary?: string | null
        roleCodes?: string[]
        roleNames?: string[]
        status: string
    }>
    emptyMessage: string
    tone?: 'gray' | 'sky' | 'emerald' | 'rose'
    onPersonClick?: (row: { id: string }) => void
}) {
    const toneStyles = {
        gray: {
            frame: 'border-gray-100 bg-white',
            header: 'bg-gray-50/90',
            headerText: 'text-gray-400',
            titleBar: 'bg-white',
        },
        sky: {
            frame: 'border-sky-100 bg-sky-50/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]',
            header: 'bg-sky-50/75',
            headerText: 'text-sky-600',
            titleBar: 'bg-gradient-to-r from-sky-50/55 via-white to-sky-50/35',
        },
        emerald: {
            frame: 'border-emerald-100 bg-emerald-50/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]',
            header: 'bg-emerald-50/70',
            headerText: 'text-emerald-600',
            titleBar: 'bg-gradient-to-r from-emerald-50/50 via-white to-emerald-50/35',
        },
        rose: {
            frame: 'border-rose-100 bg-rose-50/28 shadow-[inset_0_1px_0_rgba(255,255,255,0.78)]',
            header: 'bg-rose-50/70',
            headerText: 'text-rose-600',
            titleBar: 'bg-gradient-to-r from-rose-50/50 via-white to-rose-50/32',
        },
    }
    const styles = toneStyles[tone]

    return (
        <div className={`rounded-2xl border overflow-hidden ${styles.frame}`}>
            <div className={`flex items-center justify-between gap-3 border-b border-white/60 px-4 py-3 ${styles.titleBar}`}>
                <div>
                    <p className="text-sm font-black text-gray-900">{title}</p>
                    {subtitle ? <p className="text-xs font-medium text-muted-foreground">{subtitle}</p> : null}
                </div>
                {badge}
            </div>

            {rows.length > 0 ? (
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className={styles.header}>
                            <tr className="text-left">
                                <th className={`px-4 py-3 text-[11px] font-black uppercase tracking-[0.14em] ${styles.headerText}`}>Name</th>
                                <th className={`px-4 py-3 text-[11px] font-black uppercase tracking-[0.14em] ${styles.headerText}`}>Email</th>
                                <th className={`px-4 py-3 text-[11px] font-black uppercase tracking-[0.14em] ${styles.headerText}`}>Role</th>
                                <th className={`px-4 py-3 text-[11px] font-black uppercase tracking-[0.14em] ${styles.headerText}`}>Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {rows.map(row => (
                                <tr key={row.id} className="align-top">
                                    <td className="px-4 py-3.5">
                                        {onPersonClick ? (
                                            <button
                                                type="button"
                                                onClick={() => onPersonClick(row)}
                                                className="text-left font-black text-gray-900 transition-colors hover:text-sky-700"
                                                title={`Open member details for ${row.secondary || row.primary}`}
                                            >
                                                {row.primary}
                                            </button>
                                        ) : (
                                            <p className="font-black text-gray-900">{row.primary}</p>
                                        )}
                                    </td>
                                    <td className="px-4 py-3.5">
                                        {onPersonClick ? (
                                            <button
                                                type="button"
                                                onClick={() => onPersonClick(row)}
                                                className="text-left font-medium text-muted-foreground transition-colors hover:text-sky-700"
                                                title={`Open member details for ${row.secondary || row.primary}`}
                                            >
                                                {row.secondary || '—'}
                                            </button>
                                        ) : (
                                            <p className="font-medium text-muted-foreground">{row.secondary || '—'}</p>
                                        )}
                                    </td>
                                    <td className="px-4 py-3.5">
                                        <div className="flex flex-wrap gap-2">
                                            <WorkspaceRolePill roleCodes={row.roleCodes} roleNames={row.roleNames} />
                                        </div>
                                    </td>
                                    <td className="px-4 py-3.5">
                                        <Pill tone={row.status === 'active' ? 'green' : 'amber'}>{row.status}</Pill>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="px-4 py-6 text-center text-sm font-semibold text-muted-foreground">
                    {emptyMessage}
                </div>
            )}
        </div>
    )
}

export default function TenantWorkspaceDetail() {
    const { workspaceId } = useParams()
    const navigate = useNavigate()
    const [detail, setDetail] = useState<AdminOrganizationDetail | null>(null)
    const [appGovernance, setAppGovernance] = useState<TenantWorkspaceAppGovernance | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [statusBusy, setStatusBusy] = useState(false)
    const [appGovernanceDirty, setAppGovernanceDirty] = useState(false)
    const [appGovernanceSaving, setAppGovernanceSaving] = useState(false)
    const [appGovernanceError, setAppGovernanceError] = useState('')

    const handleStatusChange = async (status: 'active' | 'suspended') => {
        if (!workspaceId || !detail) return
        setStatusBusy(true)
        try {
            const res = await sysAdminApi.updateOrgStatus(workspaceId, status)
            setDetail(d => d ? { ...d, organization: { ...d.organization, status: res.status } } : d)
        } finally {
            setStatusBusy(false)
        }
    }
    const [memberSearch, setMemberSearch] = useState('')
    const [memberRoleFilter, setMemberRoleFilter] = useState<'all' | 'admin' | 'member'>('all')
    const [memberPage, setMemberPage] = useState(1)
    const [appsPage, setAppsPage] = useState(1)
    const [activityPage, setActivityPage] = useState(1)

    useEffect(() => {
        if (!workspaceId) {
            setError('Missing workspace id.')
            setLoading(false)
            return
        }

        sysAdminApi.organizationDetail(workspaceId)
            .then(setDetail)
            .catch(err => setError(err instanceof Error ? err.message : 'Could not load workspace details.'))
            .finally(() => setLoading(false))
        sysAdminApi.orgAppGovernance(workspaceId)
            .then(data => {
                setAppGovernance(data)
                setAppGovernanceDirty(false)
            })
            .catch(() => setAppGovernance(null))
    }, [workspaceId])

    const saveAppGovernance = async () => {
        if (!workspaceId || !appGovernance) return
        setAppGovernanceSaving(true)
        setAppGovernanceError('')
        try {
            const saved = await sysAdminApi.updateOrgAppGovernance(workspaceId, {
                max_redirect_uris_per_app: appGovernance.tenant_max_redirect_uris_per_app,
                max_allowed_embed_origins_per_app: appGovernance.tenant_max_allowed_embed_origins_per_app,
            })
            setAppGovernance(saved)
            setAppGovernanceDirty(false)
        } catch (err) {
            setAppGovernanceError(err instanceof Error ? err.message : 'Could not save app limits.')
        } finally {
            setAppGovernanceSaving(false)
        }
    }

    const loginMethods = useMemo(() => {
        if (!detail) return []
        const methods = []
        if (detail.organization.allow_magic_link) methods.push('Magic Link')
        if (detail.organization.allow_passkey) methods.push('Passkey')
        if (detail.organization.allow_google) methods.push('Google')
        if (detail.organization.allow_microsoft) methods.push('Microsoft')
        if (detail.organization.require_mfa) methods.push('MFA required')
        return methods
    }, [detail])

    const ownerId = detail?.owner?.user_id ?? null
    const admins = useMemo(() => detail?.admins ?? [], [detail])
    const adminIds = useMemo(() => new Set(admins.map(member => member.user_id)), [admins])

    const members = useMemo(() => {
        if (!detail) return []
        return detail.members.filter(member => member.user_id !== ownerId && !adminIds.has(member.user_id))
    }, [adminIds, detail, ownerId])

    const filteredMembers = useMemo(() => {
        const query = memberSearch.trim().toLowerCase()
        return members.filter(member => {
            const matchesSearch = !query
                || (member.display_name || '').toLowerCase().includes(query)
                || (member.email || '').toLowerCase().includes(query)
                || member.user_id.toLowerCase().includes(query)

            const normalizedRoles = member.role_names.map(role => role.toLowerCase())
            const matchesRole = memberRoleFilter === 'all'
                || (memberRoleFilter === 'admin' && normalizedRoles.some(role => role.includes('admin') || role.includes('owner')))
                || (memberRoleFilter === 'member' && !normalizedRoles.some(role => role.includes('admin') || role.includes('owner')))

            return matchesSearch && matchesRole
        })
    }, [memberRoleFilter, memberSearch, members])

    useEffect(() => {
        setMemberPage(1)
    }, [memberRoleFilter, memberSearch])

    const pagedMembers = useMemo(() => {
        const start = (memberPage - 1) * MEMBER_PAGE_SIZE
        return filteredMembers.slice(start, start + MEMBER_PAGE_SIZE)
    }, [filteredMembers, memberPage])

    useEffect(() => {
        setAppsPage(1)
        setActivityPage(1)
    }, [workspaceId])

    const pagedClients = useMemo(() => {
        if (!detail) return []
        const start = (appsPage - 1) * WORKSPACE_APPS_PAGE_SIZE
        return detail.clients.slice(start, start + WORKSPACE_APPS_PAGE_SIZE)
    }, [appsPage, detail])

    const pagedActivity = useMemo(() => {
        if (!detail) return []
        const start = (activityPage - 1) * WORKSPACE_ACTIVITY_PAGE_SIZE
        return detail.recent_activity.slice(start, start + WORKSPACE_ACTIVITY_PAGE_SIZE)
    }, [activityPage, detail])

    const totalPeopleCount = detail?.organization.member_count ?? 0
    const endUserCount = members.length

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
                <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading workspace details…
            </div>
        )
    }

    if (error || !detail) {
        return (
            <div className="space-y-5 sm:space-y-6 animate-slide-up">
                <Link to="/tenant-workspace/workspaces" className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-800">
                    <ArrowLeft className="h-4 w-4" /> Back to Workspaces
                </Link>
                <div className="rounded-3xl border border-red-200 bg-red-50 p-6">
                    <p className="text-lg font-black text-red-700">Workspace detail unavailable</p>
                    <p className="mt-2 text-sm font-semibold text-red-600">{error || 'Workspace not found.'}</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PageHeader
                eyebrow={
                    <Link to="/tenant-workspace/workspaces" className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-800">
                        <ArrowLeft className="h-4 w-4" /> Back to Workspaces
                    </Link>
                }
                title={detail.organization.name}
                description={detail.organization.slug}
                actions={
                    <button
                        type="button"
                        onClick={() => handleStatusChange(detail.organization.status === 'active' ? 'suspended' : 'active')}
                        disabled={statusBusy || (detail.organization.platform_locked && detail.organization.status !== 'active')}
                        title={detail.organization.platform_locked ? 'Locked by platform administrator' : undefined}
                        className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-xs font-black disabled:opacity-50 ${
                            detail.organization.status === 'active'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : 'border-amber-200 bg-amber-50 text-amber-800'
                        }`}
                    >
                        {detail.organization.status === 'active'
                            ? <><PlayCircle className="h-4 w-4" /> active</>
                            : <><PauseCircle className="h-4 w-4" /> suspended{detail.organization.platform_locked ? ' (platform locked)' : ''}</>
                        }
                    </button>
                }
            />

            <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-gray-400">Owner</p>
                    <p className="mt-2 text-base font-black text-gray-900">{detail.owner?.display_name || detail.owner?.email || 'Unassigned'}</p>
                    {detail.owner?.email ? <p className="text-xs font-medium text-muted-foreground">{detail.owner.email}</p> : null}
                </div>
                <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-gray-400">Admins</p>
                    <p className="mt-2 text-3xl font-black text-gray-900">{detail.admins.length}</p>
                </div>
                <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-gray-400">Members</p>
                    <p className="mt-2 text-3xl font-black text-gray-900">{totalPeopleCount}</p>
                    <p className="mt-1 text-xs font-medium text-muted-foreground">Owner, admins, and end users</p>
                </div>
                <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-gray-400">Apps</p>
                    <p className="mt-2 text-3xl font-black text-gray-900">{detail.organization.app_count}</p>
                </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                <div className="space-y-6">
                    <section className="glass-card rounded-4xl p-5 sm:p-6">
                        <SectionHeader
                            title="Workspace Summary"
                            subtitle="Core workspace state, login policy, and naming guidance."
                            icon={Building2}
                            tone="sky"
                            className="mb-4"
                        />
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl border border-gray-100 bg-white p-4">
                                <p className="text-xs font-black uppercase tracking-[0.16em] text-gray-400">Created</p>
                                <p className="mt-2 text-sm font-bold text-gray-900">{new Date(detail.organization.created_at).toLocaleString()}</p>
                            </div>
                            <div className="rounded-2xl border border-gray-100 bg-white p-4">
                                <p className="text-xs font-black uppercase tracking-[0.16em] text-gray-400">Login Methods</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {loginMethods.length > 0 ? loginMethods.map(method => <Pill key={method} tone="blue">{method}</Pill>) : <Pill>None</Pill>}
                                </div>
                            </div>
                            <div className="rounded-2xl border border-gray-100 bg-white p-4">
                                <p className="text-xs font-black uppercase tracking-[0.16em] text-gray-400">Session Policy</p>
                                <p className="mt-1 text-sm font-semibold text-muted-foreground">View the current platform-governed session and token lifetimes for this workspace.</p>
                                <Link
                                    to={`/tenant-workspace/workspaces/${workspaceId}/session-policy`}
                                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-black text-slate-600 hover:text-slate-800 transition-colors"
                                >
                                    <Shield className="w-3.5 h-3.5" /> View →
                                </Link>
                            </div>
                            <div className="rounded-2xl border border-gray-100 bg-white p-4 sm:col-span-2">
                                <p className="text-xs font-black uppercase tracking-[0.16em] text-gray-400">App Registration Limits</p>
                                {appGovernance ? (
                                    <div className="mt-3 space-y-4">
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <div>
                                                <label className="block text-[11px] font-black uppercase tracking-[0.14em] text-gray-500 mb-2">Tenant Max Redirect URIs Per App</label>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={appGovernance.platform_max_redirect_uris_per_app}
                                                    value={appGovernance.tenant_max_redirect_uris_per_app ?? ''}
                                                    onChange={event => {
                                                        const value = event.target.value.trim()
                                                        setAppGovernance(current => current ? {
                                                            ...current,
                                                            tenant_max_redirect_uris_per_app: value ? Number.parseInt(value, 10) : null,
                                                            effective_max_redirect_uris_per_app: value ? Number.parseInt(value, 10) : current.platform_default_max_redirect_uris_per_app,
                                                        } : current)
                                                        setAppGovernanceDirty(true)
                                                    }}
                                                    placeholder={String(appGovernance.platform_default_max_redirect_uris_per_app)}
                                                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium outline-none focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
                                                />
                                                <p className="mt-2 text-xs font-semibold text-muted-foreground">
                                                    Blank = inherit platform default {appGovernance.platform_default_max_redirect_uris_per_app}. Tenant may choose from 1 to {appGovernance.platform_max_redirect_uris_per_app}.
                                                </p>
                                            </div>
                                            <div>
                                                <label className="block text-[11px] font-black uppercase tracking-[0.14em] text-gray-500 mb-2">Tenant Max Allowed Embed Origins Per App</label>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={appGovernance.platform_max_allowed_embed_origins_per_app}
                                                    value={appGovernance.tenant_max_allowed_embed_origins_per_app ?? ''}
                                                    onChange={event => {
                                                        const value = event.target.value.trim()
                                                        setAppGovernance(current => current ? {
                                                            ...current,
                                                            tenant_max_allowed_embed_origins_per_app: value ? Number.parseInt(value, 10) : null,
                                                            effective_max_allowed_embed_origins_per_app: value ? Number.parseInt(value, 10) : current.platform_default_max_allowed_embed_origins_per_app,
                                                        } : current)
                                                        setAppGovernanceDirty(true)
                                                    }}
                                                    placeholder={String(appGovernance.platform_default_max_allowed_embed_origins_per_app)}
                                                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium outline-none focus:border-sky-200 focus:ring-2 focus:ring-sky-100"
                                                />
                                                <p className="mt-2 text-xs font-semibold text-muted-foreground">
                                                    Blank = inherit platform default {appGovernance.platform_default_max_allowed_embed_origins_per_app}. Tenant may choose from 1 to {appGovernance.platform_max_allowed_embed_origins_per_app}.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                                                Effective redirect URI limit: <span className="font-black text-slate-900">{appGovernance.effective_max_redirect_uris_per_app}</span>
                                            </div>
                                            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
                                                Effective embed origin limit: <span className="font-black text-slate-900">{appGovernance.effective_max_allowed_embed_origins_per_app}</span>
                                            </div>
                                        </div>
                                        <SaveActionFooter
                                            error={appGovernanceError}
                                            loading={appGovernanceSaving}
                                            dirty={appGovernanceDirty}
                                            onClick={saveAppGovernance}
                                            disabled={appGovernanceSaving}
                                            label="Save App Limits"
                                        />
                                    </div>
                                ) : (
                                    <p className="mt-2 text-sm font-semibold text-muted-foreground">Could not load tenant app limits.</p>
                                )}
                            </div>
                            <div className="rounded-2xl border border-gray-100 bg-white p-4 sm:col-span-2">
                                <p className="text-xs font-black uppercase tracking-[0.16em] text-gray-400">Member Terminology</p>
                                <p className="mt-2 text-sm font-semibold text-muted-foreground">
                                    <span className="font-black text-gray-900">Members</span> counts everyone in the workspace.
                                    {' '}<span className="font-black text-gray-900">Admins</span> are elevated workspace operators.
                                    {' '}<span className="font-black text-gray-900">Users</span> are the remaining non-admin members.
                                </p>
                            </div>
                        </div>
                    </section>

                    <section className="glass-card rounded-4xl p-5 sm:p-6">
                        <SectionHeader
                            title="Workspace Members"
                            subtitle="Owner, admins, and users in this workspace."
                            icon={Users}
                            tone="emerald"
                            className="mb-4"
                        />
                        <div className="space-y-5">
                            <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
                                <PeopleTable
                                    title="Owner"
                                    tone="sky"
                                    rows={detail.owner ? [{
                                        id: detail.owner.user_id,
                                        primary: detail.owner.display_name || detail.owner.email || detail.owner.user_id,
                                        secondary: detail.owner.email,
                                        roleCodes: ['owner'],
                                        status: detail.owner.status,
                                    }] : []}
                                    emptyMessage="No owner assigned."
                                    onPersonClick={(row) => navigate(adminRoutes.tenantMember(row.id), { state: { from: 'tenant/members' } })}
                                />
                            </div>

                            <PeopleTable
                                title="Admins"
                                subtitle="Members with elevated workspace control."
                                badge={<Pill tone="blue">{admins.length} total</Pill>}
                                tone="emerald"
                                rows={admins.map(member => ({
                                    id: member.user_id,
                                    primary: member.display_name || member.email || member.user_id,
                                    secondary: member.email,
                                    roleCodes: member.role_codes,
                                    roleNames: member.role_names,
                                    status: member.status,
                                }))}
                                emptyMessage="No additional admins in this workspace."
                                onPersonClick={(row) => navigate(adminRoutes.tenantMember(row.id), { state: { from: 'tenant/members' } })}
                            />

                            <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
                                <div className="border-b border-gray-100 px-4 py-3">
                                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                        <div>
                                            <p className="text-sm font-black text-gray-900">Users</p>
                                            <p className="text-xs font-medium text-muted-foreground">Search and filter non-admin workspace members.</p>
                                        </div>
                                        <Pill>{filteredMembers.length} matching</Pill>
                                    </div>
                                    <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                                        <div className="relative">
                                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                            <input
                                                type="text"
                                                value={memberSearch}
                                                onChange={event => setMemberSearch(event.target.value)}
                                                placeholder="Search end users by name or email"
                                                className="w-full rounded-2xl border border-gray-200 bg-white py-2.5 pl-10 pr-3 text-sm font-medium outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-100"
                                            />
                                        </div>
                                        <select
                                            value={memberRoleFilter}
                                            onChange={event => setMemberRoleFilter(event.target.value as 'all' | 'admin' | 'member')}
                                            className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium outline-none focus:border-rose-200 focus:ring-2 focus:ring-rose-100"
                                        >
                                            <option value="all">All roles</option>
                                            <option value="admin">Admin-like roles</option>
                                            <option value="member">Users</option>
                                        </select>
                                    </div>
                                    <p className="mt-3 text-xs font-medium text-muted-foreground">
                                        Workspace total: <span className="font-black text-gray-900">{totalPeopleCount}</span>
                                        {' '}· Admins: <span className="font-black text-gray-900">{admins.length}</span>
                                        {' '}· Users: <span className="font-black text-gray-900">{endUserCount}</span>
                                    </p>
                                </div>

                                {pagedMembers.length > 0 ? (
                                    <div>
                                        <PeopleTable
                                            title="Users"
                                            tone="rose"
                                            rows={pagedMembers.map(member => ({
                                                id: member.user_id,
                                                primary: member.display_name || member.email || member.user_id,
                                                secondary: member.email,
                                                roleCodes: member.role_codes,
                                                roleNames: member.role_names,
                                                status: member.status,
                                            }))}
                                            emptyMessage="No users match the current search or filter."
                                            onPersonClick={(row) => navigate(adminRoutes.tenantMember(row.id), { state: { from: 'tenant/members' } })}
                                        />
                                        <PaginationControls
                                            page={memberPage}
                                            totalItems={filteredMembers.length}
                                            pageSize={MEMBER_PAGE_SIZE}
                                            label="users"
                                            onPageChange={setMemberPage}
                                        />
                                    </div>
                                ) : (
                                    <div className="px-4 py-8 text-center text-sm font-semibold text-muted-foreground">
                                        No users match the current search or filter.
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>
                </div>

                <div className="space-y-6">
                    <section className="glass-card rounded-4xl p-5 sm:p-6">
                        <SectionHeader
                            title="Apps"
                            subtitle="Registered client applications owned by this workspace."
                            icon={KeyRound}
                            tone="violet"
                            className="mb-4"
                        />
                        <div className="space-y-3">
                            {detail.clients.length > 0 ? (
                                <>
                                    {pagedClients.map(client => (
                                        <Link
                                            key={client.id}
                                            to={adminRoutes.tenantWorkspaceApp(client.id)}
                                            className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                                                'border-gray-100 bg-white hover:border-violet-100 hover:bg-violet-50/20'
                                            }`}
                                            title={`Open app info for ${client.app_name}`}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-black text-gray-900">{client.app_name}</p>
                                                    <p className="truncate text-[11px] font-mono text-muted-foreground">{client.client_id}</p>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <Pill tone="blue">{client.app_type}</Pill>
                                                    <ChevronRight className="h-4 w-4 text-violet-400" />
                                                </div>
                                            </div>
                                        </Link>
                                    ))}
                                    <div className="rounded-2xl overflow-hidden border border-gray-100 bg-white">
                                        <PaginationControls
                                            page={appsPage}
                                            totalItems={detail.clients.length}
                                            pageSize={WORKSPACE_APPS_PAGE_SIZE}
                                            label="apps"
                                            onPageChange={setAppsPage}
                                        />
                                    </div>
                                </>
                            ) : (
                                <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-center text-sm font-semibold text-muted-foreground">
                                    No apps in this workspace.
                                </div>
                            )}
                        </div>
                    </section>

                    <section className="glass-card rounded-4xl p-5 sm:p-6">
                        <div className="flex items-start justify-between gap-3 mb-4">
                            <SectionHeader
                                title="Recent Activity"
                                subtitle="Recent security and workspace events tied to this workspace."
                                icon={ShieldCheck}
                                tone="amber"
                            />
                            <Link
                                to={`/tenant-workspace/workspaces/${workspaceId}/audit-logs`}
                                className="shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-700 hover:bg-amber-100 transition-colors"
                            >
                                View all →
                            </Link>
                        </div>
                        <div className="space-y-3">
                            {detail.recent_activity.length > 0 ? (
                                <>
                                    {pagedActivity.map(event => (
                                <div key={event.id} className="rounded-2xl border border-gray-100 bg-white p-4">
                                    <p className="text-sm font-black text-gray-900">{event.action}</p>
                                    <p className="mt-1 text-xs font-medium text-muted-foreground">{event.actor_email || 'System'} · {event.target_type}</p>
                                    <p className="mt-1 text-[11px] font-medium text-muted-foreground">{new Date(event.created_at).toLocaleString()}</p>
                                </div>
                                    ))}
                                    <div className="rounded-2xl overflow-hidden border border-gray-100 bg-white">
                                        <PaginationControls
                                            page={activityPage}
                                            totalItems={detail.recent_activity.length}
                                            pageSize={WORKSPACE_ACTIVITY_PAGE_SIZE}
                                            label="events"
                                            onPageChange={setActivityPage}
                                        />
                                    </div>
                                </>
                            ) : (
                                <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-center text-sm font-semibold text-muted-foreground">
                                    No recent workspace activity.
                                </div>
                            )}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    )
}
