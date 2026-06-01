import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppWindow, ArrowUpDown, Check, Copy, Key, Loader2, RefreshCw, Search, Trash2 } from 'lucide-react'

import { sysAdminApi } from '@/lib/api'
import { apiFetch, getApiBase } from '@/lib/api-base'
import { APP_LABEL_PLURAL, APP_LABEL_PLURAL_LOWER } from '@/lib/domain-labels'
import type { AdminClient, RotateClientSecretResponse } from '@/lib/api'
import PaginationControls from '@/components/ui/PaginationControls'
import PageHeader from '@/components/ui/PageHeader'
import Pill from '@/components/ui/Pill'
import SectionCard from '@/components/ui/SectionCard'
import HintBox from '@/components/ui/HintBox'
import { adminRoutes } from '@/lib/routes'

const DEFAULT_CLIENT_PAGE_SIZE = 50

function appInitials(appName: string): string {
    const parts = appName
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)

    if (parts.length === 0) return 'A'
    if (parts.length === 1) {
        return parts[0].replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || 'A'
    }

    return parts.map(part => part.charAt(0).toUpperCase()).join('')
}

function ClientRow({
    client,
    canRotateSecret,
    canManageStatus,
    rotating,
    onRotateSecret,
    onToggleStatus,
    onDelete,
    statusUpdating,
    deleting,
}: {
    client: AdminClient
    canRotateSecret: boolean
    canManageStatus: boolean
    rotating: boolean
    onRotateSecret: (client: AdminClient) => void
    onToggleStatus: (client: AdminClient) => void
    onDelete: (client: AdminClient) => void
    statusUpdating: boolean
    deleting: boolean
}) {
    const scopeLabel = client.organization_name ? client.organization_name : 'Platform'
    const scopeTone = client.organization_name
        ? 'bg-sky-100 text-sky-700'
        : 'bg-gray-100 text-gray-700'
    return (
        <tr className="border-t border-gray-100 align-top transition-colors hover:bg-rose-50/30">
            <td className="px-5 py-4 w-[320px]">
                <div className="flex items-start gap-3 min-w-0 max-w-[320px]">
                    <div className="w-11 h-11 rounded-2xl overflow-hidden border border-border bg-white shadow-sm flex items-center justify-center shrink-0 text-sm">
                        <span className="h-full w-full flex items-center justify-center bg-gradient-to-br from-sky-200 to-cyan-200 font-black text-sky-900">
                            {appInitials(client.app_name)}
                        </span>
                    </div>
                    <div className="min-w-0 max-w-[240px]">
                        <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">
                            <Link
                                to={adminRoutes.tenantWorkspaceApp(client.id)}
                                className="min-w-0 max-w-[118px] truncate text-[13px] font-black leading-tight text-gray-900 transition-colors hover:text-sky-700 sm:max-w-[128px] lg:max-w-[138px]"
                                title={`Open app info for ${client.app_name}`}
                            >
                                {client.app_name}
                            </Link>
                            <span className="inline-flex shrink-0 items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-500">
                                {client.app_type}
                            </span>
                            <Pill tone={client.status === 'active' ? 'green' : 'amber'} className="shrink-0">
                                {client.status}
                            </Pill>
                        </div>
                        <code className="mt-1 block text-[11px] font-mono text-gray-400 truncate max-w-[340px]">
                            {client.client_id}
                        </code>
                    </div>
                </div>
            </td>
            <td className="px-5 py-4">
                <div className="space-y-1">
                    {client.org_id && client.organization_name ? (
                        <Link
                            to={adminRoutes.tenantWorkspace(client.org_id)}
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] transition-colors hover:brightness-95 ${scopeTone}`}
                            title={`Open workspace overview for ${client.organization_name}`}
                        >
                            {scopeLabel}
                        </Link>
                    ) : (
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.14em] ${scopeTone}`}>
                            {scopeLabel}
                        </span>
                    )}
                    {client.organization_slug ? (
                        <p className="text-[11px] font-mono text-gray-400">{client.organization_slug}</p>
                    ) : null}
                </div>
            </td>
            <td className="px-5 py-4">
                <div className="space-y-1">
                        {client.owner_user_id && client.owner_email ? (
                            <Link
                                to={adminRoutes.tenantMember(client.owner_user_id)}
                                state={{ from: 'tenant/members' }}
                                className="break-all text-[13px] font-bold text-gray-700 transition-colors hover:text-sky-700"
                                title={`Open member details for ${client.owner_email}`}
                            >
                                {client.owner_email}
                            </Link>
                        ) : (
                            <p className="text-[13px] font-bold text-gray-700 break-all">
                                {client.owner_email || 'Unknown owner'}
                            </p>
                        )}
                    <p className="text-[10px] font-semibold text-gray-400">
                        App owner
                    </p>
                </div>
            </td>
            <td className="px-5 py-4">
                <div className="space-y-1">
                    <p className="text-[13px] font-bold text-gray-700">{client.redirect_uris.length} redirect URIs</p>
                    {client.redirect_uris[0] ? (
                        <code className="block text-[10px] font-mono text-gray-400 break-all">
                            {client.redirect_uris[0]}
                        </code>
                    ) : null}
                </div>
            </td>
            <td className="px-5 py-4 whitespace-nowrap text-[13px] font-semibold text-gray-500">
                <div className="space-y-1">
                    <p>{new Date(client.created_at).toLocaleDateString()}</p>
                    <p className="text-[10px] font-medium text-gray-400">
                        {new Date(client.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                </div>
            </td>
            <td className="px-5 py-4">
                <div className="flex flex-wrap justify-end gap-2">
                    {canRotateSecret ? (
                        <button
                            type="button"
                            onClick={() => onRotateSecret(client)}
                            disabled={rotating || client.status !== 'active'}
                            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] font-bold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                        >
                            {rotating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            Rotate Secret
                        </button>
                    ) : null}
                    {canManageStatus ? (
                        <button
                            type="button"
                            onClick={() => onToggleStatus(client)}
                            disabled={statusUpdating}
                            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] font-bold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                        >
                            {statusUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            {client.status === 'active' ? 'Pause' : 'Resume'}
                        </button>
                    ) : null}
                    <button
                        type="button"
                        onClick={() => onDelete(client)}
                        disabled={deleting}
                        className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-[11px] font-bold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                    >
                        {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        Delete
                    </button>
                </div>
            </td>
        </tr>
    )
}

function SecretNotice({
    title,
    description,
    notice,
    onDismiss,
}: {
    title: string
    description: string
    notice: RotateClientSecretResponse | null
    onDismiss: () => void
}) {
    const [copiedId, setCopiedId] = useState(false)
    const [copiedSecret, setCopiedSecret] = useState(false)

    if (!notice) return null

    const clientId = notice.client_id
    const clientSecret = notice.client_secret
    if (!clientSecret) return null

    const copyToClipboard = (text: string, isSecret: boolean) => {
        navigator.clipboard.writeText(text)
        if (isSecret) {
            setCopiedSecret(true)
            setTimeout(() => setCopiedSecret(false), 2000)
        } else {
            setCopiedId(true)
            setTimeout(() => setCopiedId(false), 2000)
        }
    }

    return (
        <div className="bg-green-50 border border-green-100 rounded-3xl p-6 shadow-sm relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-green-200 rounded-full blur-3xl opacity-30" />
            <h2 className="text-lg font-black text-green-900 mb-2">{title}</h2>
            <p className="text-sm font-semibold text-green-700 mb-6">{description}</p>
            <div className="space-y-4 max-w-2xl relative z-10">
                <div>
                    <label className="block text-xs font-bold text-green-800 mb-1">Client ID</label>
                    <div className="flex items-center gap-2">
                        <code className="flex-1 bg-white px-3 py-2 rounded-xl text-sm font-mono border border-green-100 text-gray-800 hidden md:block">{clientId}</code>
                        <button
                            type="button"
                            onClick={() => copyToClipboard(clientId, false)}
                            className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-green-200 font-bold text-sm text-green-700 hover:bg-green-100 transition-colors"
                        >
                            {copiedId ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} Copy
                        </button>
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-green-800 mb-1">Client Secret</label>
                    <div className="flex items-center gap-2">
                        <code className="flex-1 bg-white px-3 py-2 rounded-xl text-sm font-mono border border-green-100 text-gray-800 hidden md:block">{clientSecret}</code>
                        <button
                            type="button"
                            onClick={() => copyToClipboard(clientSecret, true)}
                            className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-xl border border-green-700 font-bold text-sm hover:bg-green-700 transition-colors shadow-sm"
                        >
                            {copiedSecret ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} Copy Secret
                        </button>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={onDismiss}
                    className="mt-2 text-sm font-bold text-green-700 underline hover:text-green-900"
                >
                    I have saved these securely
                </button>
            </div>
        </div>
    )
}

export default function Clients()
{
    const apiBase = getApiBase()
    const [loading, setLoading] = useState(true)
    const [demoMode, setDemoMode] = useState(false)
    const [clients, setClients] = useState<AdminClient[]>([])
    const [totalClients, setTotalClients] = useState(0)
    const [workspaceFilter, setWorkspaceFilter] = useState('all')
    const [typeFilter, setTypeFilter] = useState<'all' | 'spa' | 'web' | 'native'>('all')
    const [search, setSearch] = useState('')
    const [rotatedSecretData, setRotatedSecretData] = useState<RotateClientSecretResponse | null>(null)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(DEFAULT_CLIENT_PAGE_SIZE)
    const [rotatingClientId, setRotatingClientId] = useState<string | null>(null)
    const [statusUpdatingClientId, setStatusUpdatingClientId] = useState<string | null>(null)
    const [deletingClientId, setDeletingClientId] = useState<string | null>(null)
    const [_error, setError] = useState('')
    const [sortBy, setSortBy] = useState<'name' | 'created'>('created')
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

    const load = async () =>
    {
        setLoading(true)
        try
        {
            const data = await sysAdminApi.clients({
                page,
                page_size: pageSize,
                search,
                scope: workspaceFilter,
            }).catch(() => null)
            setClients(data?.items || [])
            setTotalClients(data?.total || 0)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        apiFetch(`${apiBase}/setup/status`)
            .then(async res => res.ok ? res.json().catch(() => ({})) : {})
            .then(data => setDemoMode(Boolean(data?.demo_mode)))
            .catch(() => setDemoMode(false))
        void load()
    }, [apiBase])

    const workspaceOptions = useMemo(() => {
        const map = new Map<string, string>()
        clients.forEach(client => {
            if (client.organization_slug && client.organization_name) {
                map.set(client.organization_slug, client.organization_name)
            }
        })
        return Array.from(map.entries())
            .map(([slug, name]) => ({ slug, name }))
            .sort((a, b) => a.name.localeCompare(b.name))
    }, [clients])

    const handlePageSizeChange = (n: number) => { setPageSize(n); setPage(1) }

    useEffect(() => {
        setPage(1)
    }, [search, workspaceFilter, typeFilter, sortBy, sortDir])

    const pagedClients = useMemo(() => {
        const filtered = typeFilter === 'all' ? clients : clients.filter(c => c.app_type === typeFilter)
        return [...filtered].sort((a, b) => {
            let cmp = 0
            if (sortBy === 'name') cmp = a.app_name.localeCompare(b.app_name)
            else if (sortBy === 'created') cmp = a.created_at.localeCompare(b.created_at)
            return sortDir === 'asc' ? cmp : -cmp
        })
    }, [clients, typeFilter, sortBy, sortDir])

    const rotateClientSecret = async (client: AdminClient) => {
        setRotatingClientId(client.id)
        setError('')
        try {
            const data = await sysAdminApi.rotateClientSecret(client.id)
            setRotatedSecretData(data)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to rotate client secret.')
        } finally {
            setRotatingClientId(null)
        }
    }

    const deleteClient = async (client: AdminClient) => {
        if (!confirm(`Delete "${client.app_name}"? This cannot be undone.`)) return
        setDeletingClientId(client.id)
        setError('')
        try {
            await sysAdminApi.deleteClient(client.id)
            setClients(current => current.filter(c => c.id !== client.id))
            setTotalClients(t => t - 1)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete client.')
        } finally {
            setDeletingClientId(null)
        }
    }

    const toggleClientStatus = async (client: AdminClient) => {
        setStatusUpdatingClientId(client.id)
        setError('')
        try {
            const nextStatus = client.status === 'active' ? 'suspended' : 'active'
            const updated = await sysAdminApi.updateClientStatus(client.id, nextStatus)
            setClients(current => current.map(item => item.id === updated.id ? updated : item))
            if (nextStatus === 'suspended') {
                setRotatedSecretData(null)
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update app status.')
        } finally {
            setStatusUpdatingClientId(null)
        }
    }

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PageHeader
                eyebrow="Tenant Workspace"
                title={`Tenant Workspace ${APP_LABEL_PLURAL}`}
                description={`This is the cross-workspace app inventory for platform and tenant workspaces.`}
            />

            <HintBox tone="sky" title="App inventory">
                Use this page to scan apps by workspace and owner. Open a workspace to inspect app info in workspace context.
            </HintBox>

            <SecretNotice
                title="Client Secret Rotated"
                description="Copy the new secret now. The previous secret is no longer valid."
                notice={rotatedSecretData}
                onDismiss={() => setRotatedSecretData(null)}
            />

            <SectionCard
                icon={AppWindow}
                title={`Platform ${APP_LABEL_PLURAL}`}
                subtitle={`${APP_LABEL_PLURAL} across the whole platform, including workspace-owned apps.`}
                tone="sky"
                action={!loading && <span className="cute-badge bg-secondary text-secondary-foreground">{totalClients} {APP_LABEL_PLURAL_LOWER}</span>}
                bodyClassName=""
            >
                {/* Filter bar */}
                <div className="border-b bg-white/80 px-4 py-3 sm:px-5">
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_200px_160px_auto]">
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search apps, owners, client IDs, or workspaces…"
                                className="w-full pl-11 pr-4 py-2.5 bg-card border-2 border-border rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary transition-all"
                            />
                        </div>
                        <select
                            value={workspaceFilter}
                            onChange={e => setWorkspaceFilter(e.target.value)}
                            className="px-4 py-2.5 bg-card border-2 border-border rounded-2xl text-sm font-bold outline-none"
                        >
                            <option value="all">All workspaces</option>
                            <option value="platform">Platform only</option>
                            {workspaceOptions.map(option => (
                                <option key={option.slug} value={option.slug}>{option.name}</option>
                            ))}
                        </select>
                        <select
                            value={typeFilter}
                            onChange={e => setTypeFilter(e.target.value as 'all' | 'spa' | 'web' | 'native')}
                            className="px-4 py-2.5 bg-card border-2 border-border rounded-2xl text-sm font-bold outline-none"
                        >
                            <option value="all">All types</option>
                            <option value="web">Web</option>
                            <option value="spa">SPA</option>
                            <option value="native">Native</option>
                        </select>
                        <div className="flex items-center gap-1">
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
                    </div>
                </div>

                {/* List */}
                {loading ? (
                    <div className="flex items-center justify-center py-16 text-muted-foreground">
                        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading {APP_LABEL_PLURAL_LOWER}…
                    </div>
                ) : clients.length === 0 ? (
                    <div className="m-4 rounded-3xl border-2 border-dashed border-border bg-white/70 py-12 text-center">
                        <Key className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                        <h3 className="font-black mb-1">
                            {totalClients === 0 ? `No ${APP_LABEL_PLURAL_LOWER} yet` : 'No apps match this filter'}
                        </h3>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="min-w-full">
                                <thead className="border-b bg-white/70">
                                    <tr className="text-left">
                                        <th className="px-5 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">App</th>
                                        <th className="px-5 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">Scope</th>
                                        <th className="px-5 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">Owner</th>
                                        <th className="px-5 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">Redirects</th>
                                        <th className="px-5 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">Created</th>
                                        <th className="px-5 py-3 text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pagedClients.map((client) => (
                                        <ClientRow
                                            key={client.id}
                                            client={client}
                                            canRotateSecret={!demoMode && client.app_type === 'web'}
                                            canManageStatus={!demoMode}
                                            rotating={rotatingClientId === client.id}
                                            onRotateSecret={rotateClientSecret}
                                            onToggleStatus={toggleClientStatus}
                                            onDelete={deleteClient}
                                            statusUpdating={statusUpdatingClientId === client.id}
                                            deleting={deletingClientId === client.id}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <PaginationControls
                            page={page}
                            totalItems={totalClients}
                            pageSize={pageSize}
                            label={APP_LABEL_PLURAL_LOWER}
                            onPageChange={setPage}
                            onPageSizeChange={handlePageSizeChange}
                        />
                    </>
                )}
            </SectionCard>
        </div>
    )
}
