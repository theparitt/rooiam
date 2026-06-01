import React from 'react'
import { AppWindow, Copy, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import type { OrgClient } from '../../lib/portal-types'
import { resolveApiAssetUrl } from '../../lib/api-base'
import PortalPill from './PortalPill'

function getAppInitials(name: string): string {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part.charAt(0).toUpperCase())
        .join('') || 'AP'
}

type Props = {
    entry: OrgClient
    canManage?: boolean
    deleting?: boolean
    rotating?: boolean
    statusUpdating?: boolean
    onDelete?: (clientId: string) => void
    onRotateSecret?: (clientId: string) => void
    onToggleStatus?: (clientId: string) => void
    onOpenDetail?: (clientId: string) => void
}

export default function PortalClientCard({
    entry,
    canManage = false,
    deleting = false,
    rotating = false,
    statusUpdating = false,
    onDelete,
    onRotateSecret,
    onToggleStatus,
    onOpenDetail,
}: Props) {
    const canRotateSecret = canManage && entry.client.app_type === 'web' && Boolean(onRotateSecret)
    const appInitials = getAppInitials(entry.client.app_name)
    const appIconSrc = resolveApiAssetUrl(entry.client.app_icon_url)
    const redirectPreview = entry.redirect_uris.slice(0, 2)
    const remainingRedirectCount = Math.max(entry.redirect_uris.length - redirectPreview.length, 0)

    return (
        <div className="rounded-3xl border border-border bg-white p-5 shadow-sm transition-colors hover:bg-muted/10">
            <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-sky-200 bg-sky-100 text-sm font-black text-sky-800 shadow-sm">
                        {appIconSrc ? (
                            <img src={appIconSrc} alt={entry.client.app_name} className="h-full w-full object-cover" />
                        ) : (
                            appInitials
                        )}
                    </div>
                    <div className="min-w-0">
                        <button
                            type="button"
                            onClick={() => onOpenDetail?.(entry.client.id)}
                            className="block max-w-full truncate text-left text-sm font-black text-gray-900 transition-colors hover:text-sky-700"
                        >
                            {entry.client.app_name}
                        </button>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                                {entry.client.app_type}
                            </span>
                            <PortalPill tone={entry.client.status === 'active' ? 'green' : 'amber'}>
                                {entry.client.status}
                            </PortalPill>
                        </div>
                        <p className="mt-2 text-xs font-mono text-muted-foreground" title={entry.client.client_id}>
                            {entry.client.client_id}
                        </p>
                    </div>
                </div>
                {(canRotateSecret || (canManage && onDelete)) ? (
                    <div className="flex shrink-0 items-center gap-1">
                        {canRotateSecret ? (
                            <button
                                type="button"
                                onClick={() => onRotateSecret?.(entry.client.id)}
                                disabled={rotating}
                                className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-sky-50 hover:text-sky-700 disabled:opacity-50"
                                title="Rotate app secret"
                            >
                                {rotating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            </button>
                        ) : null}
                        {canManage && onDelete ? (
                            <button
                                type="button"
                                onClick={() => onDelete(entry.client.id)}
                                disabled={deleting}
                                className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                title="Delete app"
                            >
                                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            </button>
                        ) : null}
                    </div>
                ) : null}
            </div>

            <div className="mt-4 space-y-4">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                    <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">Redirect URIs</p>
                        <div className="mt-2 space-y-1.5">
                            {redirectPreview.map(uri => (
                                <code
                                    key={uri}
                                    className="block truncate rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs font-mono text-gray-600"
                                    title={uri}
                                >
                                    {uri}
                                </code>
                            ))}
                            {remainingRedirectCount > 0 ? (
                                <p className="text-[11px] font-semibold text-muted-foreground">
                                    +{remainingRedirectCount} more redirect {remainingRedirectCount === 1 ? 'URI' : 'URIs'}
                                </p>
                            ) : null}
                        </div>
                    </div>
                    <div className="sm:text-right">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">Created</p>
                        <p className="mt-2 text-xs font-semibold text-gray-700">
                            {new Date(entry.client.created_at).toLocaleDateString()}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                    <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(entry.client.client_id)}
                        className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-xs font-bold text-gray-700 transition-colors hover:bg-muted/30"
                        title="Copy app client ID"
                    >
                        <Copy className="h-3.5 w-3.5" />
                        Copy Client ID
                    </button>
                    {onOpenDetail ? (
                        <button
                            type="button"
                            onClick={() => onOpenDetail(entry.client.id)}
                            className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700 transition-colors hover:bg-sky-100"
                        >
                            <AppWindow className="h-3.5 w-3.5" />
                            App Info
                        </button>
                    ) : null}
                    {canManage ? (
                        <>
                            {canRotateSecret ? (
                                <button
                                    type="button"
                                    onClick={() => onRotateSecret?.(entry.client.id)}
                                    disabled={rotating || entry.client.status !== 'active'}
                                    className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-xs font-bold text-gray-700 transition-colors hover:bg-muted/30 disabled:opacity-50"
                                >
                                    {rotating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                    Rotate Secret
                                </button>
                            ) : null}
                            {onToggleStatus ? (
                                <button
                                    type="button"
                                    onClick={() => onToggleStatus(entry.client.id)}
                                    disabled={statusUpdating}
                                    className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-xs font-bold text-gray-700 transition-colors hover:bg-muted/30 disabled:opacity-50"
                                >
                                    {statusUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                    {entry.client.status === 'active' ? 'Pause App' : 'Resume App'}
                                </button>
                            ) : null}
                            {onDelete ? (
                                <button
                                    type="button"
                                    onClick={() => onDelete(entry.client.id)}
                                    disabled={deleting}
                                    className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
                                >
                                    {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                    Delete App
                                </button>
                            ) : null}
                        </>
                    ) : null}
                </div>
            </div>
        </div>
    )
}
