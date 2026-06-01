import React from 'react'
import { Check, Crown, Minus, Shield, ShieldCheck, Users } from 'lucide-react'
import PortalPageHeader from '../../components/portal/PortalPageHeader'
import type { MeResponse, PortalResponse } from '../../lib/portal-types'

type Props = {
    user: MeResponse | null
    portalState: PortalResponse | null
    currentOrgSlug: string | null
}

const API_KEY_PRESET_MATRIX = [
    {
        preset: 'workspace_owner',
        title: 'Workspace owner key',
        tone: 'emerald',
        description: 'Full workspace machine key for the workspace owner.',
        allows: [
            'Workspace info, policy summary, and current key metadata',
            'Branding, widget preview config, and login widget read/write',
            'Auth config read/write',
            'Apps detail/read/create/update/status/delete',
            'Client secret metadata read and app secret rotate',
            'Members read/detail/activity/profile/role/remove',
            'Member sessions list and revoke',
            'Invites detail/read/create/delete',
            'Roles, permissions, audit actions, activity, and effective policy read',
        ],
    },
    {
        preset: 'workspace_admin',
        title: 'Workspace admin key',
        tone: 'sky',
        description: 'Reduced workspace machine key for admins.',
        allows: [
            'Workspace info, policy summary, and current key metadata',
            'Branding, widget preview config, and login widget read',
            'Auth config read',
            'Apps detail/read/create/update/status',
            'Client secret metadata read',
            'Members read/detail/activity/role',
            'Member sessions list',
            'Invites detail/read/create/delete',
            'Roles, permissions, audit actions, activity, and effective policy read',
        ],
        blocks: [
            'Branding write',
            'Auth config write',
            'Client secret rotate',
            'Client delete',
            'Member profile update',
            'Member remove',
            'Member sessions revoke',
        ],
    },
] as const

const API_KEY_PERMISSION_MATRIX = [
    { area: 'Preset Model', action: 'workspace_owner preset exists', owner: true, admin: false, note: 'Owner-only key type' },
    { area: 'Preset Model', action: 'workspace_admin preset exists', owner: false, admin: true, note: 'Reduced admin key type' },
    { area: 'Auth Channel', action: 'Creates a human session', owner: false, admin: false, note: 'Human login only' },
    { area: 'Scope', action: 'Works across many workspaces', owner: false, admin: false, note: 'Needs tenant or platform key' },
    { area: 'Workspace', action: 'Read workspace', owner: true, admin: true, note: 'Single-workspace scope' },
    { area: 'Workspace', action: 'Read policy summary', owner: true, admin: true, note: 'MFA, sessions, IP, and client summary' },
    { area: 'Workspace', action: 'Read effective policy', owner: true, admin: true, note: 'Single-workspace scope' },
    { area: 'API Key', action: 'Read current API key metadata', owner: true, admin: true, note: 'Current key label, prefix, and preset' },
    { area: 'Branding', action: 'Read branding + widget', owner: true, admin: true, note: 'Read machine config' },
    { area: 'Branding', action: 'Read widget preview config', owner: true, admin: true, note: 'Hosted widget runtime preview payload' },
    { area: 'Branding', action: 'Write branding + widget', owner: true, admin: false, note: 'Owner write only' },
    { area: 'Auth Config', action: 'Read auth config', owner: true, admin: true, note: 'Read machine config' },
    { area: 'Auth Config', action: 'Write auth config', owner: true, admin: false, note: 'Owner write only' },
    { area: 'Apps', action: 'Read apps', owner: true, admin: true, note: 'List registered apps' },
    { area: 'Apps', action: 'Read app detail', owner: true, admin: true, note: 'One app with redirects and status' },
    { area: 'Apps', action: 'Read app secret metadata', owner: true, admin: true, note: 'Has secret and can rotate state' },
    { area: 'Apps', action: 'Create app', owner: true, admin: true, note: 'Create in this workspace' },
    { area: 'Apps', action: 'Update app', owner: true, admin: true, note: 'Edit name and redirects' },
    { area: 'Apps', action: 'Update app status', owner: true, admin: true, note: 'Suspend or resume' },
    { area: 'Apps', action: 'Rotate app secret', owner: true, admin: false, note: 'Owner-only sensitive write' },
    { area: 'Apps', action: 'Delete app', owner: true, admin: false, note: 'Owner-only destructive write' },
    { area: 'Members', action: 'Read members', owner: true, admin: true, note: 'Workspace membership list' },
    { area: 'Members', action: 'Read member detail', owner: true, admin: true, note: 'Display name, avatar, email, roles' },
    { area: 'Members', action: 'Read member activity', owner: true, admin: true, note: 'Member-linked audit history' },
    { area: 'Members', action: 'Update member profile', owner: true, admin: false, note: 'Owner-only write' },
    { area: 'Members', action: 'Update member role', owner: true, admin: true, note: 'Promote or demote' },
    { area: 'Members', action: 'Remove member', owner: true, admin: false, note: 'Owner-only destructive write' },
    { area: 'Members', action: 'Read member sessions', owner: true, admin: true, note: 'Session visibility only' },
    { area: 'Members', action: 'Revoke member sessions', owner: true, admin: false, note: 'Owner-only disruptive action' },
    { area: 'Invites', action: 'Read invites', owner: true, admin: true, note: 'Pending invite list' },
    { area: 'Invites', action: 'Read invite detail', owner: true, admin: true, note: 'One pending invite record' },
    { area: 'Invites', action: 'Create invite', owner: true, admin: true, note: 'Invite into this workspace' },
    { area: 'Invites', action: 'Delete invite', owner: true, admin: true, note: 'Revoke pending invite' },
    { area: 'Catalog', action: 'Read roles', owner: true, admin: true, note: 'Available workspace roles' },
    { area: 'Catalog', action: 'Read permissions', owner: true, admin: true, note: 'Available permission codes' },
    { area: 'Catalog', action: 'Read audit actions', owner: true, admin: true, note: 'Known audit action names' },
    { area: 'Activity', action: 'Read activity', owner: true, admin: true, note: 'Audit visibility' },
] as const

const ACTION_HIGHLIGHT_STYLES: Record<string, string> = {
    Read: 'bg-sky-100 text-sky-700 border-sky-200',
    Write: 'bg-amber-100 text-amber-700 border-amber-200',
    Create: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    Update: 'bg-violet-100 text-violet-700 border-violet-200',
    Delete: 'bg-rose-100 text-rose-700 border-rose-200',
    Rotate: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
    Revoke: 'bg-red-100 text-red-700 border-red-200',
    Creates: 'bg-slate-100 text-slate-700 border-slate-200',
    Works: 'bg-slate-100 text-slate-700 border-slate-200',
}

function renderPermissionAction(action: string) {
    const [verb, ...rest] = action.split(' ')
    const tone = ACTION_HIGHLIGHT_STYLES[verb]
    if (!tone || rest.length === 0) return action
    return (
        <>
            <span className={`mr-2 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.08em] ${tone}`}>
                {verb}
            </span>
            <span>{rest.join(' ')}</span>
        </>
    )
}

// Full permission matrix — derived from migrations 0003 and 0013
const PERMISSION_MATRIX: { code: string; label: string; description: string; owner: boolean; admin: boolean; member: boolean }[] = [
    { code: 'org:update',             label: 'Update settings',         description: 'Edit workspace name, branding, and general settings',  owner: true,  admin: true,  member: false },
    { code: 'org:delete',             label: 'Delete workspace',        description: 'Permanently delete this workspace',                    owner: true,  admin: false, member: false },
    { code: 'org:transfer_ownership', label: 'Transfer ownership',      description: 'Hand workspace ownership to another member',           owner: true,  admin: false, member: false },
    { code: 'members:read',           label: 'View members',            description: 'See the member list and member details',               owner: true,  admin: true,  member: true  },
    { code: 'members:invite',         label: 'Invite members',          description: 'Send invitations and manage pending invites',          owner: true,  admin: true,  member: false },
    { code: 'members:remove',         label: 'Remove members',          description: 'Remove members from the workspace',                   owner: true,  admin: true,  member: false },
    { code: 'roles:manage',           label: 'Manage roles',            description: 'Create custom roles and assign them to members',       owner: true,  admin: true,  member: false },
    { code: 'branding:manage',        label: 'Manage branding',         description: 'Edit logo, colors, and login widget appearance',       owner: true,  admin: true,  member: false },
    { code: 'auth_policy:manage',     label: 'Manage access policy',   description: 'Set login methods, MFA rules, and session policy',     owner: true,  admin: true,  member: false },
    { code: 'activity:read',          label: 'View audit logs',         description: 'Read workspace activity and audit events',             owner: true,  admin: true,  member: false },
    { code: 'clients:manage',         label: 'Manage OAuth clients',    description: 'Create and configure OAuth apps for this workspace',   owner: true,  admin: true,  member: false },
    { code: 'api_keys:manage',        label: 'Manage API keys',         description: 'Create and revoke workspace API keys',                 owner: true,  admin: true,  member: false },
]

function RoleIcon({ code, size = 'sm' }: { code: string; size?: 'sm' | 'lg' }) {
    const cls = size === 'lg' ? 'w-5 h-5' : 'w-3.5 h-3.5'
    if (code === 'owner') return <Crown className={cls} />
    if (code === 'admin') return <ShieldCheck className={cls} />
    return <Users className={cls} />
}

function roleName(codes: string[]): string {
    if (codes.includes('owner')) return 'Workspace Owner'
    if (codes.includes('admin')) return 'Workspace Admin'
    if (codes.includes('member')) return 'User'
    if (codes.length > 0) return codes[0]
    return 'No role'
}

function roleColor(codes: string[]): string {
    if (codes.includes('owner')) return 'text-sky-700 bg-sky-50 border-sky-200'
    if (codes.includes('admin')) return 'text-violet-700 bg-violet-50 border-violet-200'
    return 'text-green-700 bg-green-50 border-green-200'
}

function hasPermission(codes: string[], permCode: string): boolean {
    const row = PERMISSION_MATRIX.find(p => p.code === permCode)
    if (!row) return false
    if (codes.includes('owner')) return row.owner
    if (codes.includes('admin')) return row.admin
    return row.member
}

export default function PortalMyRoles({ user, portalState, currentOrgSlug }: Props) {
    const currentOrg = portalState?.current_org ?? null
    const currentUserRoleCodes = portalState?.current_user_role_codes ?? []
    const allOrgs = portalState?.organizations ?? []

    const displayName = user?.display_name || user?.email || 'You'
    const workspaceName = currentOrg?.login_display_name || currentOrg?.name || currentOrgSlug || '—'

    return (
        <div className="space-y-8">
            <PortalPageHeader
                title="My Roles & Permissions"
                description={`What you can do in ${workspaceName} and across your workspaces.`}
            />

            {/* Current workspace role card */}
            {currentOrg ? (
                <section className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                        <h2 className="font-bold text-gray-800 text-sm">Your role in {workspaceName}</h2>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold ${roleColor(currentUserRoleCodes)}`}>
                            <RoleIcon code={currentUserRoleCodes[0] ?? ''} />
                            {roleName(currentUserRoleCodes)}
                        </span>
                    </div>

                    {/* Permission matrix for current role */}
                    <div className="divide-y divide-gray-50">
                        {PERMISSION_MATRIX.map(perm => {
                            const granted = hasPermission(currentUserRoleCodes, perm.code)
                            return (
                                <div key={perm.code} className={`flex items-start gap-4 px-6 py-3 ${granted ? '' : 'opacity-40'}`}>
                                    <div className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${granted ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                                        {granted ? <Check className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-gray-800">{perm.label}</p>
                                        <p className="text-xs text-gray-500 mt-0.5">{perm.description}</p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </section>
            ) : (
                <p className="text-sm text-gray-500">No workspace selected. Switch to a workspace to see your permissions.</p>
            )}

            {/* Role matrix comparison */}
            <section className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                    <h2 className="font-bold text-gray-800 text-sm">Role permission matrix</h2>
                    <p className="text-xs text-gray-500 mt-0.5">What each workspace role can do.</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100">
                                <th className="text-left px-6 py-3 text-xs font-bold text-gray-500 w-1/2">Permission</th>
                                <th className="text-center px-4 py-3 text-xs font-bold text-sky-600 whitespace-nowrap">
                                    <div className="flex items-center justify-center gap-1"><Crown className="w-3.5 h-3.5" /> Owner</div>
                                </th>
                                <th className="text-center px-4 py-3 text-xs font-bold text-violet-600 whitespace-nowrap">
                                    <div className="flex items-center justify-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Admin</div>
                                </th>
                                <th className="text-center px-4 py-3 text-xs font-bold text-green-600 whitespace-nowrap">
                                    <div className="flex items-center justify-center gap-1"><Users className="w-3.5 h-3.5" /> User</div>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {PERMISSION_MATRIX.map(perm => (
                                <tr key={perm.code} className="hover:bg-gray-50/50">
                                    <td className="px-6 py-2.5">
                                        <p className="font-medium text-gray-800">{perm.label}</p>
                                        <p className="text-xs text-gray-400">{perm.description}</p>
                                    </td>
                                    <td className="text-center px-4 py-2.5">
                                        {perm.owner ? <Check className="w-4 h-4 text-green-500 mx-auto" /> : <Minus className="w-4 h-4 text-gray-300 mx-auto" />}
                                    </td>
                                    <td className="text-center px-4 py-2.5">
                                        {perm.admin ? <Check className="w-4 h-4 text-green-500 mx-auto" /> : <Minus className="w-4 h-4 text-gray-300 mx-auto" />}
                                    </td>
                                    <td className="text-center px-4 py-2.5">
                                        {perm.member ? <Check className="w-4 h-4 text-green-500 mx-auto" /> : <Minus className="w-4 h-4 text-gray-300 mx-auto" />}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100">
                    <h2 className="font-bold text-gray-800 text-sm">Workspace API key presets</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Machine access for one workspace. This is separate from human session roles.</p>
                </div>
                <div className="px-6 py-5 space-y-5">
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        {API_KEY_PRESET_MATRIX.map(preset => (
                            <div
                                key={preset.preset}
                                className={`rounded-3xl border px-4 py-4 ${
                                    preset.tone === 'emerald'
                                        ? 'border-emerald-200 bg-emerald-50'
                                        : 'border-sky-200 bg-sky-50'
                                }`}
                            >
                                <p className={`text-sm font-black ${
                                    preset.tone === 'emerald' ? 'text-emerald-800' : 'text-sky-800'
                                }`}>
                                    {preset.title}
                                </p>
                                <p className={`mt-1 text-xs font-semibold ${
                                    preset.tone === 'emerald' ? 'text-emerald-700' : 'text-sky-700'
                                }`}>
                                    {preset.description}
                                </p>
                                <div className="mt-3 space-y-2">
                                    {preset.allows.map(item => (
                                        <div key={item} className="rounded-2xl border border-white/80 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-700">
                                            {item}
                                        </div>
                                    ))}
                                    {'blocks' in preset && preset.blocks
                                        ? preset.blocks.map(item => (
                                            <div key={item} className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                                                No: {item}
                                            </div>
                                        ))
                                        : null}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="overflow-x-auto rounded-3xl border border-gray-200 bg-white">
                        <table className="w-full min-w-[760px] text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 bg-slate-50/90">
                                    <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Area</th>
                                    <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Permission</th>
                                    <th className="px-4 py-3 text-center text-[11px] font-black uppercase tracking-[0.14em] text-emerald-700 whitespace-nowrap">Workspace owner</th>
                                    <th className="px-4 py-3 text-center text-[11px] font-black uppercase tracking-[0.14em] text-sky-700 whitespace-nowrap">Workspace admin</th>
                                    <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.14em] text-slate-500 whitespace-nowrap">Notes</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {API_KEY_PERMISSION_MATRIX.map(row => (
                                    <tr key={`${row.area}-${row.action}`} className="bg-white">
                                        <td className="px-4 py-3 align-top">
                                            <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-slate-600">
                                                {row.area}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 font-semibold text-slate-800">{renderPermissionAction(row.action)}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`inline-flex min-w-16 justify-center rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.08em] ${
                                                row.owner
                                                    ? 'bg-emerald-100 text-emerald-700'
                                                    : 'bg-slate-100 text-slate-400'
                                            }`}>
                                                {row.owner ? 'Yes' : 'No'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`inline-flex min-w-16 justify-center rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.08em] ${
                                                row.admin
                                                    ? 'bg-sky-100 text-sky-700'
                                                    : 'bg-slate-100 text-slate-400'
                                            }`}>
                                                {row.admin ? 'Yes' : 'No'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-xs font-semibold text-slate-500">{row.note}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            {/* All workspace memberships */}
            {allOrgs.length > 1 && (
                <section className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-100">
                        <h2 className="font-bold text-gray-800 text-sm">Your workspace memberships</h2>
                        <p className="text-xs text-gray-500 mt-0.5">{displayName}'s role across all workspaces you belong to.</p>
                    </div>
                    <div className="divide-y divide-gray-50">
                        {allOrgs.map(org => {
                            const isCurrentOrg = org.id === currentOrg?.id
                            // The portal returns role codes only for the current org.
                            // For other orgs we show the membership without a role code.
                            const orgName = org.login_display_name || org.name
                            return (
                                <div key={org.id} className="flex items-center gap-4 px-6 py-3">
                                    <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                                        {org.icon_url
                                            ? <img src={org.icon_url} alt={orgName} className="w-full h-full object-cover" />
                                            : <Shield className="w-4 h-4 text-gray-400" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-800 truncate">{orgName}</p>
                                        <p className="text-xs text-gray-400 truncate">{org.slug}</p>
                                    </div>
                                    {isCurrentOrg && currentUserRoleCodes.length > 0 && (
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold ${roleColor(currentUserRoleCodes)}`}>
                                            <RoleIcon code={currentUserRoleCodes[0]} />
                                            {roleName(currentUserRoleCodes)}
                                        </span>
                                    )}
                                    {isCurrentOrg && (
                                        <span className="text-[10px] font-bold text-violet-500 bg-violet-50 border border-violet-100 px-2 py-0.5 rounded-full">Current</span>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </section>
            )}
        </div>
    )
}
