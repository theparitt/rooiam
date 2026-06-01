import React from 'react'
import { AppWindow, ArrowUpDown, Loader2, Plus } from 'lucide-react'
import PortalClientCard from '../../components/portal/PortalClientCard'
import PortalEmptyState from '../../components/portal/PortalEmptyState'
import PortalFilterBar from '../../components/portal/PortalFilterBar'
import PortalPageHeader from '../../components/portal/PortalPageHeader'
import PortalPaginationControls from '../../components/portal/PortalPaginationControls'
import PortalPrimaryActionButton from '../../components/portal/PortalPrimaryActionButton'
import PortalSearchField from '../../components/portal/PortalSearchField'
import PortalSectionCard from '../../components/portal/PortalSectionCard'
import { APP_LABEL_PLURAL, APP_LABEL_PLURAL_LOWER } from '../../lib/domain-labels'
import { OrgClient } from '../../lib/portal-types'

const DEFAULT_PAGE_SIZE = 20

type Props = {
    apps: OrgClient[]
    loading?: boolean
    canManageApps: boolean
    maxAppsPerWorkspace: number | null
    maxRedirectUrisPerApp: number | null
    maxAllowedEmbedOriginsPerApp: number | null
    deletingAppId: string | null
    rotatingAppId: string | null
    statusUpdatingAppId: string | null
    onDeleteApp: (appId: string) => void
    onRotateAppSecret: (appId: string) => void
    onToggleAppStatus: (appId: string) => void
    onOpenApp: (appId: string) => void
    onOpenRegisterApp: () => void
}

export default function PortalWorkspaceApps({
    apps,
    loading = false,
    canManageApps,
    maxAppsPerWorkspace,
    maxRedirectUrisPerApp,
    maxAllowedEmbedOriginsPerApp,
    deletingAppId,
    rotatingAppId,
    statusUpdatingAppId,
    onDeleteApp,
    onRotateAppSecret,
    onToggleAppStatus,
    onOpenApp,
    onOpenRegisterApp,
}: Props) {
    const [search, setSearch] = React.useState('')
    const [typeFilter, setTypeFilter] = React.useState('all')
    const [sortBy, setSortBy] = React.useState<'name' | 'created'>('created')
    const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc')
    const [page, setPage] = React.useState(1)
    const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE)
    const workspaceAppLimitReached = typeof maxAppsPerWorkspace === 'number' && apps.length >= maxAppsPerWorkspace
    const handlePageSizeChange = (n: number) => { setPageSize(n); setPage(1) }
    const filteredApps = React.useMemo(() => {
        const query = search.trim().toLowerCase()
        const filtered = apps.filter(entry => {
            const haystack = [
                entry.client.app_name,
                entry.client.app_type,
                entry.client.client_id,
                ...entry.redirect_uris,
            ].join(' ').toLowerCase()

            const matchesSearch = !query || haystack.includes(query)
            const matchesType = typeFilter === 'all' || entry.client.app_type === typeFilter
            return matchesSearch && matchesType
        })
        return [...filtered].sort((a, b) => {
            let cmp = 0
            if (sortBy === 'name') cmp = a.client.app_name.localeCompare(b.client.app_name)
            else cmp = a.client.created_at.localeCompare(b.client.created_at)
            return sortDir === 'asc' ? cmp : -cmp
        })
    }, [apps, search, typeFilter, sortBy, sortDir])

    React.useEffect(() => {
        setPage(1)
    }, [search, typeFilter, sortBy, sortDir])

    const pagedApps = React.useMemo(() => {
        const start = (page - 1) * pageSize
        return filteredApps.slice(start, start + pageSize)
    }, [filteredApps, page, pageSize])

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PortalPageHeader
                eyebrow="Workspace"
                title={`Workspace ${APP_LABEL_PLURAL}`}
                description="App inventory for this workspace. Click an app to open its overview page with app info and app-specific audit logs."
                actions={canManageApps ? (
                    <PortalPrimaryActionButton
                        label="Register App"
                        icon={Plus}
                        onClick={onOpenRegisterApp}
                        disabled={workspaceAppLimitReached}
                    />
                ) : undefined}
            />

            <PortalSectionCard
                icon={AppWindow}
                title={`All ${APP_LABEL_PLURAL}`}
                action={
                    <span className="cute-badge bg-primary/10 text-primary-foreground">
                        {typeof maxAppsPerWorkspace === 'number'
                            ? `${apps.length} / ${maxAppsPerWorkspace} apps`
                            : `${filteredApps.length} total`}
                    </span>
                }
                className="rounded-4xl"
                bodyClassName="p-0"
            >
                {typeof maxAppsPerWorkspace === 'number' ? (
                    <div className="border-b px-4 py-3 text-xs font-semibold text-muted-foreground">
                        This workspace can register up to {maxAppsPerWorkspace} apps. {apps.length} currently exist.
                        {workspaceAppLimitReached ? ' The limit has been reached.' : null}
                        {(typeof maxRedirectUrisPerApp === 'number' || typeof maxAllowedEmbedOriginsPerApp === 'number') ? (
                            <>
                                {' '}Each app may use up to {maxRedirectUrisPerApp ?? '—'} redirect URIs and {maxAllowedEmbedOriginsPerApp ?? '—'} allowed embed origins.
                            </>
                        ) : null}
                    </div>
                ) : null}
                <PortalFilterBar>
                    <PortalSearchField
                        value={search}
                        onChange={setSearch}
                        placeholder={`Search ${APP_LABEL_PLURAL_LOWER}`}
                    />
                        <div className="flex flex-wrap items-center gap-2">
                            <select
                                value={typeFilter}
                                onChange={e => setTypeFilter(e.target.value)}
                                className="rounded-2xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-foreground outline-none transition-all focus:ring-2 focus:ring-primary"
                            >
                                <option value="all">All types</option>
                                <option value="spa">SPA</option>
                                <option value="web">Web</option>
                                <option value="native">Native</option>
                            </select>
                            <div className="flex items-center gap-1">
                                <select
                                    value={sortBy}
                                    onChange={e => setSortBy(e.target.value as typeof sortBy)}
                                    className="rounded-2xl border border-border bg-white px-3 py-2.5 text-sm font-bold outline-none"
                                >
                                    <option value="name">Name</option>
                                    <option value="created">Created</option>
                                </select>
                                <button
                                    type="button"
                                    onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                                    className="rounded-2xl border border-border bg-white p-2.5 transition-colors hover:bg-muted/20"
                                    title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
                                >
                                    <ArrowUpDown className={`h-4 w-4 transition-transform ${sortDir === 'asc' ? 'rotate-180' : ''}`} />
                                </button>
                            </div>
                        </div>
                </PortalFilterBar>
                {loading ? (
                    <div className="px-4 py-16 text-center text-muted-foreground">
                        <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" />
                        <p className="text-sm font-bold">{`Loading ${APP_LABEL_PLURAL_LOWER}`}</p>
                    </div>
                ) : filteredApps.length === 0 ? (
                    <div className="p-4 sm:p-5">
                        <PortalEmptyState
                            icon={AppWindow}
                            title={`No ${APP_LABEL_PLURAL_LOWER} found`}
                            description="Register your first app to issue client IDs, redirect URIs, and audit events for this workspace."
                        />
                    </div>
                ) : (
                    <>
                        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-2">
                            {pagedApps.map(entry => (
                                <PortalClientCard
                                    key={entry.client.id}
                                    entry={entry}
                                    canManage={canManageApps}
                                    deleting={deletingAppId === entry.client.id}
                                    rotating={rotatingAppId === entry.client.id}
                                    statusUpdating={statusUpdatingAppId === entry.client.id}
                                    onDelete={onDeleteApp}
                                    onOpenDetail={onOpenApp}
                                    onRotateSecret={onRotateAppSecret}
                                    onToggleStatus={onToggleAppStatus}
                                />
                            ))}
                        </div>
                        <PortalPaginationControls
                            page={page}
                            totalItems={filteredApps.length}
                            pageSize={pageSize}
                            label={APP_LABEL_PLURAL_LOWER}
                            onPageChange={setPage}
                            onPageSizeChange={handlePageSizeChange}
                        />
                    </>
                )}
            </PortalSectionCard>
        </div>
    )
}
