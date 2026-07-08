import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUpDown, Loader2, Search, Users, Building2 } from 'lucide-react'
import { sysAdminApi } from '@/lib/api'
import { resolveApiAssetUrl } from '@/lib/api-base'
import type { AdminTenantMember, PaginatedResult } from '@/lib/api'
import PageHeader from '@/components/ui/PageHeader'
import StatusBadge from '@/components/ui/StatusBadge'
import PaginationControls from '@/components/ui/PaginationControls'
import SectionCard from '@/components/ui/SectionCard'
import WorkspaceRolePill from '@/components/ui/WorkspaceRolePill'

function formatLastSeen(iso: string | null | undefined): string {
    if (!iso) return 'Never'
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60_000)
    if (mins < 2) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    if (days < 30) return `${Math.floor(days / 7)}w ago`
    if (days < 365) return `${Math.floor(days / 30)}mo ago`
    return `${Math.floor(days / 365)}y ago`
}

type RoleFilter = 'all' | 'admin' | 'user'

function isPlatformWorkspace(workspaceSlug?: string | null, workspaceName?: string | null): boolean {
    return (workspaceSlug || '').trim().toLowerCase() === 'rooiam'
        || (workspaceName || '').trim().toLowerCase() === 'rooiam'
}

export default function TenantMembers()
{
    const navigate = useNavigate()
    const [result, setResult] = useState<PaginatedResult<AdminTenantMember> | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [search, setSearch] = useState('')
    const savedRole = localStorage.getItem('rooiam_tab_tenant_members') as RoleFilter | null
    const [roleFilter, setRoleFilter] = useState<RoleFilter>(savedRole && ['all', 'admin', 'user'].includes(savedRole) ? savedRole : 'all')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(50)
    const [sortBy, setSortBy] = useState<'name' | 'joined'>('joined')
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

    const [focusTick, setFocusTick] = useState(0)

    useEffect(() => {
        const onFocus = () => setFocusTick(t => t + 1)
        globalThis.addEventListener('focus', onFocus)
        return () => globalThis.removeEventListener('focus', onFocus)
    }, [])

    useEffect(() => {
        setLoading(true)
        setError('')
        sysAdminApi.tenantMembers({ page, page_size: pageSize, search, role: roleFilter })
            .then(setResult)
            .catch(err => setError(err instanceof Error ? err.message : 'Could not load workspace members.'))
            .finally(() => setLoading(false))
    }, [page, pageSize, search, roleFilter, focusTick])

    const handleRoleFilterChange = (r: RoleFilter) => {
        setRoleFilter(r)
        setPage(1)
        localStorage.setItem('rooiam_tab_tenant_members', r)
    }

    const handlePageSizeChange = (n: number) => { setPageSize(n); setPage(1) }

    useEffect(() => { setPage(1) }, [search, sortBy, sortDir])

    const members = useMemo(() => {
        const items = result?.items ?? []
        return [...items].sort((a, b) => {
            let cmp = 0
            if (sortBy === 'name') cmp = (a.display_name || a.email || '').localeCompare(b.display_name || b.email || '')
            else if (sortBy === 'joined') cmp = a.created_at.localeCompare(b.created_at)
            return sortDir === 'asc' ? cmp : -cmp
        })
    }, [result, sortBy, sortDir])
    const total = result?.total ?? 0
    const openMemberDetail = (member: AdminTenantMember) => {
        navigate(`/tenant/members/${member.user_id}`, { state: { from: 'tenant/members' } })
    }
    const openWorkspaceAuditLogs = (member: AdminTenantMember) => {
        if (isPlatformWorkspace(member.organization_slug, member.organization_name)) return
        navigate(`/tenant-workspace/workspaces/${member.organization_id}`)
    }

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PageHeader
                title="Tenant Members"
                description="All workspace members across all tenant organizations."
            />

            <SectionCard
                icon={Users}
                title="Tenant Members"
                subtitle="All workspace members across all tenant organizations."
                tone="emerald"
                action={!loading && <span className="cute-badge bg-secondary text-secondary-foreground">{total} members</span>}
                bodyClassName=""
            >
                {/* Filter bar */}
                <div className="flex flex-col gap-3 border-b bg-white/80 px-4 py-3 sm:flex-row sm:px-5">
                    <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search by email or name…"
                            value={search}
                            onChange={e => { setSearch(e.target.value); setPage(1) }}
                            className="w-full pl-11 pr-4 py-2.5 bg-card border-2 border-border rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary transition-all"
                        />
                    </div>
                    <select
                        value={roleFilter}
                        onChange={e => handleRoleFilterChange(e.target.value as RoleFilter)}
                        className="px-4 py-2.5 bg-card border-2 border-border rounded-2xl text-sm font-bold outline-none"
                    >
                        <option value="all">All roles</option>
                        <option value="admin">Workspace Admin</option>
                        <option value="user">User</option>
                    </select>
                    <div className="flex items-center gap-1">
                        <select
                            value={sortBy}
                            onChange={e => setSortBy(e.target.value as typeof sortBy)}
                            className="px-3 py-2.5 bg-card border-2 border-border rounded-2xl text-sm font-bold outline-none"
                        >
                            <option value="name">Name</option>
                            <option value="joined">Joined</option>
                        </select>
                        <button
                            type="button"
                            onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                            className="p-2.5 bg-card border-2 border-border rounded-2xl hover:bg-muted/20 transition-colors"
                            title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
                        >
                            <ArrowUpDown className={`w-4 h-4 transition-transform ${sortDir === 'asc' ? 'rotate-180' : ''}`} />
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-16 text-muted-foreground">
                        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading members…
                    </div>
                ) : error ? (
                    <div className="text-center py-16 text-red-500 bg-red-50 m-4 rounded-3xl">
                        <p className="text-5xl mb-3">🛑</p>
                        <p className="font-bold text-lg max-w-sm mx-auto">{error}</p>
                    </div>
                ) : members.length === 0 ? (
                    <div className="text-center py-16 text-muted-foreground">
                        <p className="text-5xl mb-3">🔍</p>
                        <p className="font-bold text-lg">No members found</p>
                    </div>
                ) : (
                    <div>
                        {/* Column headers */}
                        <div className="hidden items-center justify-between border-b bg-white/70 px-5 py-2 sm:flex">
                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">User</span>
                            <div className="grid grid-cols-[160px_72px_80px_84px] gap-3 shrink-0">
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Workspace</span>
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center">Status</span>
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right">Last seen</span>
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right">Joined</span>
                            </div>
                        </div>
                        {members.map((member, i) => (
                            <div
                                key={member.id}
                                className={`flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-muted/20 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4 ${i !== members.length - 1 ? 'border-b' : ''}`}
                            >
                                <button
                                    type="button"
                                    onClick={() => openMemberDetail(member)}
                                    className="flex min-w-0 items-center gap-3 text-left sm:gap-4"
                                    title={`Open member details for ${member.email || member.display_name || member.user_id}`}
                                >
                                    <div className="w-10 h-10 rounded-2xl overflow-hidden border border-border bg-white shadow-sm shrink-0 text-sm flex items-center justify-center">
                                        <img src={resolveApiAssetUrl(member.avatar_url) || '/rooiam-app-white.svg'} alt={member.display_name || member.email || ''} className="h-full w-full object-cover scale-[1.06]" onError={e => { (e.currentTarget as HTMLImageElement).src = '/rooiam-app-white.svg' }} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-bold text-sm flex items-center gap-2 flex-wrap hover:text-primary transition-colors">
                                            {member.display_name || member.email?.split('@')[0] || 'Unknown'}
                                            <WorkspaceRolePill roleCodes={member.role_codes} className="px-2 py-0.5 text-[10px]" />
                                        </p>
                                        <p className="text-xs text-muted-foreground font-mono truncate" title={member.email || ''}>
                                            {member.email}
                                        </p>
                                    </div>
                                </button>
                                <div className="hidden sm:grid sm:grid-cols-[160px_72px_80px_84px] sm:items-center sm:gap-3 shrink-0">
                                    {isPlatformWorkspace(member.organization_slug, member.organization_name) ? (
                                        <div className="flex min-w-0 items-center gap-1 text-left">
                                            <Building2 className="w-3 h-3 shrink-0 text-blue-500" />
                                            <span className="truncate text-xs font-semibold text-foreground">{member.organization_name}</span>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => openWorkspaceAuditLogs(member)}
                                            className="flex min-w-0 items-center gap-1 text-left hover:text-primary transition-colors"
                                            title={`Open workspace overview for ${member.organization_name}`}
                                        >
                                            <Building2 className="w-3 h-3 shrink-0 text-blue-500" />
                                            <span className="truncate text-xs font-semibold text-foreground">{member.organization_name}</span>
                                        </button>
                                    )}
                                    <div className="flex justify-center">
                                        <StatusBadge status={member.status !== 'active' ? 'suspended' : member.membership_status} />
                                    </div>
                                    <div className="text-right">
                                        <span className="text-xs text-muted-foreground font-semibold" title={member.last_seen_at ? new Date(member.last_seen_at).toLocaleString() : 'Never'}>
                                            {formatLastSeen(member.last_seen_at)}
                                        </span>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-xs text-muted-foreground font-semibold">
                                            {new Date(member.created_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                        <PaginationControls
                            page={page}
                            totalItems={total}
                            pageSize={pageSize}
                            label="members"
                            onPageChange={setPage}
                            onPageSizeChange={handlePageSizeChange}
                        />
                    </div>
                )}
            </SectionCard>
        </div>
    )
}
