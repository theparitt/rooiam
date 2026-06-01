import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Building2, ExternalLink, KeyRound, Loader2, PauseCircle, PlayCircle, Trash2 } from 'lucide-react'

import { sysAdminApi } from '@/lib/api'
import type { AdminClientDetail, RotateClientSecretResponse } from '@/lib/api'
import { adminRoutes } from '@/lib/routes'
import PageHeader from '@/components/ui/PageHeader'
import SectionCard from '@/components/ui/SectionCard'
import Pill from '@/components/ui/Pill'
import DangerZoneCard from '@/components/ui/DangerZoneCard'

function SecretNotice({
    notice,
    onDismiss,
}: {
    notice: RotateClientSecretResponse | null
    onDismiss: () => void
}) {
    if (!notice) return null

    return (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <p className="text-base font-black text-emerald-900">Client secret rotated</p>
            <p className="mt-1 text-sm font-medium text-emerald-700">
                Copy the new secret now. The previous secret is no longer valid.
            </p>
            <div className="mt-4 space-y-3">
                <div className="rounded-2xl border border-emerald-200 bg-white p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-emerald-700">Client ID</p>
                    <code className="mt-1 block text-xs font-mono text-gray-700 break-all">{notice.client_id}</code>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-white p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-emerald-700">Client Secret</p>
                    <code className="mt-1 block text-xs font-mono text-gray-700 break-all">{notice.client_secret}</code>
                </div>
                <button
                    type="button"
                    onClick={onDismiss}
                    className="text-sm font-bold text-emerald-700 underline hover:text-emerald-900"
                >
                    I have saved this securely
                </button>
            </div>
        </div>
    )
}

export default function TenantWorkspaceAppDetail() {
    const { appId } = useParams()
    const navigate = useNavigate()
    const [detail, setDetail] = useState<AdminClientDetail | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [statusBusy, setStatusBusy] = useState(false)
    const [rotateBusy, setRotateBusy] = useState(false)
    const [deleteBusy, setDeleteBusy] = useState(false)
    const [rotatedSecret, setRotatedSecret] = useState<RotateClientSecretResponse | null>(null)

    useEffect(() => {
        if (!appId) {
            setError('Missing app id.')
            setLoading(false)
            return
        }

        sysAdminApi.clientDetail(appId)
            .then(setDetail)
            .catch(err => setError(err instanceof Error ? err.message : 'Could not load app info.'))
            .finally(() => setLoading(false))
    }, [appId])

    const handleToggleStatus = async () => {
        if (!detail) return
        const nextStatus = detail.status === 'active' ? 'suspended' : 'active'
        setStatusBusy(true)
        try {
            const updated = await sysAdminApi.updateClientStatus(detail.id, nextStatus)
            setDetail(current => current ? { ...current, ...updated } : current)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not update app status.')
        } finally {
            setStatusBusy(false)
        }
    }

    const handleRotateSecret = async () => {
        if (!detail) return
        setRotateBusy(true)
        setError('')
        try {
            const response = await sysAdminApi.rotateClientSecret(detail.id)
            setRotatedSecret(response)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not rotate client secret.')
        } finally {
            setRotateBusy(false)
        }
    }

    const handleDelete = async () => {
        if (!detail) return
        const confirmed = window.confirm(`Delete "${detail.app_name}"? This cannot be undone.`)
        if (!confirmed) return

        setDeleteBusy(true)
        setError('')
        try {
            await sysAdminApi.deleteClient(detail.id)
            navigate(adminRoutes.tenantWorkspaceApps(), { replace: true })
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not delete app.')
            setDeleteBusy(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
                <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Loading app info…
            </div>
        )
    }

    if (error || !detail) {
        return (
            <div className="space-y-5 sm:space-y-6 animate-slide-up">
                <Link
                    to={adminRoutes.tenantWorkspaceApps()}
                    className="inline-flex items-center gap-2 rounded-2xl border border-border bg-white px-4 py-2 text-xs font-black text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Tenant Workspace Apps
                </Link>
                <div className="rounded-3xl border border-red-200 bg-red-50 p-6">
                    <p className="text-lg font-black text-red-700">App detail unavailable</p>
                    <p className="mt-2 text-sm font-semibold text-red-600">{error || 'App not found.'}</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <div className="flex items-center gap-3">
                <Link
                    to={adminRoutes.tenantWorkspaceApps()}
                    className="inline-flex items-center gap-2 rounded-2xl border border-border bg-white px-4 py-2 text-xs font-black text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Tenant Workspace Apps
                </Link>
            </div>

            <PageHeader
                eyebrow="Tenant Workspace"
                title={`${detail.app_name} Info`}
                description="App identity, owner, workspace scope, redirect URIs, and lifecycle controls."
                actions={
                    <Pill tone={detail.status === 'active' ? 'green' : 'amber'}>
                        {detail.status}
                    </Pill>
                }
            />

            {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                    {error}
                </div>
            ) : null}

            <SecretNotice notice={rotatedSecret} onDismiss={() => setRotatedSecret(null)} />

            <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                <SectionCard
                    icon={KeyRound}
                    title="App Summary"
                    subtitle="Core identity, owner, scope, and redirect configuration."
                    tone="violet"
                    className="h-fit"
                >
                    <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
                                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-gray-400">App Type</p>
                                <p className="mt-1 text-sm font-black text-gray-900">{detail.app_type.toUpperCase()}</p>
                            </div>
                            <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
                                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-gray-400">Created</p>
                                <p className="mt-1 text-sm font-black text-gray-900">{new Date(detail.created_at).toLocaleString()}</p>
                            </div>
                            <div className="rounded-2xl border border-border bg-white p-4 shadow-sm sm:col-span-2">
                                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-gray-400">Client ID</p>
                                <code className="mt-1 block break-all text-xs font-mono text-gray-700">{detail.client_id}</code>
                            </div>
                            <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
                                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-gray-400">Owner</p>
                                {detail.owner_user_id && detail.owner_email ? (
                                    <Link
                                        to={adminRoutes.tenantMember(detail.owner_user_id)}
                                        state={{ from: 'tenant/members' }}
                                        className="mt-1 inline-flex text-sm font-black text-sky-700 transition-colors hover:text-sky-900"
                                    >
                                        {detail.owner_display_name || detail.owner_email}
                                    </Link>
                                ) : (
                                    <p className="mt-1 text-sm font-black text-gray-900">{detail.owner_display_name || detail.owner_email || 'Unknown owner'}</p>
                                )}
                                {detail.owner_email && detail.owner_display_name ? (
                                    <p className="mt-1 text-xs font-mono text-gray-500 break-all">{detail.owner_email}</p>
                                ) : null}
                            </div>
                            <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
                                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-gray-400">Workspace Scope</p>
                                {detail.org_id && detail.organization_name ? (
                                    <Link
                                        to={adminRoutes.tenantWorkspace(detail.org_id)}
                                        className="mt-1 inline-flex items-center gap-1.5 text-sm font-black text-sky-700 transition-colors hover:text-sky-900"
                                    >
                                        <Building2 className="h-4 w-4" />
                                        {detail.organization_name}
                                    </Link>
                                ) : (
                                    <p className="mt-1 text-sm font-black text-gray-900">Platform</p>
                                )}
                                {detail.organization_slug ? (
                                    <p className="mt-1 text-xs font-mono text-gray-500">{detail.organization_slug}</p>
                                ) : null}
                            </div>
                            <div className="rounded-2xl border border-border bg-white p-4 shadow-sm sm:col-span-2">
                                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-gray-400">Redirect URIs</p>
                                <div className="mt-2 space-y-2">
                                    {detail.redirect_uris.length > 0 ? (
                                        detail.redirect_uris.map(uri => (
                                            <code key={uri} className="block rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-xs font-mono text-gray-700 break-all">
                                                {uri}
                                            </code>
                                        ))
                                    ) : (
                                        <p className="text-sm font-medium text-muted-foreground">No redirect URIs configured.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </SectionCard>

                <div className="space-y-6">
                    <SectionCard
                        icon={ExternalLink}
                        title="Recent App Audit Logs"
                        subtitle="Recent secret rotation, lifecycle, and app-related admin actions."
                        tone="amber"
                    >
                        <div className="space-y-3">
                            {detail.recent_activity.length > 0 ? (
                                detail.recent_activity.map(event => (
                                    <div key={event.id} className="rounded-2xl border border-border bg-white p-4 shadow-sm">
                                        <p className="text-sm font-black text-gray-900">{event.action}</p>
                                        <p className="mt-1 text-xs font-medium text-muted-foreground">
                                            {event.actor_email || 'System'} · {new Date(event.created_at).toLocaleString()}
                                        </p>
                                    </div>
                                ))
                            ) : (
                                <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-center text-sm font-semibold text-muted-foreground">
                                    No recent app audit logs.
                                </div>
                            )}
                        </div>
                    </SectionCard>

                    <DangerZoneCard
                        title="App Danger Zone"
                        subtitle="These actions affect app availability and may break live sign-in or callback flows if used carelessly."
                    >
                        <div className="rounded-2xl border border-rose-200 bg-white p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-sm font-black text-rose-900">Pause or resume app</p>
                                    <p className="mt-1 text-sm font-medium text-rose-700">
                                        Pausing disables the app immediately. Existing integrations may stop working until resumed.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleToggleStatus}
                                    disabled={statusBusy}
                                    className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
                                >
                                    {statusBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : detail.status === 'active' ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                                    {detail.status === 'active' ? 'Pause App' : 'Resume App'}
                                </button>
                            </div>
                        </div>

                        {detail.app_type === 'web' ? (
                            <div className="rounded-2xl border border-rose-200 bg-white p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-black text-rose-900">Rotate client secret</p>
                                        <p className="mt-1 text-sm font-medium text-rose-700">
                                            Rotating invalidates the previous secret immediately. Update every dependent integration before using the new one in production.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleRotateSecret}
                                        disabled={rotateBusy || detail.status !== 'active'}
                                        className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
                                    >
                                        {rotateBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                                        Rotate Secret
                                    </button>
                                </div>
                            </div>
                        ) : null}

                        <div className="rounded-2xl border border-rose-200 bg-white p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-sm font-black text-rose-900">Delete app</p>
                                    <p className="mt-1 text-sm font-medium text-rose-700">
                                        Deleting permanently removes the app registration and all configured redirect URIs. Existing clients will stop working and this cannot be undone.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleDelete}
                                    disabled={deleteBusy}
                                    className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-rose-300 bg-white px-3 py-2 text-xs font-black text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
                                >
                                    {deleteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                    Delete App
                                </button>
                            </div>
                        </div>
                    </DangerZoneCard>
                </div>
            </div>
        </div>
    )
}
