import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Search, Building2, Users, ArrowUpDown, ShieldCheck } from 'lucide-react'
import { sysAdminApi } from '@/lib/api'
import { resolveApiAssetUrl } from '@/lib/api-base'
import type { AdminUser } from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import PaginationControls from '@/components/ui/PaginationControls'
import PageHeader from '@/components/ui/PageHeader'
import StatusBadge from '@/components/ui/StatusBadge'
import SectionCard from '@/components/ui/SectionCard'
import PlatformRolePill from '@/components/ui/PlatformRolePill'

const DEFAULT_PAGE_SIZE = 50

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

export default function AdminMembers() {
    const navigate = useNavigate()
    const { user: currentUser } = useAuthStore()
    const [users, setUsers] = useState<AdminUser[]>([])
    const [totalUsers, setTotalUsers] = useState(0)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
    const [roleUpdatingId, setRoleUpdatingId] = useState<string | null>(null)
    const [sortBy, setSortBy] = useState<'name' | 'last_seen' | 'joined'>('last_seen')
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

    const handlePageSizeChange = (n: number) => { setPageSize(n); setPage(1) }

    const handleRoleToggle = async (user: AdminUser, e: { stopPropagation: () => void }) => {
        e.stopPropagation()
        const grant = !user.is_superuser
        if (!confirm(`${grant ? 'Grant' : 'Revoke'} platform admin for ${user.display_name || user.email}?`)) return
        setRoleUpdatingId(user.id)
        try {
            const updated = await sysAdminApi.updateUserRole(user.id, grant ? 'platform_admin' : 'user')
            setUsers(prev => prev.map(u => u.id === updated.id ? updated : u))
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to update role.')
        } finally {
            setRoleUpdatingId(null)
        }
    }

    const [focusTick, setFocusTick] = useState(0)

    useEffect(() => {
        const onFocus = () => setFocusTick(t => t + 1)
        globalThis.addEventListener('focus', onFocus)
        return () => globalThis.removeEventListener('focus', onFocus)
    }, [])

    useEffect(() => {
        setLoading(true)
        sysAdminApi.users({ page, page_size: pageSize, search, role: 'platform' })
            .then(result => {
                const sorted = [...result.items].sort((a, b) =>
                    (b.is_platform_owner ? 1 : 0) - (a.is_platform_owner ? 1 : 0)
                )
                setUsers(sorted)
                setTotalUsers(result.total)
            })
            .catch(err => setError(err instanceof Error ? err.message : 'Could not load platform members.'))
            .finally(() => setLoading(false))
    }, [page, pageSize, search, focusTick])

    useEffect(() => { setPage(1) }, [search, statusFilter, sortBy, sortDir])

    const sorted = useMemo(() => {
        const filtered = statusFilter === 'all' ? users : users.filter(u => u.status === statusFilter)
        return [...filtered].sort((a, b) => {
            // Platform owner always first regardless of sort
            if (a.is_platform_owner !== b.is_platform_owner) return a.is_platform_owner ? -1 : 1
            let cmp = 0
            if (sortBy === 'name') {
                cmp = (a.display_name || a.email).localeCompare(b.display_name || b.email)
            } else if (sortBy === 'last_seen') {
                cmp = (a.last_seen_at ?? '').localeCompare(b.last_seen_at ?? '')
            } else if (sortBy === 'joined') {
                cmp = a.created_at.localeCompare(b.created_at)
            }
            return sortDir === 'asc' ? cmp : -cmp
        })
    }, [users, statusFilter, sortBy, sortDir])

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PageHeader
                title="Platform Members"
                description="Platform owners and platform admins who have access to this admin console."
            />

            <SectionCard
                icon={Users}
                title="Platform Members"
                subtitle="All accounts with admin console access."
                tone="violet"
                action={!loading && <span className="cute-badge bg-secondary text-secondary-foreground">{totalUsers} members</span>}
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
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-11 pr-4 py-2.5 bg-card border-2 border-border rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary transition-all"
                        />
                    </div>
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value as 'all' | 'active' | 'suspended')}
                        className="px-4 py-2.5 bg-card border-2 border-border rounded-2xl text-sm font-bold outline-none"
                    >
                        <option value="all">All statuses</option>
                        <option value="active">Active</option>
                        <option value="suspended">Suspended</option>
                    </select>
                    <div className="flex items-center gap-1">
                        <select
                            value={sortBy}
                            onChange={e => setSortBy(e.target.value as typeof sortBy)}
                            className="px-3 py-2.5 bg-card border-2 border-border rounded-2xl text-sm font-bold outline-none"
                        >
                            <option value="name">Name</option>
                            <option value="last_seen">Last seen</option>
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
                        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading directory…
                    </div>
                ) : error ? (
                    <div className="text-center py-16 text-red-500 bg-red-50 m-4 rounded-3xl">
                        <p className="text-5xl mb-3">🛑</p>
                        <p className="font-bold text-lg max-w-sm mx-auto">{error}</p>
                    </div>
                ) : users.length === 0 ? (
                    <div className="text-center py-16 text-muted-foreground">
                        <p className="text-5xl mb-3">🔍</p>
                        <p className="font-bold text-lg">No users found</p>
                    </div>
                ) : (
                    <div>
                        {/* Column headers */}
                        <div className="hidden items-center justify-between border-b bg-white/70 px-5 py-2 sm:flex">
                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">User</span>
                            <div className="grid grid-cols-[200px_90px_90px_120px] gap-4 shrink-0">
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Workspace</span>
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center">Status</span>
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right">Last seen</span>
                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right">Role</span>
                            </div>
                        </div>
                        {sorted.map((user, i) => (
                            <div
                                key={user.id}
                                className={`flex cursor-pointer flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-muted/20 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4 ${i !== sorted.length - 1 ? 'border-b' : ''}`}
                                onClick={() => navigate(`/admin/members/${user.id}`)}
                            >
                                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                                    <div className="w-10 h-10 rounded-2xl overflow-hidden border border-border bg-white shadow-sm shrink-0 text-sm flex items-center justify-center">
                                        <img src={resolveApiAssetUrl(user.avatar_url) || '/rooiam-app-white.svg'} alt={user.display_name || user.email} className="h-full w-full object-cover scale-[1.06]" onError={e => { (e.currentTarget as HTMLImageElement).src = '/rooiam-app-white.svg' }} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-bold text-sm flex items-center gap-2 flex-wrap">
                                            {user.display_name || user.email.split('@')[0]}
                                                <PlatformRolePill user={user} className="px-2 py-0.5 text-[10px]" />
                                        </p>
                                        <p className="text-xs text-muted-foreground font-mono truncate" title={user.email}>
                                            {user.email}
                                        </p>
                                    </div>
                                </div>
                                <div className="hidden sm:grid sm:grid-cols-[200px_90px_90px_120px] sm:items-center sm:gap-4 shrink-0">
                                    {/* Workspace column */}
                                    <div>
                                        {user.workspace_count > 0 ? (
                                            <div className="flex items-center gap-2 rounded-2xl border border-border bg-white/70 px-2.5 py-1.5">
                                                <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full border border-border bg-white shadow-sm flex items-center justify-center">
                                                    {resolveApiAssetUrl(user.primary_workspace_icon_url) ? (
                                                        <img
                                                            src={resolveApiAssetUrl(user.primary_workspace_icon_url)}
                                                            alt={user.primary_workspace_name || user.primary_workspace_slug || 'Workspace'}
                                                            className="h-full w-full rounded-full object-cover"
                                                        />
                                                    ) : (
                                                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="max-w-[120px] truncate text-xs font-bold text-foreground" title={user.primary_workspace_name || user.primary_workspace_slug || ''}>
                                                        {user.primary_workspace_name || user.primary_workspace_slug}
                                                    </p>
                                                    <p className="text-[11px] font-semibold text-muted-foreground">
                                                        {user.workspace_count} {user.workspace_count === 1 ? 'workspace' : 'workspaces'}
                                                    </p>
                                                </div>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-muted-foreground font-medium">—</span>
                                        )}
                                    </div>
                                    {/* Status column */}
                                    <div className="flex justify-center">
                                        <StatusBadge status={user.status} />
                                    </div>
                                    {/* Last seen column */}
                                    <div className="text-right">
                                        <span className="text-xs text-muted-foreground font-semibold" title={user.last_seen_at ? new Date(user.last_seen_at).toLocaleString() : 'Never'}>
                                            {formatLastSeen(user.last_seen_at)}
                                        </span>
                                    </div>
                                    {/* Role action column */}
                                    <div className="flex justify-end">
                                        {currentUser?.is_platform_owner && !user.is_platform_owner && user.id !== currentUser?.id ? (
                                            <button
                                                type="button"
                                                onClick={e => handleRoleToggle(user, e)}
                                                disabled={roleUpdatingId === user.id}
                                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-colors disabled:opacity-50 ${
                                                    user.is_superuser
                                                        ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                                                        : 'border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100'
                                                }`}
                                            >
                                                {roleUpdatingId === user.id
                                                    ? <Loader2 className="w-3 h-3 animate-spin" />
                                                    : <ShieldCheck className="w-3 h-3" />}
                                                {user.is_superuser ? 'Revoke' : 'Grant'}
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        ))}
                        <PaginationControls
                            page={page}
                            totalItems={totalUsers}
                            pageSize={pageSize}
                            label="users"
                            onPageChange={setPage}
                            onPageSizeChange={handlePageSizeChange}
                        />
                    </div>
                )}
            </SectionCard>
        </div>
    )
}
