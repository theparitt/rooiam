import React from 'react'
import { ArrowUpDown, Loader2, Mail, Search, Trash2, Users } from 'lucide-react'
import PortalPageHeader from '../../components/portal/PortalPageHeader'
import PortalMemberDetail from './PortalMemberDetail'
import PortalPaginationControls from '../../components/portal/PortalPaginationControls'
import PortalMemberRow from '../../components/portal/PortalMemberRow'
import PortalSectionCard from '../../components/portal/PortalSectionCard'
import PortalHintBox from '../../components/portal/PortalHintBox'
import { Organization, OrganizationActivityItem, OrganizationInvite, OrganizationMember, OrganizationRole } from '../../lib/portal-types'
import PortalSecondaryActionButton from '../../components/portal/PortalSecondaryActionButton'
import PortalDangerActionButton from '../../components/portal/PortalDangerActionButton'
import PortalReadonlyNotice from '../../components/portal/PortalReadonlyNotice'

type Props = {
    currentOrg: Organization | null
    demoMode?: boolean
    members: OrganizationMember[]
    pendingInvites: OrganizationInvite[]
    loading?: boolean
    invitesLoading?: boolean
    availableRoles: OrganizationRole[]
    canViewMembers: boolean
    canInviteMembers: boolean
    canManageRoles: boolean
    canViewActivity: boolean
    activeBrandColor: string
    selectedMemberId?: string | null
    activity: OrganizationActivityItem[]
    activityLoaded?: boolean
    inviteEmail: string
    setInviteEmail: (v: string) => void
    inviteLoading: boolean
    inviteActionEmail: string | null
    inviteMessage: string
    revokingInviteId: string | null
    roleDrafts: Record<string, string>
    setRoleDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>
    roleSavingMemberId: string | null
    onInviteMember: (e: React.FormEvent) => void
    onResendInvite: (email: string) => void
    onRevokeInvite: (inviteId: string) => void
    onUpdateMemberRole: (memberId: string) => void
    onOpenMember: (memberId: string) => void
    onCloseMemberDetail: () => void
}

const DEFAULT_PAGE_SIZE = 20

export default function PortalWorkspaceMembers({
    currentOrg,
    demoMode = false,
    members,
    pendingInvites,
    loading = false,
    invitesLoading = false,
    availableRoles,
    canViewMembers,
    canInviteMembers,
    canManageRoles,
    canViewActivity,
    activeBrandColor: _activeBrandColor,
    selectedMemberId = null,
    activity,
    activityLoaded = false,
    inviteEmail,
    setInviteEmail,
    inviteLoading,
    inviteActionEmail,
    inviteMessage,
    revokingInviteId,
    roleDrafts,
    setRoleDrafts,
    roleSavingMemberId,
    onInviteMember,
    onResendInvite,
    onRevokeInvite,
    onUpdateMemberRole,
    onOpenMember,
    onCloseMemberDetail,
}: Props) {
    const [search, setSearch] = React.useState('')
    const [statusFilter, setStatusFilter] = React.useState<'all' | 'active'>('all')
    const [roleFilter, setRoleFilter] = React.useState('all')
    const [sortBy, setSortBy] = React.useState<'name' | 'joined'>('joined')
    const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc')
    const [page, setPage] = React.useState(1)
    const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE)
    const handlePageSizeChange = (n: number) => { setPageSize(n); setPage(1) }

    const roleOptions = availableRoles.length > 0
        ? availableRoles
        : [
            { code: 'admin', name: 'Admin' },
            { code: 'member', name: 'User' },
        ]

    const filteredMembers = React.useMemo(() => {
        const filtered = members.filter(member => {
            const haystack = [
                member.display_name,
                member.email,
                member.user_id,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
            const matchesSearch = search.trim() ? haystack.includes(search.trim().toLowerCase()) : true
            const matchesStatus = statusFilter === 'all' ? true : member.status === statusFilter
            const matchesRole = roleFilter === 'all'
                ? true
                : (member.role_codes ?? []).includes(roleFilter)
            return matchesSearch && matchesStatus && matchesRole
        })
        return [...filtered].sort((a, b) => {
            let cmp = 0
            if (sortBy === 'name') {
                cmp = (a.display_name || a.email || '').localeCompare(b.display_name || b.email || '')
            } else if (sortBy === 'joined') {
                cmp = a.created_at.localeCompare(b.created_at)
            }
            return sortDir === 'asc' ? cmp : -cmp
        })
    }, [members, roleFilter, search, statusFilter, sortBy, sortDir])

    const pagedMembers = React.useMemo(() => {
        const start = (page - 1) * pageSize
        return filteredMembers.slice(start, start + pageSize)
    }, [filteredMembers, page, pageSize])

    const selectedMember = React.useMemo(
        () => members.find(member => member.id === selectedMemberId) || null,
        [members, selectedMemberId],
    )
    const hasOwner = React.useMemo(
        () => members.some(member => member.role_codes?.includes('owner')),
        [members],
    )
    const nonOwnerAdminCount = React.useMemo(
        () => members.filter(member => member.role_codes?.includes('admin')).length,
        [members],
    )

    React.useEffect(() => {
        setPage(1)
    }, [search, statusFilter, roleFilter, sortBy, sortDir])

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PortalPageHeader title="Workspace Members" />

            {!currentOrg ? (
                <PortalHintBox tone="violet" title="No workspace selected">
                    Select a workspace first.
                </PortalHintBox>
            ) : !canViewMembers ? (
                <PortalReadonlyNotice>You do not have permission to view members.</PortalReadonlyNotice>
            ) : (
                <>
                    {selectedMember ? (
                        <PortalMemberDetail
                            currentOrg={currentOrg}
                            member={selectedMember}
                            activity={activity}
                            activityLoaded={activityLoaded}
                            canViewActivity={canViewActivity}
                            onBack={onCloseMemberDetail}
                        />
                    ) : (
                        <>
                    <PortalSectionCard
                        icon={Users}
                        title="Invite Members"
                        subtitle="Invite someone by email to join this workspace as a member first. Promote them to Workspace Admin later if needed."
                        action={<span className="cute-badge bg-white shadow-sm text-muted-foreground border">{members.length} members</span>}
                    >
                        <div id="invite-form-section">
                            {demoMode ? (
                                <PortalHintBox level="warning" title="Member management is locked in demo mode">
                                    <p>
                                        Demo keeps invites and role assignments fixed so workspace membership stays predictable while you browse.
                                    </p>
                                </PortalHintBox>
                            ) : !canInviteMembers ? (
                                <PortalReadonlyNotice>You do not have permission to invite members.</PortalReadonlyNotice>
                            ) : (
                                <form onSubmit={onInviteMember} className="space-y-3">
                                    <div>
                                        <label className="text-xs font-bold text-muted-foreground mb-1.5 block">Email address</label>
                                        <input
                                            type="email"
                                            value={inviteEmail}
                                            onChange={e => setInviteEmail(e.target.value)}
                                            placeholder="person@company.com"
                                            className="w-full px-4 py-3 bg-muted/50 border border-border rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary transition-all"
                                        />
                                        <p className="mt-2 text-xs font-semibold text-muted-foreground">
                                            An invitation email will be sent. After they accept, they will appear here as a normal member.
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            type="submit"
                                            disabled={demoMode || inviteLoading || !inviteEmail.trim()}
                                            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 font-bold text-sm rounded-full transition-all hover:scale-105 shadow-md disabled:opacity-50"
                                            style={{ background: 'hsl(346 100% 82%)', color: 'hsl(346 60% 25%)' }}
                                        >
                                            {inviteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                                            Send Member Invite
                                        </button>
                                        {inviteMessage ? (
                                            <p className="text-sm font-bold text-emerald-600">{inviteMessage}</p>
                                        ) : null}
                                    </div>
                                </form>
                            )}
                        </div>
                    </PortalSectionCard>

                    <PortalSectionCard
                        icon={Mail}
                        title="Pending Invitations"
                        subtitle="Invited people who have not accepted yet. Invitations are email-based and expire after 48 hours."
                        action={<span className="cute-badge bg-white shadow-sm text-muted-foreground border">{pendingInvites.length} pending</span>}
                    >
                        {demoMode ? (
                            <PortalHintBox level="warning" title="Invitation management is locked in demo mode">
                                <p>
                                    Demo keeps invitation state fixed so membership stays predictable while you browse.
                                </p>
                            </PortalHintBox>
                        ) : !canInviteMembers ? (
                            <PortalReadonlyNotice>You do not have permission to manage invitations.</PortalReadonlyNotice>
                        ) : invitesLoading ? (
                            <div className="flex items-center justify-center py-12 text-muted-foreground">
                                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading pending invitations…
                            </div>
                        ) : pendingInvites.length === 0 ? (
                            <div className="rounded-3xl border border-dashed border-border bg-muted/10 px-5 py-8 text-center text-muted-foreground">
                                <p className="font-bold text-base">No pending invitations</p>
                                <p className="mt-1 text-sm font-medium">People you invite by email will appear here until they accept or are revoked.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {pendingInvites.map(invite => {
                                    const busyResend = inviteLoading && inviteActionEmail === invite.email.toLowerCase()
                                    const busyRevoke = revokingInviteId === invite.id
                                    return (
                                        <div key={invite.id} className="flex flex-col gap-4 rounded-3xl border border-border bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="min-w-0 space-y-1">
                                                <p className="truncate text-sm font-black text-gray-900">{invite.email}</p>
                                                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
                                                    <span>Invited {new Date(invite.created_at).toLocaleString()}</span>
                                                    <span>•</span>
                                                    <span>Expires {new Date(invite.expires_at).toLocaleString()}</span>
                                                    {(invite.inviter_display_name || invite.inviter_email) ? (
                                                        <>
                                                            <span>•</span>
                                                            <span>
                                                                By {invite.inviter_display_name || invite.inviter_email}
                                                            </span>
                                                        </>
                                                    ) : null}
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <PortalSecondaryActionButton
                                                    label="Resend"
                                                    icon={busyResend ? Loader2 : Mail}
                                                    onClick={() => onResendInvite(invite.email)}
                                                    disabled={busyResend || busyRevoke}
                                                    className={busyResend ? '[&>svg]:animate-spin' : ''}
                                                />
                                                <PortalDangerActionButton
                                                    label="Revoke"
                                                    icon={busyRevoke ? Loader2 : Trash2}
                                                    onClick={() => onRevokeInvite(invite.id)}
                                                    disabled={busyResend || busyRevoke}
                                                    className={busyRevoke ? '[&>svg]:animate-spin' : ''}
                                                />
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </PortalSectionCard>

                    <PortalSectionCard
                        icon={Users}
                        title="Workspace Members"
                        subtitle="All members of this workspace and their roles."
                        action={<span className="cute-badge bg-secondary text-secondary-foreground">{members.length} members</span>}
                        bodyClassName="p-0"
                    >
                        {loading ? (
                            <div className="text-center py-16 text-muted-foreground">
                                <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" />
                                <p className="font-bold text-lg">Loading members</p>
                            </div>
                        ) : members.length === 0 ? (
                            <div className="text-center py-16 text-muted-foreground">
                                <p className="text-5xl mb-3">👥</p>
                                <p className="font-bold text-lg">No members yet</p>
                                <p className="text-sm mt-1">Invite someone to get started.</p>
                            </div>
                        ) : (
                            <div>
                                <div className="border-b bg-muted/10 px-4 py-4 sm:px-5">
                                    <div className="flex flex-col gap-3 lg:flex-row">
                                        <div className="relative flex-1">
                                            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                            <input
                                                type="text"
                                                value={search}
                                                onChange={e => setSearch(e.target.value)}
                                                placeholder="Search members"
                                                className="w-full rounded-2xl border border-border bg-white py-3 pl-11 pr-4 text-sm font-medium outline-none transition-all focus:ring-2 focus:ring-primary"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-3 sm:flex-row">
                                            <select
                                                value={roleFilter}
                                                onChange={e => setRoleFilter(e.target.value)}
                                                className="rounded-2xl border border-border bg-white px-4 py-3 text-sm font-bold outline-none"
                                            >
                                                <option value="all">All roles</option>
                                                {roleOptions.map(role => (
                                                    <option key={role.code} value={role.code}>{role.name}</option>
                                                ))}
                                            </select>
                                            <select
                                                value={statusFilter}
                                                onChange={e => setStatusFilter(e.target.value as 'all' | 'active')}
                                                className="rounded-2xl border border-border bg-white px-4 py-3 text-sm font-bold outline-none"
                                            >
                                                <option value="all">All statuses</option>
                                                <option value="active">Active</option>
                                            </select>
                                            <div className="flex items-center gap-1">
                                                <select
                                                    value={sortBy}
                                                    onChange={e => setSortBy(e.target.value as typeof sortBy)}
                                                    className="rounded-2xl border border-border bg-white px-3 py-2.5 text-sm font-bold outline-none"
                                                >
                                                    <option value="name">Name</option>
                                                    <option value="joined">Joined</option>
                                                </select>
                                                <button
                                                    type="button"
                                                    onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                                                    className="p-2.5 border border-border bg-white rounded-2xl hover:bg-muted/20 transition-colors"
                                                    title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
                                                >
                                                    <ArrowUpDown className={`w-4 h-4 transition-transform ${sortDir === 'asc' ? 'rotate-180' : ''}`} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {filteredMembers.length === 0 ? (
                                    <div className="text-center py-16 text-muted-foreground">
                                        <p className="text-5xl mb-3">👥</p>
                                        <p className="font-bold text-lg">No matching members</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Column headers — must mirror PortalMemberRow right-grid exactly */}
                                        <div className="hidden sm:flex items-center gap-4 px-5 py-2 border-b bg-muted/5">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex-1 min-w-0">User</span>
                                            <div className="grid grid-cols-[72px_80px_84px_200px] gap-4 shrink-0">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center">Status</span>
                                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right">Last seen</span>
                                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right">Joined</span>
                                                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right">Role</span>
                                            </div>
                                        </div>
                                        {pagedMembers.map((member, index) => (
                                            <PortalMemberRow
                                                key={member.id}
                                                member={member}
                                                roleOptions={roleOptions}
                                                canManageRoles={canManageRoles}
                                                demoMode={demoMode}
                                                roleDraft={roleDrafts[member.id] || member.role_codes?.find(code => code !== 'owner') || 'member'}
                                                roleSaving={roleSavingMemberId === member.id}
                                                roleChangeBlockedReason={
                                                    !hasOwner && member.role_codes?.includes('admin') && nonOwnerAdminCount <= 1
                                                        ? 'Keep at least one workspace admin before demoting this member.'
                                                        : undefined
                                                }
                                                onRoleDraftChange={(value) => setRoleDrafts(current => ({ ...current, [member.id]: value }))}
                                                onSaveRole={() => void onUpdateMemberRole(member.id)}
                                                showDivider={index !== pagedMembers.length - 1 || filteredMembers.length > pageSize}
                                                onOpenDetail={() => onOpenMember(member.id)}
                                            />
                                        ))}
                                        <PortalPaginationControls
                                            page={page}
                                            totalItems={filteredMembers.length}
                                            pageSize={pageSize}
                                            label="members"
                                            onPageChange={setPage}
                                            onPageSizeChange={handlePageSizeChange}
                                        />
                                    </>
                                )}
                            </div>
                        )}
                    </PortalSectionCard>
                        </>
                    )}
                </>
            )}
        </div>
    )
}
