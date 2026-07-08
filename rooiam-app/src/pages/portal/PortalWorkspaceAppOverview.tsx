import React, { useEffect, useMemo, useState } from 'react'
import { AppWindow, ArrowLeft, Clock3, Link2, RefreshCw, Save, Trash2 } from 'lucide-react'
import PortalAuditEventItem from '../../components/portal/PortalAuditEventItem'
import PortalCodeBlockField from '../../components/portal/PortalCodeBlockField'
import PortalContentCard from '../../components/portal/PortalContentCard'
import PortalDangerActionButton from '../../components/portal/PortalDangerActionButton'
import PortalDangerZoneCard from '../../components/portal/PortalDangerZoneCard'
import PortalHelpTooltip from '../../components/portal/PortalHelpTooltip'
import PortalInlineMessage from '../../components/portal/PortalInlineMessage'
import PortalPageHeader from '../../components/portal/PortalPageHeader'
import PortalPill from '../../components/portal/PortalPill'
import PortalPrimarySaveButton from '../../components/portal/PortalPrimarySaveButton'
import PortalSecondaryActionButton from '../../components/portal/PortalSecondaryActionButton'
import PortalStatTile from '../../components/portal/PortalStatTile'
import PortalTextareaField from '../../components/portal/PortalTextareaField'
import { resolveApiAssetUrl } from '../../lib/api-base'
import type { OrgClient, OrganizationActivityItem } from '../../lib/portal-types'

function isLoopbackHostname(hostname: string) {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

function isSecureOrLoopbackUrl(value: string) {
    try {
        const parsed = new URL(value)
        return parsed.protocol === 'https:' || (parsed.protocol === 'http:' && isLoopbackHostname(parsed.hostname))
    } catch {
        return false
    }
}

function isValidOriginValue(value: string) {
    try {
        const parsed = new URL(value)
        return parsed.origin === value && (parsed.protocol === 'https:' || (parsed.protocol === 'http:' && isLoopbackHostname(parsed.hostname)))
    } catch {
        return false
    }
}

type Props = {
    app: OrgClient
    activity: OrganizationActivityItem[]
    activityLoaded: boolean
    canViewActivity: boolean
    canManageApps: boolean
    deletingAppId: string | null
    rotatingAppId: string | null
    statusUpdatingAppId: string | null
    rotatedAppSecret: { clientId: string; clientSecret: string } | null
    appMessage: string
    appError?: string
    appSaving: boolean
    maxRedirectUrisPerApp: number | null
    maxAllowedEmbedOriginsPerApp: number | null
    onBack: () => void
    onSaveApp: (appId: string, payload: { app_name: string; redirect_uris: string[]; allowed_embed_origins: string[]; confirm_multi_origin?: boolean }) => Promise<void>
    onDeleteApp: (appId: string) => void
    onRotateAppSecret: (appId: string) => void
    onToggleAppStatus: (appId: string) => void
}

function isAppAuditEvent(item: OrganizationActivityItem, app: OrgClient) {
    const metadata = item.metadata || {}
    const metadataClientId = typeof metadata.client_id === 'string' ? metadata.client_id : ''
    const metadataAppName = typeof metadata.app_name === 'string' ? metadata.app_name : ''
    return item.target_id === app.client.id
        || metadataClientId === app.client.client_id
        || metadataAppName === app.client.app_name
}

export default function PortalWorkspaceAppOverview({
    app,
    activity,
    activityLoaded,
    canViewActivity,
    canManageApps,
    deletingAppId,
    rotatingAppId,
    statusUpdatingAppId,
    rotatedAppSecret,
    appMessage,
    appError,
    appSaving,
    maxRedirectUrisPerApp,
    maxAllowedEmbedOriginsPerApp,
    onBack,
    onSaveApp,
    onDeleteApp,
    onRotateAppSecret,
    onToggleAppStatus,
}: Props) {
    const appIconSrc = resolveApiAssetUrl(app.client.app_icon_url)
    const [draftName, setDraftName] = useState(app.client.app_name)
    const [draftRedirectUris, setDraftRedirectUris] = useState(app.redirect_uris.join('\n'))
    const [draftAllowedEmbedOrigins, setDraftAllowedEmbedOrigins] = useState(app.allowed_embed_origins.join('\n'))
    const [multiOriginConfirmed, setMultiOriginConfirmed] = useState(false)
    const appAuditLogs = useMemo(
        () => activity.filter(item => isAppAuditEvent(item, app)).slice(0, 20),
        [activity, app],
    )
    const normalizedRedirectUris = useMemo(
        () => draftRedirectUris.split('\n').map(uri => uri.trim()).filter(Boolean),
        [draftRedirectUris],
    )
    const normalizedAllowedEmbedOrigins = useMemo(
        () => draftAllowedEmbedOrigins.split('\n').map(value => value.trim()).filter(Boolean),
        [draftAllowedEmbedOrigins],
    )
    const invalidRedirectUris = useMemo(
        () => normalizedRedirectUris.filter(value => {
            try {
                new URL(value)
                return false
            } catch {
                return true
            }
        }),
        [normalizedRedirectUris],
    )
    const insecureRedirectUris = useMemo(
        () => normalizedRedirectUris.filter(value => !isSecureOrLoopbackUrl(value)),
        [normalizedRedirectUris],
    )
    const invalidAllowedEmbedOrigins = useMemo(
        () => normalizedAllowedEmbedOrigins.filter(value => !isValidOriginValue(value)),
        [normalizedAllowedEmbedOrigins],
    )
    const suggestedEmbedOrigins = useMemo(() => {
        const origins = new Set<string>()
        for (const raw of draftRedirectUris.split('\n')) {
            const value = raw.trim()
            if (!value) continue
            try {
                origins.add(new URL(value).origin)
            } catch {
                continue
            }
        }
        return Array.from(origins)
    }, [draftRedirectUris])
    const missingSuggestedOrigins = useMemo(
        () => suggestedEmbedOrigins.filter(origin => !normalizedAllowedEmbedOrigins.includes(origin)),
        [normalizedAllowedEmbedOrigins, suggestedEmbedOrigins],
    )
    const redirectUriLimitReached = typeof maxRedirectUrisPerApp === 'number' && normalizedRedirectUris.length > maxRedirectUrisPerApp
    const allowedEmbedOriginLimitReached =
        typeof maxAllowedEmbedOriginsPerApp === 'number' && normalizedAllowedEmbedOrigins.length > maxAllowedEmbedOriginsPerApp
    const requiresMultiOriginConfirmation = suggestedEmbedOrigins.length > 1 || new Set(normalizedAllowedEmbedOrigins).size > 1
    const hasChanges = draftName.trim() !== app.client.app_name
        || normalizedRedirectUris.join('\n') !== app.redirect_uris.join('\n')
        || normalizedAllowedEmbedOrigins.join('\n') !== app.allowed_embed_origins.join('\n')

    useEffect(() => {
        setDraftName(app.client.app_name)
        setDraftRedirectUris(app.redirect_uris.join('\n'))
        setDraftAllowedEmbedOrigins(app.allowed_embed_origins.join('\n'))
        setMultiOriginConfirmed(false)
    }, [app.allowed_embed_origins, app.client.app_name, app.redirect_uris])

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault()
        await onSaveApp(app.client.id, {
            app_name: draftName.trim(),
            redirect_uris: normalizedRedirectUris,
            allowed_embed_origins: normalizedAllowedEmbedOrigins,
            confirm_multi_origin: requiresMultiOriginConfirmation ? multiOriginConfirmed : undefined,
        })
    }

    const applySuggestedEmbedOrigins = () => {
        if (missingSuggestedOrigins.length === 0) return
        setDraftAllowedEmbedOrigins([...normalizedAllowedEmbedOrigins, ...missingSuggestedOrigins].join('\n'))
    }

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PortalPageHeader
                eyebrow="Workspace"
                title={app.client.app_name}
                description="App info, redirect configuration, and app-specific audit logs."
                actions={
                    <PortalSecondaryActionButton label="Back to Apps" icon={ArrowLeft} onClick={onBack} />
                }
            />

            <div className="rounded-4xl border border-border bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                        <div className="flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-gray-100">
                                {appIconSrc ? (
                                    <img src={appIconSrc} alt={app.client.app_name} className="h-full w-full object-cover" />
                                ) : (
                                    <AppWindow className="h-6 w-6 text-gray-600" />
                                )}
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-xl font-black text-gray-900">{app.client.app_name}</p>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                    <PortalPill className="border-border bg-white px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                                        {app.client.app_type}
                                    </PortalPill>
                                    <PortalPill tone={app.client.status === 'active' ? 'green' : 'amber'}>
                                        {app.client.status}
                                    </PortalPill>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:w-[28rem]">
                        <PortalStatTile label="Client ID" value={<PortalCodeBlockField value={app.client.client_id} copyable />} />
                        <PortalStatTile label="Created" value={new Date(app.client.created_at).toLocaleString()} />
                    </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div className="rounded-2xl border border-border bg-white p-4">
                        <div className="flex items-center gap-2">
                            <Link2 className="h-4 w-4 text-sky-600" />
                            <p className="text-sm font-black text-gray-900">Redirect URIs</p>
                        </div>
                        <p className="mt-2 text-xs font-semibold text-muted-foreground">
                            Exact callback URLs. Rooiam redirects to one of these after the app login flow completes and matches the current embedding site to the callback with the same origin. Use <span className="font-black">https://</span> for normal sites. Plain <span className="font-black">http://</span> should only be used for localhost or loopback development.
                        </p>
                        <div className="mt-3 space-y-2">
                            {app.redirect_uris.map(uri => (
                                <PortalCodeBlockField key={uri} value={uri} />
                            ))}
                        </div>
                    </div>
                    <div className="rounded-2xl border border-border bg-white p-4">
                        <div className="flex items-center gap-2">
                            <Link2 className="h-4 w-4 text-violet-600" />
                            <p className="text-sm font-black text-gray-900">Allowed Embed Origins</p>
                        </div>
                        <p className="mt-2 text-xs font-semibold text-muted-foreground">
                            Website origins allowed to embed the hosted login widget. Production widget loads are blocked unless the embedding origin is listed here. If one app supports multiple sites, Rooiam will use the callback whose origin matches the current site.
                        </p>
                        <div className="mt-3 space-y-2">
                            {app.allowed_embed_origins.map(origin => (
                                <PortalCodeBlockField key={origin} value={origin} />
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {canManageApps ? (
                <PortalContentCard
                    title="Edit App"
                    subtitle="Update the label, callback URLs, and sites allowed to embed the login widget."
                    icon={Save}
                >
                    <form className="space-y-4" onSubmit={handleSave}>
                        <div className="grid gap-3 lg:grid-cols-2">
                            <PortalInlineMessage tone={redirectUriLimitReached ? 'warning' : 'info'}>
                                {typeof maxRedirectUrisPerApp === 'number'
                                    ? `${normalizedRedirectUris.length} / ${maxRedirectUrisPerApp} redirect URIs for this app.`
                                    : `${normalizedRedirectUris.length} redirect URIs for this app.`}
                            </PortalInlineMessage>
                            <PortalInlineMessage tone={allowedEmbedOriginLimitReached ? 'warning' : 'info'}>
                                {typeof maxAllowedEmbedOriginsPerApp === 'number'
                                    ? `${normalizedAllowedEmbedOrigins.length} / ${maxAllowedEmbedOriginsPerApp} allowed embed origins for this app.`
                                    : `${normalizedAllowedEmbedOrigins.length} allowed embed origins for this app.`}
                            </PortalInlineMessage>
                        </div>
                        <div className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                            How hosted-widget embedding works
                            <PortalHelpTooltip text="Redirect URIs are where users land after login. Allowed embed origins are the sites permitted to show the login widget. The widget only loads on listed origins, and the callback must use the same origin as the site. Keep host pages free of XSS, use a strict Content Security Policy, and prefer one app per site or environment." />
                        </div>
                        {suggestedEmbedOrigins.length > 1 ? (
                            <PortalInlineMessage tone="warning">
                                This app spans multiple sites — Rooiam routes each login to the callback matching the current site. Prefer separate apps for separate products or environments.
                            </PortalInlineMessage>
                        ) : null}
                        {invalidRedirectUris.length > 0 ? (
                            <PortalInlineMessage tone="error">
                                Some redirect URIs are not valid URLs yet. Fix these lines before saving: {invalidRedirectUris.slice(0, 3).join(', ')}{invalidRedirectUris.length > 3 ? '…' : ''}
                            </PortalInlineMessage>
                        ) : null}
                        {insecureRedirectUris.length > 0 ? (
                            <PortalInlineMessage tone="warning">
                                Non-loopback callback URLs should use <span className="font-black">https://</span>. Rooiam only expects plain <span className="font-black">http://</span> for localhost or loopback development.
                            </PortalInlineMessage>
                        ) : null}
                        {invalidAllowedEmbedOrigins.length > 0 ? (
                            <PortalInlineMessage tone="error">
                                Allowed embed origins must be plain site origins like <span className="font-black">https://app.example.com</span>. Do not paste callback paths here.
                            </PortalInlineMessage>
                        ) : null}
                        {missingSuggestedOrigins.length > 0 ? (
                            <PortalInlineMessage tone="warning">
                                Some callback origins are not in the allowed embed-origin list yet. The hosted widget will stay blocked for those sites until you add them explicitly.
                            </PortalInlineMessage>
                        ) : null}
                        <div>
                            <label className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
                                App Name
                            </label>
                            <input
                                value={draftName}
                                onChange={event => setDraftName(event.target.value)}
                                className="w-full rounded-2xl border border-border bg-muted/50 px-4 py-3 text-sm font-semibold outline-none transition-all focus:ring-2 focus:ring-primary"
                                placeholder="CoffeeShop"
                            />
                        </div>
                        <div className="grid gap-4 lg:grid-cols-2">
                            <div>
                                <div className="mb-2 flex items-center">
                                    <label className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
                                        Redirect URIs
                                    </label>
                                    <PortalHelpTooltip text="Exact callback URLs, one per line — where users land after login. Rooiam picks the callback whose origin matches the site the user signed in from. Use https:// everywhere except localhost." />
                                </div>
                                <PortalTextareaField
                                    value={draftRedirectUris}
                                    onChange={setDraftRedirectUris}
                                    rows={5}
                                    placeholder={'https://app.example.com/callback\nhttp://localhost:5180/callback'}
                                />
                            </div>
                            <div>
                                <div className="mb-2 flex items-center">
                                    <label className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
                                        Allowed Embed Origins
                                    </label>
                                    <PortalHelpTooltip text="Site origins (like https://app.example.com — not full paths) allowed to show the login widget. For a multi-site app, list each site; the widget only loads on these origins. Use https:// except on localhost." />
                                </div>
                                <PortalTextareaField
                                    value={draftAllowedEmbedOrigins}
                                    onChange={setDraftAllowedEmbedOrigins}
                                    rows={5}
                                    placeholder={'https://app.example.com\nhttps://staging.example.com\nhttp://localhost:5180'}
                                />
                                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap gap-2">
                                        {suggestedEmbedOrigins.map(origin => (
                                            <span key={origin} className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-black text-violet-700">
                                                {origin}
                                            </span>
                                        ))}
                                    </div>
                                    {missingSuggestedOrigins.length > 0 ? (
                                        <button
                                            type="button"
                                            onClick={applySuggestedEmbedOrigins}
                                            className="rounded-full border border-violet-200 bg-white px-3 py-1.5 text-[11px] font-black text-violet-700 transition hover:bg-violet-50"
                                        >
                                            Add {missingSuggestedOrigins.length === 1 ? 'Suggested Origin' : `All ${missingSuggestedOrigins.length} Suggested Origins`}
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                        {requiresMultiOriginConfirmation ? (
                            <label className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                                <input
                                    type="checkbox"
                                    checked={multiOriginConfirmed}
                                    onChange={event => setMultiOriginConfirmed(event.target.checked)}
                                    className="mt-1 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                                />
                                <span className="flex items-center">
                                    I confirm this app is intentionally shared across multiple sites.
                                    <PortalHelpTooltip text="Rooiam will route each hosted-widget sign-in by matching the current site origin to the registered callback with the same origin." />
                                </span>
                            </label>
                        ) : null}
                        <div className="flex justify-start">
                            <PortalPrimarySaveButton
                                type="submit"
                                label="Save App"
                                loading={appSaving}
                                disabled={appSaving || !hasChanges || redirectUriLimitReached || allowedEmbedOriginLimitReached || invalidRedirectUris.length > 0 || invalidAllowedEmbedOrigins.length > 0 || !draftName.trim() || normalizedRedirectUris.length === 0 || normalizedAllowedEmbedOrigins.length === 0 || (requiresMultiOriginConfirmation && !multiOriginConfirmed)}
                            />
                        </div>
                        {appError ? <PortalInlineMessage tone="error">{appError}</PortalInlineMessage> : null}
                        {!appError && appMessage ? <PortalInlineMessage tone="success">{appMessage}</PortalInlineMessage> : null}
                    </form>
                </PortalContentCard>
            ) : null}

            <div className="rounded-4xl border border-border bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-sm font-black text-gray-900">App Audit Logs</p>
                        <p className="mt-1 text-sm font-medium text-muted-foreground">Recent activity tied to this app registration.</p>
                    </div>
                    <span className="cute-badge bg-secondary text-secondary-foreground">{appAuditLogs.length} recent</span>
                </div>
                <div className="mt-4 space-y-2">
                    {!canViewActivity ? (
                        <div className="rounded-2xl border border-border bg-white px-3 py-3 text-sm font-bold text-muted-foreground">
                            You do not have permission to view app audit logs.
                        </div>
                    ) : !activityLoaded ? (
                        <div className="rounded-2xl border border-border bg-white px-3 py-3 text-sm font-bold text-muted-foreground">
                            Loading app audit logs…
                        </div>
                    ) : appAuditLogs.length === 0 ? (
                        <div className="rounded-2xl border border-border bg-white px-3 py-3 text-sm font-bold text-muted-foreground">
                            No audit logs yet for this app.
                        </div>
                    ) : (
                        appAuditLogs.map(item => <PortalAuditEventItem key={item.id} item={item} compact />)
                    )}
                </div>
            </div>

            {canManageApps ? (
                <PortalDangerZoneCard
                    title="App Danger Zone"
                    subtitle="These actions affect live app integrations and can break clients immediately."
                >
                    <div className="rounded-2xl border border-rose-200 bg-white p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <p className="text-sm font-black text-rose-900">Pause or resume app</p>
                                <p className="mt-1 text-sm font-medium text-rose-700">
                                    Pausing disables this app for end-users and integrations until resumed.
                                </p>
                            </div>
                            <PortalDangerActionButton
                                label={statusUpdatingAppId === app.client.id ? 'Working…' : app.client.status === 'active' ? 'Pause App' : 'Resume App'}
                                loading={statusUpdatingAppId === app.client.id}
                                onClick={() => onToggleAppStatus(app.client.id)}
                                disabled={statusUpdatingAppId === app.client.id}
                            />
                        </div>
                    </div>
                    {app.client.app_type === 'web' ? (
                        <div className="rounded-2xl border border-rose-200 bg-white p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                    <p className="text-sm font-black text-rose-900">Rotate app secret</p>
                                    <p className="mt-1 text-sm font-medium text-rose-700">
                                        Rotating invalidates the previous secret immediately. Update every dependent integration before using the new secret.
                                    </p>
                                </div>
                                <PortalDangerActionButton
                                    label={rotatingAppId === app.client.id ? 'Working…' : 'Rotate Secret'}
                                    icon={RefreshCw}
                                    loading={rotatingAppId === app.client.id}
                                    onClick={() => onRotateAppSecret(app.client.id)}
                                    disabled={rotatingAppId === app.client.id || app.client.status !== 'active'}
                                />
                            </div>
                            {rotatedAppSecret?.clientId === app.client.client_id ? (
                                <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50 p-3">
                                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-sky-700">New App Secret</p>
                                    <PortalCodeBlockField value={rotatedAppSecret.clientSecret} tone="sky" copyable className="mt-1" />
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                    <div className="rounded-2xl border border-rose-200 bg-white p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <p className="text-sm font-black text-rose-900">Delete app</p>
                                <p className="mt-1 text-sm font-medium text-rose-700">
                                    Deleting permanently removes the app registration and all redirect URIs. Existing integrations stop working and this cannot be undone.
                                </p>
                            </div>
                            <PortalDangerActionButton
                                label={deletingAppId === app.client.id ? 'Working…' : 'Delete App'}
                                icon={Trash2}
                                loading={deletingAppId === app.client.id}
                                onClick={() => onDeleteApp(app.client.id)}
                                disabled={deletingAppId === app.client.id}
                            />
                        </div>
                    </div>
                    {appMessage ? <PortalInlineMessage tone="success">{appMessage}</PortalInlineMessage> : null}
                </PortalDangerZoneCard>
            ) : null}
        </div>
    )
}
