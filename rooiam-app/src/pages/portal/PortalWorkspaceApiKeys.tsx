import React from 'react'
import { ArrowUpDown, CheckCircle2, Key, Loader2, Plus, Trash2 } from 'lucide-react'
import PortalCodeBlockField from '../../components/portal/PortalCodeBlockField'
import PortalConfigChangeNote from '../../components/portal/PortalConfigChangeNote'
import PortalCreateFormLayout from '../../components/portal/PortalCreateFormLayout'
import PortalDangerActionButton from '../../components/portal/PortalDangerActionButton'
import PortalFilterBar from '../../components/portal/PortalFilterBar'
import PortalPageHeader from '../../components/portal/PortalPageHeader'
import PortalPaginationControls from '../../components/portal/PortalPaginationControls'
import PortalPrimaryActionButton from '../../components/portal/PortalPrimaryActionButton'
import PortalSearchField from '../../components/portal/PortalSearchField'
import PortalSelectField from '../../components/portal/PortalSelectField'
import PortalSectionCard from '../../components/portal/PortalSectionCard'
import { apiFetch } from '../../lib/api-base'
import { OrganizationActivityItem, TenantApiKey } from '../../lib/portal-types'

const DEFAULT_PAGE_SIZE = 20
const MAX_API_KEYS = 10

const API_KEY_PRESET_MATRIX = {
    workspace_owner: {
        title: 'Workspace owner key',
        tone: 'emerald',
        description: 'Full workspace control plane for the workspace owner.',
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
    workspace_admin: {
        title: 'Workspace admin key',
        tone: 'sky',
        description: 'Reduced machine key for workspace admins.',
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
} as const

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

function summarizeAllowedPermissions(key: TenantApiKey) {
    if (key.permission_preset === 'workspace_owner') {
        return 'Full workspace control plane: branding, auth config, apps, invites, members, and read access.'
    }
    return 'Reduced admin scope: read access, apps, invites, and member role management.'
}

type Props = {
    apiKeys: TenantApiKey[]
    demoMode?: boolean
    isWorkspaceOwner: boolean
    loading?: boolean
    setApiKeys: React.Dispatch<React.SetStateAction<TenantApiKey[]>>
    newKeyLabel: string
    setNewKeyLabel: (v: string) => void
    newKeyExpiry: string
    setNewKeyExpiry: (v: string) => void
    newKeyPermissionPreset: 'workspace_owner' | 'workspace_admin'
    setNewKeyPermissionPreset: (v: 'workspace_owner' | 'workspace_admin') => void
    creatingKey: boolean
    setCreatingKey: (v: boolean) => void
    revokingKeyId: string | null
    setRevokingKeyId: (v: string | null) => void
    newKeyRaw: string | null
    setNewKeyRaw: (v: string | null) => void
    keyMessage: string
    setKeyMessage: (v: string) => void
    copiedKey: boolean
    setCopiedKey: (v: boolean) => void
    API: string
    lastChange: OrganizationActivityItem | null
}

export default function PortalWorkspaceApiKeys({
    apiKeys,
    demoMode = false,
    isWorkspaceOwner,
    loading = false,
    setApiKeys,
    newKeyLabel,
    setNewKeyLabel,
    newKeyExpiry,
    setNewKeyExpiry,
    newKeyPermissionPreset,
    setNewKeyPermissionPreset,
    creatingKey,
    setCreatingKey,
    revokingKeyId,
    setRevokingKeyId,
    newKeyRaw,
    setNewKeyRaw,
    keyMessage,
    setKeyMessage,
    copiedKey,
    setCopiedKey,
    API,
    lastChange,
}: Props) {
    const [search, setSearch] = React.useState('')
    const [sortBy, setSortBy] = React.useState<'label' | 'created' | 'last_used' | 'expiry'>('created')
    const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc')
    const [page, setPage] = React.useState(1)
    const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE)
    const handlePageSizeChange = (n: number) => { setPageSize(n); setPage(1) }
    const atLimit = apiKeys.length >= MAX_API_KEYS

    const handleCreateKey = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newKeyLabel.trim() || atLimit || demoMode) return
        setCreatingKey(true)
        setKeyMessage('')
        setNewKeyRaw(null)
        try {
            const res = await apiFetch(`${API}/orgs/current/api-keys`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    label: newKeyLabel.trim(),
                    permission_preset: newKeyPermissionPreset,
                    expires_at: (() => {
                        if (!newKeyExpiry) return null
                        const d = new Date()
                        if (newKeyExpiry === '1m') d.setMonth(d.getMonth() + 1)
                        else if (newKeyExpiry === '3m') d.setMonth(d.getMonth() + 3)
                        else if (newKeyExpiry === '6m') d.setMonth(d.getMonth() + 6)
                        else if (newKeyExpiry === '1y') d.setFullYear(d.getFullYear() + 1)
                        else if (newKeyExpiry === '2y') d.setFullYear(d.getFullYear() + 2)
                        return d.toISOString()
                    })(),
                }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data?.error?.message || 'Failed to create API key.')
            setApiKeys(prev => [data.key, ...prev])
            setNewKeyRaw(data.raw_key)
            setNewKeyLabel('')
            setNewKeyExpiry('')
            setNewKeyPermissionPreset(isWorkspaceOwner ? 'workspace_owner' : 'workspace_admin')
            setCopiedKey(false)
            setKeyMessage('')
        } catch (err) {
            setKeyMessage(err instanceof Error ? err.message : 'Failed to create API key.')
        } finally {
            setCreatingKey(false)
        }
    }

    const handleRevokeKey = async (keyId: string) => {
        setRevokingKeyId(keyId)
        try {
            const res = await apiFetch(`${API}/orgs/current/api-keys/${keyId}`, {
                method: 'DELETE',
            })
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                throw new Error(data?.error?.message || 'Failed to revoke key.')
            }
            setApiKeys(prev => prev.filter(k => k.id !== keyId))
            if (newKeyRaw) setNewKeyRaw(null)
        } catch (err) {
            setKeyMessage(err instanceof Error ? err.message : 'Failed to revoke key.')
        } finally {
            setRevokingKeyId(null)
        }
    }

    const handleCopy = async () => {
        if (!newKeyRaw) return
        await navigator.clipboard.writeText(newKeyRaw).catch(() => {})
        setCopiedKey(true)
        setTimeout(() => setCopiedKey(false), 2000)
    }

    const inputClass = 'w-full px-4 py-3 bg-muted/50 border border-border rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary transition-all'
    const labelClass = 'text-xs font-bold text-muted-foreground mb-1.5 block'

    const filteredKeys = React.useMemo(() => {
        const query = search.trim().toLowerCase()
        const filtered = apiKeys.filter(key => {
            const haystack = [key.label, key.key_prefix, key.expires_at || '', key.last_used_at || ''].join(' ').toLowerCase()
            return !query || haystack.includes(query)
        })
        return [...filtered].sort((a, b) => {
            let cmp = 0
            if (sortBy === 'label') {
                cmp = a.label.localeCompare(b.label)
            } else if (sortBy === 'created') {
                cmp = a.created_at.localeCompare(b.created_at)
            } else if (sortBy === 'last_used') {
                cmp = (a.last_used_at ?? '').localeCompare(b.last_used_at ?? '')
            } else if (sortBy === 'expiry') {
                // null expiry (never expires) sorts last
                if (!a.expires_at && !b.expires_at) cmp = 0
                else if (!a.expires_at) cmp = 1
                else if (!b.expires_at) cmp = -1
                else cmp = a.expires_at.localeCompare(b.expires_at)
            }
            return sortDir === 'asc' ? cmp : -cmp
        })
    }, [apiKeys, search, sortBy, sortDir])

    React.useEffect(() => {
        setPage(1)
    }, [search, sortBy, sortDir])

    const pagedKeys = React.useMemo(() => {
        const start = (page - 1) * pageSize
        return filteredKeys.slice(start, start + pageSize)
    }, [filteredKeys, page, pageSize])

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PortalPageHeader title="Workspace API Keys" />

            <PortalConfigChangeNote
                item={lastChange}
                emptyText="No API key activity recorded yet."
            />

            {newKeyRaw ? (
                <PortalSectionCard
                    icon={CheckCircle2}
                    title="Copy Your New API Key"
                    className="rounded-4xl border-2 border-emerald-200 bg-emerald-50"
                >
                    <div className="space-y-3">
                        <PortalCodeBlockField value={newKeyRaw} tone="emerald" copyable />
                        <button type="button" onClick={() => setNewKeyRaw(null)} className="text-xs font-bold text-emerald-600 hover:text-emerald-800">
                            I've saved it — dismiss
                        </button>
                    </div>
                </PortalSectionCard>
            ) : null}

            <PortalSectionCard
                icon={Plus}
                title="Create New Key"
                className="rounded-4xl"
            >
                <form id="create-key-form" onSubmit={handleCreateKey} className="space-y-4">
                    <PortalCreateFormLayout
                        title="API Key Configuration"
                        subtitle="Create a labeled workspace key for machine-to-machine use."
                    >
                    {demoMode ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                            API key creation is locked in demo mode because keys are intended for real application use.
                        </div>
                    ) : null}
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                        Up to {MAX_API_KEYS} active keys per workspace.
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                            <p className="text-sm font-extrabold text-emerald-800">Workspace owner</p>
                            <p className="mt-1 text-xs font-semibold text-emerald-700">Full workspace key for the workspace owner only.</p>
                        </div>
                        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
                            <p className="text-sm font-extrabold text-sky-800">Workspace admin</p>
                            <p className="mt-1 text-xs font-semibold text-sky-700">Reduced key for workspace admins. No owner-only controls.</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className={labelClass}>Label</label>
                            <input type="text" value={newKeyLabel} onChange={e => setNewKeyLabel(e.target.value)} placeholder="e.g. My App, Mobile App" className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Expires (optional)</label>
                            <PortalSelectField value={newKeyExpiry} onChange={setNewKeyExpiry}>
                                <option value="">No expiry</option>
                                <option value="1m">1 month</option>
                                <option value="3m">3 months</option>
                                <option value="6m">6 months</option>
                                <option value="1y">1 year</option>
                                <option value="2y">2 years</option>
                            </PortalSelectField>
                        </div>
                        <div>
                            <label className={labelClass}>Permission preset</label>
                            <PortalSelectField value={newKeyPermissionPreset} onChange={value => setNewKeyPermissionPreset(value as 'workspace_owner' | 'workspace_admin')}>
                                {isWorkspaceOwner ? <option value="workspace_owner">Workspace owner</option> : null}
                                <option value="workspace_admin">Workspace admin</option>
                            </PortalSelectField>
                            <p className="mt-1.5 text-xs font-semibold text-muted-foreground">
                                {newKeyPermissionPreset === 'workspace_owner'
                                    ? 'Full workspace-owner key. Can manage the whole workspace control plane.'
                                    : 'Reduced workspace-admin key. Can read everything and manage apps, invites, and member roles, but no owner-only controls.'}
                            </p>
                        </div>
                    </div>
                    {keyMessage ? <p className="text-xs font-semibold text-red-500 bg-red-50 px-4 py-2 rounded-2xl">{keyMessage}</p> : null}
                    <PortalPrimaryActionButton
                        label={creatingKey ? 'Creating…' : atLimit ? 'Limit Reached' : 'Create Key'}
                        icon={Plus}
                        loading={creatingKey}
                        type="submit"
                        disabled={demoMode || creatingKey || !newKeyLabel.trim() || atLimit}
                    />
                    </PortalCreateFormLayout>
                </form>
            </PortalSectionCard>

            <PortalSectionCard
                icon={Key}
                title="API Key Preset Checklist"
                className="rounded-4xl"
            >
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {Object.entries(API_KEY_PRESET_MATRIX).map(([preset, config]) => (
                        <div
                            key={preset}
                            className={`rounded-3xl border px-4 py-4 ${
                                config.tone === 'emerald'
                                    ? 'border-emerald-200 bg-emerald-50'
                                    : 'border-sky-200 bg-sky-50'
                            }`}
                        >
                            <p className={`text-sm font-black ${
                                config.tone === 'emerald' ? 'text-emerald-800' : 'text-sky-800'
                            }`}>
                                {config.title}
                            </p>
                            <p className={`mt-1 text-xs font-semibold ${
                                config.tone === 'emerald' ? 'text-emerald-700' : 'text-sky-700'
                            }`}>
                                {config.description}
                            </p>
                            <div className="mt-3 space-y-2">
                                {config.allows.map(item => (
                                    <div key={item} className="rounded-2xl border border-white/80 bg-white/80 px-3 py-2 text-xs font-semibold text-slate-700">
                                        {item}
                                    </div>
                                ))}
                                {'blocks' in config && config.blocks
                                    ? config.blocks.map(item => (
                                        <div key={item} className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                                            No: {item}
                                        </div>
                                    ))
                                    : null}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="mt-5 overflow-x-auto rounded-3xl border border-border bg-white">
                    <table className="w-full min-w-[760px] text-sm">
                        <thead>
                            <tr className="border-b border-border bg-slate-50/90">
                                <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Area</th>
                                <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Permission</th>
                                <th className="px-4 py-3 text-center text-[11px] font-black uppercase tracking-[0.14em] text-emerald-700">Workspace owner</th>
                                <th className="px-4 py-3 text-center text-[11px] font-black uppercase tracking-[0.14em] text-sky-700">Workspace admin</th>
                                <th className="px-4 py-3 text-left text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Notes</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
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
            </PortalSectionCard>

            <PortalSectionCard
                icon={Key}
                title="Active Keys"
                action={<span className="cute-badge bg-primary/10 text-primary-foreground">{filteredKeys.length} total</span>}
                className="rounded-4xl"
                bodyClassName="p-0"
            >
                <PortalFilterBar>
                    <PortalSearchField
                        value={search}
                        onChange={setSearch}
                        placeholder="Search API keys"
                        className="sm:max-w-none"
                    />
                    <div className="flex items-center gap-1">
                        <select
                            value={sortBy}
                            onChange={e => setSortBy(e.target.value as typeof sortBy)}
                            className="rounded-2xl border border-border bg-white px-3 py-2.5 text-sm font-bold outline-none"
                        >
                            <option value="label">Label</option>
                            <option value="created">Created</option>
                            <option value="last_used">Last used</option>
                            <option value="expiry">Expiry</option>
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
                </PortalFilterBar>
                {!loading && keyMessage ? (
                    <div className="border-b px-4 py-3">
                        <p className="text-xs font-semibold text-red-500 bg-red-50 px-4 py-2 rounded-2xl">{keyMessage}</p>
                    </div>
                ) : null}
                {loading ? (
                    <div className="text-center py-16 text-muted-foreground">
                        <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" />
                        <p className="font-bold text-lg">Loading API keys</p>
                    </div>
                ) : filteredKeys.length === 0 ? (
                    <div className="text-center py-16 text-muted-foreground">
                        <p className="text-5xl mb-3">🔑</p>
                        <p className="font-bold text-lg">No API keys found</p>
                    </div>
                ) : (
                    <>
                        {pagedKeys.map(key => (
                            <div key={key.id} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 sm:py-4 hover:bg-muted/20 transition-colors border-b">
                                <div className="min-w-0 flex-1">
                                    <p className="font-bold">{key.label}</p>
                                    <p className="text-xs font-mono text-muted-foreground mt-0.5">{key.key_prefix}••••••••</p>
                                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                                        <span className={`cute-badge ${key.permission_preset === 'workspace_owner' ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'}`}>
                                            {key.permission_preset === 'workspace_owner' ? 'Workspace owner' : 'Workspace admin'}
                                        </span>
                                        <span className="text-[11px] font-semibold text-muted-foreground">Created {new Date(key.created_at).toLocaleDateString()}</span>
                                        {key.expires_at ? <span className="cute-badge bg-amber-100 text-amber-700">Expires {new Date(key.expires_at).toLocaleDateString()}</span> : null}
                                        {key.last_used_at ? <span className="text-[11px] font-semibold text-muted-foreground">Last used {new Date(key.last_used_at).toLocaleDateString()}</span> : null}
                                    </div>
                                    <p className="mt-1 text-xs font-semibold text-muted-foreground">{summarizeAllowedPermissions(key)}</p>
                                </div>
                                <PortalDangerActionButton
                                    label="Revoke"
                                    icon={Trash2}
                                    loading={revokingKeyId === key.id}
                                    onClick={() => handleRevokeKey(key.id)}
                                    disabled={demoMode || revokingKeyId === key.id}
                                    className="px-3 py-1.5 text-xs"
                                />
                            </div>
                        ))}
                        <PortalPaginationControls
                            page={page}
                            totalItems={filteredKeys.length}
                            pageSize={pageSize}
                            label="keys"
                            onPageChange={setPage}
                            onPageSizeChange={handlePageSizeChange}
                        />
                    </>
                )}
            </PortalSectionCard>
        </div>
    )
}
