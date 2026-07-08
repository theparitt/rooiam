import React from 'react'
import { ArrowLeft, Clock3, Loader2, ShieldCheck, UserRound } from 'lucide-react'
import { apiFetch, getApiBase, resolveApiAssetUrl } from '../../lib/api-base'
import { portalRoutes } from '../../lib/routes'
import type { Organization, OrganizationActivityItem, OrganizationMember } from '../../lib/portal-types'
import PortalAuditEventItem from '../../components/portal/PortalAuditEventItem'
import PortalPageHeader from '../../components/portal/PortalPageHeader'
import PortalSectionCard from '../../components/portal/PortalSectionCard'
import PortalPaginationControls from '../../components/portal/PortalPaginationControls'
import PortalPill from '../../components/portal/PortalPill'
import PortalWorkspaceRolePill from '../../components/portal/PortalWorkspaceRolePill'

type Props = {
    currentOrg: Organization | null
    member: OrganizationMember | null
    activity: OrganizationActivityItem[]
    activityLoaded: boolean
    canViewActivity: boolean
    onBack: () => void
}

const ACTIVITY_PAGE_SIZE = 8

export default function PortalMemberDetail({
    currentOrg,
    member,
    activity: _activity,
    activityLoaded: _activityLoaded,
    canViewActivity,
    onBack,
}: Props) {
    const API = getApiBase()
    const [activityPage, setActivityPage] = React.useState(1)
    const [memberActivity, setMemberActivity] = React.useState<OrganizationActivityItem[]>([])
    const [memberActivityTotal, setMemberActivityTotal] = React.useState(0)
    const [memberActivityLoading, setMemberActivityLoading] = React.useState(false)
    const [memberActivityError, setMemberActivityError] = React.useState('')

    React.useEffect(() => {
        setActivityPage(1)
    }, [member?.id])

    React.useEffect(() => {
        if (!member || !canViewActivity) {
            setMemberActivity([])
            setMemberActivityTotal(0)
            setMemberActivityError('')
            setMemberActivityLoading(false)
            return
        }

        const controller = new AbortController()
        const searchTerm = (member.email || member.user_id || '').trim()
        const params = new URLSearchParams({
            page: String(activityPage),
            page_size: String(ACTIVITY_PAGE_SIZE),
        })
        if (searchTerm) params.set('search', searchTerm)

        setMemberActivityLoading(true)
        setMemberActivityError('')

        apiFetch(`${API}/orgs/tenant/activity?${params}`, {
            signal: controller.signal,
        })
            .then(async res => {
                const data = await res.json().catch(() => ({}))
                if (!res.ok) {
                    throw new Error(data?.error?.message || 'Could not load member audit logs.')
                }
                setMemberActivity(Array.isArray(data.items) ? data.items : [])
                setMemberActivityTotal(typeof data.total === 'number' ? data.total : 0)
            })
            .catch(err => {
                if (err.name !== 'AbortError') {
                    setMemberActivity([])
                    setMemberActivityTotal(0)
                    setMemberActivityError(err instanceof Error ? err.message : 'Could not load member audit logs.')
                }
            })
            .finally(() => setMemberActivityLoading(false))

        return () => controller.abort()
    }, [API, activityPage, canViewActivity, member])

    if (!member) {
        return (
            <div className="space-y-5 sm:space-y-6 animate-slide-up">
                <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex items-center gap-2 rounded-2xl border border-border bg-white px-4 py-2 text-xs font-black text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Members
                </button>
                <div className="glass-card rounded-4xl px-6 py-16 text-center text-muted-foreground">
                    <p className="text-lg font-black">Member not found</p>
                </div>
            </div>
        )
    }

    const avatarSrc = resolveApiAssetUrl(member.avatar_url) || '/rooiam-app-white.svg'
    const name = member.display_name || member.email || member.user_id

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-2 rounded-2xl border border-border bg-white px-4 py-2 text-xs font-black text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
                <ArrowLeft className="h-4 w-4" />
                Back to Members
            </button>

            <PortalPageHeader
                title={name}
                description={`Workspace member details for ${currentOrg?.name || 'the active workspace'}.`}
            />

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
                <PortalSectionCard
                    icon={UserRound}
                    title="Member Summary"
                    subtitle="Identity, role, and workspace access for this member."
                    tone="indigo"
                >
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border border-border bg-white shadow-sm">
                            <img src={avatarSrc} alt={name} className="h-full w-full object-cover scale-[1.06]" />
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap gap-2">
                                <PortalWorkspaceRolePill roleCodes={member.role_codes} roleNames={member.role_names} />
                                <PortalPill tone={member.status === 'active' ? 'green' : 'amber'}>
                                    {member.status}
                                </PortalPill>
                            </div>
                            {member.email ? (
                                <p className="text-sm font-semibold text-muted-foreground">{member.email}</p>
                            ) : null}
                            <p className="text-xs font-semibold text-muted-foreground">
                                Joined {new Date(member.created_at).toLocaleString()}
                            </p>
                        </div>
                    </div>
                </PortalSectionCard>

                <PortalSectionCard
                    icon={ShieldCheck}
                    title="Workspace Access"
                    subtitle="Current access level for this member in the active workspace."
                    tone="emerald"
                >
                    <div className="space-y-3">
                        <div className="flex items-center justify-between rounded-2xl border border-border bg-white/80 px-4 py-3">
                            <span className="text-sm font-bold text-foreground">Workspace</span>
                            {currentOrg?.slug ? (
                                <a
                                    href={portalRoutes.workspaceOverview(currentOrg.slug)}
                                    className="text-sm font-black text-foreground transition-colors hover:text-sky-700"
                                    title={`Open workspace overview for ${currentOrg.name}`}
                                >
                                    {currentOrg.name}
                                </a>
                            ) : (
                                <span className="text-sm font-black text-foreground">Current workspace</span>
                            )}
                        </div>
                        <div className="flex items-center justify-between rounded-2xl border border-border bg-white/80 px-4 py-3">
                            <span className="text-sm font-bold text-foreground">Primary Role</span>
                            <PortalWorkspaceRolePill
                                roleCodes={member.role_codes}
                                roleNames={member.role_names}
                            />
                        </div>
                        <div className="flex items-center justify-between rounded-2xl border border-border bg-white/80 px-4 py-3">
                            <span className="text-sm font-bold text-foreground">Status</span>
                            <PortalPill tone={member.status === 'active' ? 'green' : 'amber'}>
                                {member.status}
                            </PortalPill>
                        </div>
                    </div>
                </PortalSectionCard>
            </div>

            <PortalSectionCard
                icon={Clock3}
                title="Member Audit Logs"
                subtitle="Audit logs performed by or associated with this member."
                tone="amber"
                bodyClassName="p-3 sm:p-4"
            >
                {!canViewActivity ? (
                    <div className="px-5 py-12 text-center text-muted-foreground">
                        <p className="font-bold">You do not have permission to view audit logs.</p>
                    </div>
                ) : memberActivityLoading ? (
                    <div className="px-5 py-12 text-center text-muted-foreground">
                        <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" />
                        <p className="font-bold">Loading member audit logs</p>
                    </div>
                ) : memberActivityError ? (
                    <div className="rounded-3xl border border-rose-200 bg-rose-50/80 px-5 py-6 text-center text-rose-700">
                        <p className="text-lg font-black">Member audit logs unavailable</p>
                        <p className="mt-2 text-sm font-semibold">{memberActivityError}</p>
                    </div>
                ) : memberActivity.length === 0 ? (
                    <div className="px-5 py-12 text-center text-muted-foreground">
                        <p className="font-bold">No audit logs found for this member</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {memberActivity.map((item) => (
                            <PortalAuditEventItem key={item.id} item={item} compact />
                        ))}
                        <PortalPaginationControls
                            page={activityPage}
                            totalItems={memberActivityTotal}
                            pageSize={ACTIVITY_PAGE_SIZE}
                            label="events"
                            onPageChange={setActivityPage}
                        />
                    </div>
                )}
            </PortalSectionCard>
        </div>
    )
}
