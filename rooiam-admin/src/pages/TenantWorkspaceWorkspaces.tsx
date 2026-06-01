import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUpDown, Loader2, Search, Users, Building2 } from 'lucide-react'
import { sysAdminApi } from '@/lib/api'
import { resolveApiAssetUrl } from '@/lib/api-base'
import type { AdminOrg } from '@/lib/api'
import { WORKSPACE_LABEL_PLURAL, WORKSPACE_LABEL_PLURAL_LOWER } from '@/lib/domain-labels'
import PaginationControls from '@/components/ui/PaginationControls'
import PageHeader from '@/components/ui/PageHeader'
import SectionCard from '@/components/ui/SectionCard'
import StatusBadge from '@/components/ui/StatusBadge'

const DEFAULT_PAGE_SIZE = 50

const AVATAR_COLORS = [
    'from-pink-200 to-rose-200 text-rose-900 border-rose-100',
    'from-purple-200 to-violet-200 text-violet-900 border-violet-100',
    'from-blue-200 to-sky-200 text-sky-900 border-sky-100',
    'from-emerald-200 to-teal-200 text-teal-900 border-teal-100',
    'from-amber-200 to-orange-200 text-orange-900 border-orange-100',
]

function isPlatformWorkspace(org: Pick<AdminOrg, 'slug' | 'name'>): boolean {
    return org.slug.trim().toLowerCase() === 'rooiam' || org.name.trim().toLowerCase() === 'rooiam'
}

export default function TenantWorkspaceWorkspaces() {
    const navigate = useNavigate()
    const [orgs, setOrgs] = useState<AdminOrg[]>([])
    const [totalOrgs, setTotalOrgs] = useState(0)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

    const [sortBy, setSortBy] = useState<'name' | 'created' | 'members'>('created')
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

    const handlePageSizeChange = (n: number) => { setPageSize(n); setPage(1) }

    useEffect(() => {
        setLoading(true)
        sysAdminApi.organizations({ page, page_size: pageSize, search })
            .then(result => {
                setOrgs(result.items)
                setTotalOrgs(result.total)
            })
            .catch(err => setError(err instanceof Error ? err.message : `Could not load ${WORKSPACE_LABEL_PLURAL_LOWER}.`))
            .finally(() => setLoading(false))
    }, [page, pageSize, search])

    useEffect(() => { setPage(1) }, [search, sortBy, sortDir])

    const paged = useMemo(() => {
        return [...orgs].sort((a, b) => {
            let cmp = 0
            if (sortBy === 'name') cmp = a.name.localeCompare(b.name)
            else if (sortBy === 'created') cmp = a.created_at.localeCompare(b.created_at)
            else if (sortBy === 'members') cmp = a.member_count - b.member_count
            return sortDir === 'asc' ? cmp : -cmp
        })
    }, [orgs, sortBy, sortDir])

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PageHeader
                title={`Tenant ${WORKSPACE_LABEL_PLURAL}`}
                description={`All ${WORKSPACE_LABEL_PLURAL_LOWER} registered on the platform.`}
            />

            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder={`Search ${WORKSPACE_LABEL_PLURAL_LOWER}…`}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 bg-card border-2 border-border rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary transition-all"
                    />
                </div>
                <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as typeof sortBy)}
                    className="px-3 py-2.5 bg-card border-2 border-border rounded-2xl text-sm font-bold outline-none"
                >
                    <option value="name">Name</option>
                    <option value="created">Created</option>
                    <option value="members">Members</option>
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

            <SectionCard
                icon={Building2}
                title={`Tenant ${WORKSPACE_LABEL_PLURAL}`}
                subtitle={`All ${WORKSPACE_LABEL_PLURAL_LOWER} registered on the platform.`}
                tone="emerald"
                action={!loading && <span className="cute-badge bg-secondary text-secondary-foreground">{totalOrgs} total</span>}
                bodyClassName="p-0"
            >
                {loading ? (
                    <div className="flex items-center justify-center py-16 text-muted-foreground">
                        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading {WORKSPACE_LABEL_PLURAL_LOWER}…
                    </div>
                ) : error ? (
                    <div className="text-center py-16 text-red-500 bg-red-50 m-4 rounded-3xl">
                        <p className="text-5xl mb-3">🛑</p>
                        <p className="font-bold text-lg max-w-sm mx-auto">{error}</p>
                    </div>
                ) : orgs.length === 0 ? (
                    <div className="text-center py-16 text-muted-foreground">
                        <p className="text-5xl mb-3">
                            <Building2 className="w-12 h-12 mx-auto opacity-20" />
                        </p>
                        <p className="font-bold text-lg">No {WORKSPACE_LABEL_PLURAL_LOWER} found</p>
                    </div>
                ) : (
                    <div>
                        {paged.map((org, i) => {
                            const color = AVATAR_COLORS[i % AVATAR_COLORS.length]
                            const iconSrc = resolveApiAssetUrl(org.icon_url)
                            return (
                                <div
                                    key={org.id}
                                    className={`flex flex-col gap-3 px-4 py-3.5 transition-colors ${isPlatformWorkspace(org) ? '' : 'cursor-pointer hover:bg-muted/20'} sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4 ${i !== paged.length - 1 ? 'border-b' : ''}`}
                                    onClick={() => {
                                        if (isPlatformWorkspace(org)) return
                                        navigate(`/tenant-workspace/workspaces/${org.id}`)
                                    }}
                                >
                                    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                                        <div className={`w-10 h-10 bg-gradient-to-br ${color} flex items-center justify-center font-black shadow-sm border shrink-0 text-sm overflow-hidden rounded-full`}>
                                            {iconSrc ? (
                                                <img
                                                    src={iconSrc}
                                                    alt={org.name}
                                                    className="h-full w-full rounded-full object-cover"
                                                    onError={(event) => {
                                                        event.currentTarget.style.display = 'none'
                                                        const fallback = event.currentTarget.nextElementSibling as HTMLElement | null
                                                        if (fallback) fallback.style.display = 'flex'
                                                    }}
                                                />
                                            ) : null}
                                            <span style={{ display: iconSrc ? 'none' : 'flex' }} className="h-full w-full items-center justify-center">
                                                {org.name.charAt(0).toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-bold text-sm">{org.name}</p>
                                            <p className="text-xs text-muted-foreground font-mono truncate" title={org.slug}>
                                                {org.slug}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="hidden sm:grid sm:grid-cols-[90px_90px_90px] sm:items-center sm:gap-4 shrink-0">
                                        {/* Member count column */}
                                        <div className="flex justify-center">
                                            <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                                                <Users className="w-3.5 h-3.5" />
                                                {org.member_count}
                                            </span>
                                        </div>
                                        {/* Status column */}
                                        <div className="flex justify-center">
                                            <StatusBadge status={org.status} />
                                        </div>
                                        {/* Date column */}
                                        <div className="text-right">
                                            <span className="text-xs text-muted-foreground font-semibold">
                                                {new Date(org.created_at).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                        <PaginationControls
                            page={page}
                            totalItems={totalOrgs}
                            pageSize={pageSize}
                            label={WORKSPACE_LABEL_PLURAL_LOWER}
                            onPageChange={setPage}
                            onPageSizeChange={handlePageSizeChange}
                        />
                    </div>
                )}
            </SectionCard>
        </div>
    )
}
