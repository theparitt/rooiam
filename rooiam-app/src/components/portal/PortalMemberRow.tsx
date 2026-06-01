import React from 'react'
import { Loader2, ShieldCheck } from 'lucide-react'
import type { OrganizationMember, OrganizationRole } from '../../lib/portal-types'
import PortalPill from './PortalPill'
import PortalWorkspaceRolePill from './PortalWorkspaceRolePill'
function formatLastSeen(iso: string | null): string {
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

type Props = {
    member: OrganizationMember
    roleOptions: OrganizationRole[]
    canManageRoles: boolean
    demoMode?: boolean
    roleDraft: string
    roleSaving: boolean
    onRoleDraftChange: (value: string) => void
    onSaveRole: () => void
    showDivider?: boolean
    onOpenDetail?: () => void
    roleChangeBlockedReason?: string
}

export default function PortalMemberRow({
    member,
    roleOptions,
    canManageRoles,
    demoMode = false,
    roleDraft,
    roleSaving,
    onRoleDraftChange,
    onSaveRole,
    showDivider = false,
    onOpenDetail,
    roleChangeBlockedReason,
}: Props) {
    const avatarSrc = '/rooiam-app-white.svg'
    const name = member.display_name || member.email || member.user_id
    const ownerLocked = member.role_codes?.includes('owner')
    const roleDraftChanged = roleDraft !== (member.role_codes?.find(c => c !== 'owner') || 'member')

    return (
        <div className={`flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-muted/20 sm:flex-row sm:items-center sm:gap-4 sm:px-5 sm:py-3.5 ${showDivider ? 'border-b' : ''}`}>
            {/* Left: avatar + name */}
            <button
                type="button"
                onClick={onOpenDetail}
                disabled={!onOpenDetail}
                className="flex min-w-0 flex-1 items-center gap-3 text-left sm:gap-4 disabled:cursor-default"
            >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-white text-sm shadow-sm">
                    <img src={avatarSrc} alt={name} className="h-full w-full object-cover scale-[1.06]" />
                </div>
                <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-bold leading-tight break-words">
                        {name}
                        <PortalWorkspaceRolePill roleCodes={member.role_codes} className="px-2 py-0.5 text-[10px]" />
                    </p>
                    {member.email ? (
                        <p className="truncate text-[11px] font-mono text-muted-foreground" title={member.email}>
                            {member.email}
                        </p>
                    ) : null}
                </div>
            </button>

            {/* Right: fixed columns — status · last seen · joined · role action */}
            <div className="hidden shrink-0 sm:grid sm:grid-cols-[64px_72px_74px_188px] sm:items-center sm:gap-3">
                {/* Status */}
                <div className="flex justify-center">
                    <PortalPill tone={member.status === 'active' ? 'green' : 'amber'} className="px-2 py-0.5 text-[11px]">
                        {member.status}
                    </PortalPill>
                </div>

                {/* Last seen */}
                <div className="text-right">
                    <span className="text-[11px] font-semibold text-muted-foreground" title={member.last_seen_at ? new Date(member.last_seen_at).toLocaleString() : 'Never'}>
                        {formatLastSeen(member.last_seen_at)}
                    </span>
                </div>

                {/* Joined date */}
                <div className="text-right">
                    <span className="text-[11px] font-semibold text-muted-foreground">
                        {new Date(member.created_at).toLocaleDateString()}
                    </span>
                </div>

                {/* Role action */}
                <div className="flex justify-end">
                    {canManageRoles && !demoMode && !ownerLocked && !roleChangeBlockedReason ? (
                        <div className="flex items-center gap-2">
                            <select
                                value={roleDraft}
                                onChange={e => onRoleDraftChange(e.target.value)}
                                className="rounded-2xl border border-border bg-white px-2.5 py-1.5 text-[11px] font-bold text-foreground outline-none"
                            >
                                {roleOptions.map(role => (
                                    <option key={role.code} value={role.code}>{role.name}</option>
                                ))}
                            </select>
                            {roleDraftChanged ? (
                                <button
                                    type="button"
                                    disabled={roleSaving}
                                    onClick={onSaveRole}
                                    className="inline-flex items-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50 px-2.5 py-1.5 text-[10px] font-bold text-purple-700 transition-colors hover:bg-purple-100 disabled:opacity-50"
                                >
                                    {roleSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                                    Save
                                </button>
                            ) : null}
                        </div>
                    ) : ownerLocked ? (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
                            Workspace Owner
                            <span
                                title="Owner role cannot be changed here. Transfer ownership from workspace settings."
                                className="inline-flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-muted-foreground/30 text-[9px] leading-none text-muted-foreground/60 hover:border-muted-foreground/60 hover:text-muted-foreground"
                            >
                                ?
                            </span>
                        </span>
                    ) : roleChangeBlockedReason ? (
                        <span className="text-[11px] font-bold text-rose-700" title={roleChangeBlockedReason}>
                            Protected
                        </span>
                    ) : null}
                </div>
            </div>

            {/* Mobile: status + role action stacked */}
            <div className="flex sm:hidden items-center gap-2 self-end flex-wrap">
                <PortalPill tone={member.status === 'active' ? 'green' : 'amber'} className="px-2 py-0.5 text-xs">
                    {member.status}
                </PortalPill>
                {canManageRoles && !demoMode && !ownerLocked && !roleChangeBlockedReason ? (
                    <div className="flex items-center gap-2">
                        <select
                            value={roleDraft}
                            onChange={e => onRoleDraftChange(e.target.value)}
                            className="rounded-2xl border border-border bg-white px-3 py-1.5 text-xs font-bold outline-none"
                        >
                            {roleOptions.map(role => (
                                <option key={role.code} value={role.code}>{role.name}</option>
                            ))}
                        </select>
                        {roleDraftChanged ? (
                            <button
                                type="button"
                                disabled={roleSaving}
                                onClick={onSaveRole}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50 px-2.5 py-1.5 text-[11px] font-bold text-purple-700 disabled:opacity-50"
                            >
                                {roleSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                                Save
                            </button>
                        ) : null}
                    </div>
                ) : roleChangeBlockedReason ? (
                    <span className="text-[11px] font-bold text-rose-700">{roleChangeBlockedReason}</span>
                ) : null}
            </div>
        </div>
    )
}
