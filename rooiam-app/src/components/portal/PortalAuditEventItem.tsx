import React from 'react'
import { ShieldCheck, ServerCrash, Zap, LogIn, LogOut } from 'lucide-react'
import type { OrganizationActivityItem } from '../../lib/portal-types'
import { actionLabel, actionStatusTone, activityContextSummary, type ActionTone } from '../../lib/audit-events'

type Props = {
    item: OrganizationActivityItem
    compact?: boolean
    showBorder?: boolean
}

const STATUS_STYLES: Record<ActionTone, string> = {
    login: 'bg-teal-50 text-teal-700 border-teal-200',
    logout: 'bg-slate-100 text-slate-500 border-slate-300',
    failed: 'bg-rose-50 text-rose-700 border-rose-200',
    delete: 'bg-rose-50 text-rose-700 border-rose-200',
    create: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    modify: 'bg-sky-50 text-sky-700 border-sky-200',
    workspace: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    admin: 'bg-amber-50 text-amber-700 border-amber-200',
    oauth: 'bg-violet-50 text-violet-700 border-violet-200',
    mfa: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    identity: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
    info: 'bg-slate-50 text-slate-700 border-slate-200',
}

export default function PortalAuditEventItem({
    item,
    compact = false,
    showBorder = true,
}: Props) {
    const tone = actionStatusTone(item.action)
    const summary = activityContextSummary(item)
    const apiPath = typeof item.metadata?.path === 'string' ? item.metadata.path : null
    const apiPathLabel = item.action === 'api_key.used' ? apiPath : null
    const apiKeyLabel = typeof item.metadata?.label === 'string' ? item.metadata.label : null
    const actorPrimary = item.actor_display_name || item.actor_email || 'System'
    const actorSecondary = item.action === 'api_key.used'
        ? apiKeyLabel
        : (item.actor_email && item.actor_display_name ? item.actor_email : null)
    const icon = tone === 'login'
        ? <LogIn className="h-3.5 w-3.5" />
        : tone === 'logout'
            ? <LogOut className="h-3.5 w-3.5" />
            : tone === 'create'
                ? <ShieldCheck className="h-3.5 w-3.5" />
                : tone === 'failed' || tone === 'delete'
                    ? <ServerCrash className="h-3.5 w-3.5" />
                    : <Zap className="h-3.5 w-3.5" />

    if (compact) {
        return (
            <div className={`rounded-2xl bg-white px-3 py-3 ${showBorder ? 'border border-border' : ''}`.trim()}>
                <div className="space-y-2">
                    <div className="flex items-start justify-between gap-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLES[tone]}`}>
                            {icon}
                            {actionLabel(item.action)}
                        </span>
                        <div className="shrink-0 text-right">
                            <p className="text-[11px] font-semibold text-muted-foreground">
                                {actorPrimary}
                            </p>
                            {actorSecondary ? (
                                <p className="text-[11px] text-muted-foreground">
                                    {actorSecondary}
                                </p>
                            ) : null}
                            <p className="text-[11px] text-muted-foreground">
                                {new Date(item.created_at).toLocaleString()}
                            </p>
                        </div>
                    </div>
                    {summary ? (
                        <p className="text-[11px] font-semibold text-muted-foreground">
                            {summary}
                        </p>
                    ) : null}
                    {apiPathLabel ? (
                        <p className="font-mono text-[11px] font-semibold text-muted-foreground">
                            {apiPathLabel}
                        </p>
                    ) : null}
                </div>
            </div>
        )
    }

    return (
        <div className={`flex items-start justify-between gap-3 px-4 sm:px-5 py-3.5 sm:py-4 hover:bg-muted/20 transition-colors ${showBorder ? 'border-b' : ''}`.trim()}>
            <div className="min-w-0 flex-1">
                <div className="space-y-1">
                    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold ${STATUS_STYLES[tone]}`}>
                        {icon}
                        {actionLabel(item.action)}
                    </span>
                    <p className="font-bold truncate text-sm">{actionLabel(item.action)}</p>
                    <p className="text-xs text-muted-foreground truncate">
                        {actorPrimary}
                        {actorSecondary ? ` · ${actorSecondary}` : ''}
                    </p>
                    {summary ? (
                        <p className="text-[11px] font-semibold text-muted-foreground truncate">
                            {summary}
                        </p>
                    ) : null}
                    {apiPathLabel ? (
                        <p className="font-mono text-[11px] font-semibold text-muted-foreground truncate">
                            {apiPathLabel}
                        </p>
                    ) : null}
                </div>
            </div>
            <div className="shrink-0 text-right">
                <p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</p>
                {item.ip ? (
                    <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">{item.ip}</p>
                ) : null}
            </div>
        </div>
    )
}
