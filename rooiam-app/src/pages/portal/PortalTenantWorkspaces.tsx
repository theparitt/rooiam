import React from 'react'
import { Building2, CheckCircle2, Loader2, Plus } from 'lucide-react'

function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
import PortalCreateFormLayout from '../../components/portal/PortalCreateFormLayout'
import PortalEmptyState from '../../components/portal/PortalEmptyState'
import PortalFilterBar from '../../components/portal/PortalFilterBar'
import PortalPageHeader from '../../components/portal/PortalPageHeader'
import PortalPaginationControls from '../../components/portal/PortalPaginationControls'
import PortalPrimaryActionButton from '../../components/portal/PortalPrimaryActionButton'
import PortalSearchField from '../../components/portal/PortalSearchField'
import PortalSectionCard from '../../components/portal/PortalSectionCard'
import PortalPill from '../../components/portal/PortalPill'
import PortalHintBox from '../../components/portal/PortalHintBox'
import PortalReadonlyNotice from '../../components/portal/PortalReadonlyNotice'
import { resolveApiAssetUrl } from '../../lib/api-base'
import { WORKSPACE_LABEL, WORKSPACE_LABEL_LOWER, WORKSPACE_LABEL_PLURAL, WORKSPACE_LABEL_PLURAL_LOWER } from '../../lib/domain-labels'
import { DEFAULT_BRAND, Organization, PortalResponse } from '../../lib/portal-types'

const DEFAULT_PAGE_SIZE = 20

type Props = {
    portal: PortalResponse | null
    demoMode?: boolean
    currentOrg: Organization | null
    canCreateWorkspace: boolean
    onSwitchWorkspace: (orgId: string) => void
    createWorkspaceName: string
    setCreateWorkspaceName: (v: string) => void
    createWorkspaceSlug: string
    setCreateWorkspaceSlug: (v: string) => void
    creatingWorkspace: boolean
    createWorkspaceMessage: string
    maxWorkspacesAllowed: number | null
    workspaceLimitReached: boolean
    onCreateWorkspace: (e: React.FormEvent) => void
}

export default function PortalTenantWorkspaces({
    portal,
    demoMode = false,
    currentOrg,
    canCreateWorkspace,
    onSwitchWorkspace,
    createWorkspaceName,
    setCreateWorkspaceName,
    createWorkspaceSlug,
    setCreateWorkspaceSlug,
    creatingWorkspace,
    createWorkspaceMessage,
    maxWorkspacesAllowed,
    workspaceLimitReached,
    onCreateWorkspace,
}: Props) {
    const [showCreate, setShowCreate] = React.useState(false)
    const [search, setSearch] = React.useState('')
    const [page, setPage] = React.useState(1)
    const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE)
    const handlePageSizeChange = (n: number) => { setPageSize(n); setPage(1) }
    const inputClass = 'w-full px-4 py-3 bg-muted/50 border border-border rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary transition-all'
    const labelClass = 'text-xs font-bold text-muted-foreground mb-1.5 block'

    const filteredOrganizations = React.useMemo(() => {
        const query = search.trim().toLowerCase()
        const organizations = portal?.organizations ?? []
        return organizations.filter(org => {
            const haystack = [org.login_display_name || '', org.name, org.slug].join(' ').toLowerCase()
            return !query || haystack.includes(query)
        })
    }, [portal?.organizations, search])

    React.useEffect(() => {
        setPage(1)
    }, [search])

    const pagedOrganizations = React.useMemo(() => {
        const start = (page - 1) * pageSize
        return filteredOrganizations.slice(start, start + pageSize)
    }, [filteredOrganizations, page, pageSize])

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PortalPageHeader
                title={`Tenant ${WORKSPACE_LABEL_PLURAL}`}
                actions={canCreateWorkspace ? (
                    <PortalPrimaryActionButton
                        label={`Add ${WORKSPACE_LABEL}`}
                        icon={Plus}
                        disabled={demoMode || workspaceLimitReached}
                        onClick={() => setShowCreate(v => !v)}
                    />
                ) : undefined}
            />

            {!canCreateWorkspace ? (
                <PortalReadonlyNotice title="Read-only workspace list">
                    <p>
                        Only workspace owners can create additional workspaces from this operator portal.
                    </p>
                </PortalReadonlyNotice>
            ) : null}

            {showCreate && canCreateWorkspace ? (
                <PortalSectionCard
                    icon={Plus}
                    title={`Create ${WORKSPACE_LABEL}`}
                    className="rounded-4xl"
                >
                    <form onSubmit={onCreateWorkspace} className="space-y-4">
                        <PortalCreateFormLayout
                            title={`${WORKSPACE_LABEL} Setup`}
                            subtitle="Create a new workspace name and slug for the owner and admin area."
                        >
                        {demoMode ? (
                            <PortalHintBox level="warning" className="px-4 py-3">
                                Workspace creation is locked in demo mode so the seeded workspace story stays consistent.
                            </PortalHintBox>
                        ) : null}
                        {workspaceLimitReached ? (
                            <PortalHintBox level="warning" className="px-4 py-3">
                                Workspace limit reached.
                                {typeof maxWorkspacesAllowed === 'number' ? ` This account can create up to ${maxWorkspacesAllowed} ${WORKSPACE_LABEL_PLURAL_LOWER}.` : null}
                            </PortalHintBox>
                        ) : null}
                        <div>
                            <label className={labelClass}>{`${WORKSPACE_LABEL} Name`}</label>
                            <input type="text" value={createWorkspaceName} onChange={e => setCreateWorkspaceName(e.target.value)} className={inputClass} placeholder="Acme, Inc." required />
                        </div>
                        <div>
                            <label className={labelClass}>{`${WORKSPACE_LABEL} Slug`}</label>
                            <input type="text" value={createWorkspaceSlug} onChange={e => setCreateWorkspaceSlug(e.target.value.trim().toLowerCase())} className={inputClass} placeholder="acme" required />
                        </div>
                        <div className="flex flex-wrap items-center gap-3 pt-2">
                            <button
                                type="submit"
                                disabled={demoMode || workspaceLimitReached || creatingWorkspace || !createWorkspaceName.trim() || !createWorkspaceSlug.trim()}
                                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 font-bold text-sm rounded-full transition-all hover:scale-105 shadow-md disabled:opacity-50"
                                style={{ background: DEFAULT_BRAND, color: 'hsl(346 60% 25%)' }}
                            >
                                {creatingWorkspace ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                {`Create ${WORKSPACE_LABEL}`}
                            </button>
                            <button type="button" onClick={() => setShowCreate(false)} className="text-sm font-bold text-muted-foreground hover:text-foreground">
                                Cancel
                            </button>
                            {createWorkspaceMessage ? <span className="text-sm font-bold text-emerald-600">{createWorkspaceMessage}</span> : null}
                        </div>
                        </PortalCreateFormLayout>
                    </form>
                </PortalSectionCard>
            ) : null}

            <PortalSectionCard
                icon={Building2}
                title={`All ${WORKSPACE_LABEL_PLURAL}`}
                action={<span className="cute-badge bg-primary/10 text-primary-foreground">{filteredOrganizations.length} total</span>}
                className="rounded-4xl"
                bodyClassName="p-0"
            >
                <PortalFilterBar className="sm:justify-start">
                    <PortalSearchField
                        value={search}
                        onChange={setSearch}
                        placeholder={`Search ${WORKSPACE_LABEL_PLURAL_LOWER}`}
                    />
                </PortalFilterBar>
                {filteredOrganizations.length === 0 ? (
                    <div className="p-4 sm:p-5">
                        <PortalEmptyState
                            icon={Building2}
                            title={`No ${WORKSPACE_LABEL_PLURAL_LOWER} found`}
                            description={`Create a ${WORKSPACE_LABEL_LOWER} to start managing members, apps, and access.`}
                        />
                    </div>
                ) : (
                    <>
                        {/* Column header */}
                        <div className="hidden sm:grid grid-cols-[2fr_1.5fr_1fr_auto] gap-4 px-5 py-2 border-b bg-muted/20">
                            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Workspace</span>
                            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Slug</span>
                            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Created</span>
                            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Status</span>
                        </div>
                        {pagedOrganizations.map(org => {
                            const active = currentOrg?.id === org.id
                            const iconSrc = resolveApiAssetUrl(org.icon_url)
                            return (
                                <div key={org.id} className="grid grid-cols-1 sm:grid-cols-[2fr_1.5fr_1fr_auto] gap-2 sm:gap-4 items-center px-4 sm:px-5 py-3.5 sm:py-4 hover:bg-muted/20 transition-colors border-b">
                                    {/* Name + icon */}
                                    <button
                                        type="button"
                                        onClick={() => onSwitchWorkspace(org.id)}
                                        className="flex items-center gap-3 min-w-0 text-left group"
                                        title={`Open workspace overview for ${org.login_display_name || org.name}`}
                                    >
                                        <div className="w-9 h-9 rounded-full bg-white border border-border flex items-center justify-center shadow-sm shrink-0 overflow-hidden">
                                            {iconSrc ? (
                                                <img src={iconSrc} alt={org.login_display_name || org.name} className="w-full h-full rounded-full object-cover" />
                                            ) : (
                                                <img src="/rooiam-app-white.svg" alt={WORKSPACE_LABEL} className="w-6 h-6 object-contain" />
                                            )}
                                        </div>
                                        <span className="truncate font-bold group-hover:text-sky-700 transition-colors">
                                            {org.login_display_name || org.name}
                                        </span>
                                    </button>

                                    {/* Slug */}
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="sm:hidden text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground shrink-0">Slug:</span>
                                        <span className="truncate text-xs font-mono font-semibold text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-lg">
                                            {org.slug}
                                        </span>
                                    </div>

                                    {/* Created date */}
                                    <div className="flex items-center gap-1.5">
                                        <span className="sm:hidden text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground shrink-0">Created:</span>
                                        <span className="text-xs font-semibold text-muted-foreground">{fmtDate(org.created_at)}</span>
                                    </div>

                                    {/* Status / action */}
                                    <div className="flex items-center gap-2 shrink-0">
                                        {active ? (
                                            <PortalPill tone="green" className="gap-1">
                                                <CheckCircle2 className="h-3.5 w-3.5" />
                                                Active
                                            </PortalPill>
                                        ) : (
                                            <button type="button" onClick={() => onSwitchWorkspace(org.id)} className="cute-badge bg-white shadow-sm text-muted-foreground border cursor-pointer hover:bg-muted/20">
                                                Switch
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </>
                )}
                <PortalPaginationControls
                    page={page}
                    totalItems={filteredOrganizations.length}
                    pageSize={pageSize}
                    label={WORKSPACE_LABEL_PLURAL_LOWER}
                    onPageChange={setPage}
                    onPageSizeChange={handlePageSizeChange}
                />
            </PortalSectionCard>
        </div>
    )
}
