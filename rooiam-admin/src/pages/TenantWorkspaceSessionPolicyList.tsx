import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpDown, Loader2, Search, Shield, Building2 } from 'lucide-react'
import { sysAdminApi } from '@/lib/api'
import { resolveApiAssetUrl } from '@/lib/api-base'
import type { AdminOrg } from '@/lib/api'
import { WORKSPACE_LABEL_PLURAL_LOWER } from '@/lib/domain-labels'
import PaginationControls from '@/components/ui/PaginationControls'
import PageHeader from '@/components/ui/PageHeader'
import SectionCard from '@/components/ui/SectionCard'
import HintBox from '@/components/ui/HintBox'

const DEFAULT_PAGE_SIZE = 50

const AVATAR_COLORS = [
    'from-pink-200 to-rose-200 text-rose-900 border-rose-100',
    'from-purple-200 to-violet-200 text-violet-900 border-violet-100',
    'from-blue-200 to-sky-200 text-sky-900 border-sky-100',
    'from-emerald-200 to-teal-200 text-teal-900 border-teal-100',
    'from-amber-200 to-orange-200 text-orange-900 border-orange-100',
]

export default function TenantWorkspaceSessionPolicyList() {
    const [orgs, setOrgs] = useState<AdminOrg[]>([])
    const [totalOrgs, setTotalOrgs] = useState(0)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
    const [sortBy, setSortBy] = useState<'name' | 'created'>('name')
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

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

    const sorted = useMemo(() => {
        return [...orgs].sort((a, b) => {
            let cmp = 0
            if (sortBy === 'name') cmp = a.name.localeCompare(b.name)
            else if (sortBy === 'created') cmp = a.created_at.localeCompare(b.created_at)
            return sortDir === 'asc' ? cmp : -cmp
        })
    }, [orgs, sortBy, sortDir])

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PageHeader
                eyebrow="Tenant Workspace"
                title="Tenant Workspace Session Policy"
                description={`View platform-governed session and token lifetimes for each ${WORKSPACE_LABEL_PLURAL_LOWER.slice(0, -1)}.`}
            />

            <HintBox tone="sky" title="Workspace end-user policy">
                This page is for workspace end-user session behavior. Tenant operator sessions are configured separately under Tenant Session Policy.
            </HintBox>

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
                icon={Shield}
                title="Tenant Workspace Session Policies"
                subtitle={`Configure session and token lifetimes for each ${WORKSPACE_LABEL_PLURAL_LOWER.slice(0, -1)}.`}
                tone="indigo"
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
                ) : sorted.length === 0 ? (
                    <div className="text-center py-16 text-muted-foreground">
                        <Building2 className="w-12 h-12 mx-auto opacity-20 mb-3" />
                        <p className="font-bold text-lg">No {WORKSPACE_LABEL_PLURAL_LOWER} found</p>
                    </div>
                ) : (
                    <div>
                        {sorted.map((org, i) => {
                            const color = AVATAR_COLORS[i % AVATAR_COLORS.length]
                            const iconSrc = resolveApiAssetUrl(org.icon_url)
                            return (
                                <div
                                    key={org.id}
                                    className={`flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4 ${i !== orgs.length - 1 ? 'border-b' : ''}`}
                                >
                                    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                                        <div className={`w-10 h-10 bg-gradient-to-br ${color} flex items-center justify-center font-black shadow-sm border shrink-0 text-sm overflow-hidden rounded-full`}>
                                            {iconSrc ? (
                                                <img
                                                    src={iconSrc}
                                                    alt={org.name}
                                                    className="h-full w-full rounded-full object-cover"
                                                    onError={e => {
                                                        e.currentTarget.style.display = 'none'
                                                        const fb = e.currentTarget.nextElementSibling as HTMLElement | null
                                                        if (fb) fb.style.display = 'flex'
                                                    }}
                                                />
                                            ) : null}
                                            <span style={{ display: iconSrc ? 'none' : 'flex' }} className="h-full w-full items-center justify-center">
                                                {org.name.charAt(0).toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-bold text-sm">{org.name}</p>
                                            <p className="text-xs text-muted-foreground font-mono truncate">{org.slug}</p>
                                        </div>
                                    </div>
                                    <Link
                                        to={`/tenant-workspace/workspaces/${org.id}/session-policy`}
                                        className="inline-flex items-center gap-1.5 text-xs font-black text-slate-600 hover:text-slate-800 transition-colors self-start sm:self-auto shrink-0"
                                    >
                                        <Shield className="w-3.5 h-3.5" /> View →
                                    </Link>
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
