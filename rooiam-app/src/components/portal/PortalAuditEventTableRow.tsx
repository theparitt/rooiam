import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ServerCrash, LogIn, LogOut, Braces, Trash2, Plus, Pencil, Building2, Shield, Key, Fingerprint, User, Info } from 'lucide-react'
import type { OrganizationActivityItem } from '../../lib/portal-types'
import { actionLabel, actionStatusTone, activityContextSummary, apiRouteArea, apiRoutePurpose } from '../../lib/audit-events'

type Props = {
    item: OrganizationActivityItem
    showBorder?: boolean
    onFilterClick?: (term: string) => void
}

const TONE_STYLES = {
    login:     'bg-teal-50 text-teal-700 border-teal-200',
    logout:    'bg-slate-100 text-slate-500 border-slate-300',
    failed:    'bg-rose-50 text-rose-700 border-rose-200',
    delete:    'bg-red-100 text-red-700 border-red-300',
    create:    'bg-emerald-50 text-emerald-700 border-emerald-200',
    modify:    'bg-sky-50 text-sky-700 border-sky-200',
    workspace: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    admin:     'bg-amber-50 text-amber-700 border-amber-200',
    oauth:     'bg-violet-50 text-violet-700 border-violet-200',
    mfa:       'bg-cyan-50 text-cyan-700 border-cyan-200',
    identity:  'bg-purple-50 text-purple-700 border-purple-200',
    info:      'bg-blue-50 text-blue-700 border-blue-200',
} as const

const TONE_ICONS: Record<string, React.ReactNode> = {
    login:     <LogIn className="w-3.5 h-3.5" />,
    logout:    <LogOut className="w-3.5 h-3.5" />,
    failed:    <ServerCrash className="w-3.5 h-3.5" />,
    delete:    <Trash2 className="w-3.5 h-3.5" />,
    create:    <Plus className="w-3.5 h-3.5" />,
    modify:    <Pencil className="w-3.5 h-3.5" />,
    workspace: <Building2 className="w-3.5 h-3.5" />,
    admin:     <Shield className="w-3.5 h-3.5" />,
    oauth:     <Key className="w-3.5 h-3.5" />,
    mfa:       <Fingerprint className="w-3.5 h-3.5" />,
    identity:  <User className="w-3.5 h-3.5" />,
    info:      <Info className="w-3.5 h-3.5" />,
}

function hasMetadata(meta: Record<string, unknown>): boolean {
    return meta != null && typeof meta === 'object' && Object.keys(meta).length > 0
}

export default function PortalAuditEventTableRow({
    item,
    showBorder = true,
    onFilterClick,
}: Props) {
    const navigate = useNavigate()
    const [expanded, setExpanded] = useState(false)
    const tone = actionStatusTone(item.action)
    const showMeta = hasMetadata(item.metadata)
    const appName = typeof item.metadata?.app_name === 'string' ? item.metadata.app_name : null
    const workspaceSlug = typeof item.metadata?.workspace_slug === 'string' ? item.metadata.workspace_slug : null
    const apiPath = typeof item.metadata?.path === 'string' ? item.metadata.path : null
    const apiKeyLabel = typeof item.metadata?.label === 'string' ? item.metadata.label : null
    const summary = activityContextSummary(item)
    const icon = TONE_ICONS[tone]
    const actionContext = item.action === 'api_key.used'
        ? (apiKeyLabel || 'Workspace API key')
        : (appName || (workspaceSlug ? `Workspace ${workspaceSlug}` : ''))
    const targetTypeLabel = item.target_type === 'tenant_api_key'
        ? apiRouteArea(apiPath)
        : item.target_type.replace(/_/g, ' ')
    const targetDisplay = item.target_type === 'tenant_api_key'
        ? (apiPath || '-')
        : item.target_id
    const targetDetail = item.target_type === 'tenant_api_key'
        ? apiRoutePurpose(apiPath)
        : item.target_id
    const actorPrimary = item.actor_display_name || item.actor_email || (item.actor_user_id ? 'Unknown user' : 'System')
    const actorSecondary = item.action === 'api_key.used'
        ? apiKeyLabel
        : (item.actor_email && item.actor_display_name ? item.actor_email : (item.actor_user_id ? item.actor_user_id : null))

    const applyFilter = (term: string | null | undefined) => {
        const next = term?.trim()
        if (next && onFilterClick) {
            onFilterClick(next)
        }
    }
    const openWorkspace = () => {
        if (!workspaceSlug) return
        navigate(`/workspace/${workspaceSlug}/overview`)
    }
    const openTarget = () => {
        if (item.target_type === 'tenant_api_key' && targetDisplay) {
            applyFilter(targetDisplay)
            return
        }
        if (!item.target_id) return
        if (item.target_type === 'organization' || item.target_type === 'workspace') {
            const targetSlug = workspaceSlug || item.target_id
            navigate(`/workspace/${targetSlug}/overview`)
            return
        }
        applyFilter(item.target_id)
    }

    return (
        <React.Fragment>
            <tr className={`hover:bg-muted/20 transition-colors ${showBorder && !expanded ? 'border-b' : ''}`}>
                <td className="px-3 sm:px-5 py-3 sm:py-4 whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(item.created_at).toLocaleString()}
                </td>
                <td className="px-3 sm:px-5 py-3 sm:py-4">
                    <div className="space-y-1">
                        <button
                            type="button"
                            onClick={() => applyFilter(item.action)}
                            title={`Filter by action: ${item.action}`}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border hover:opacity-80 transition-opacity ${TONE_STYLES[tone]}`}
                        >
                            {icon}
                            {actionLabel(item.action)}
                        </button>
                        {summary && !actionContext ? (
                            <div className="flex flex-wrap items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                                {appName && workspaceSlug && item.action !== 'api_key.used' ? (
                                    <>
                                        <span>{appName}</span>
                                        <span>·</span>
                                        <button
                                            type="button"
                                            onClick={openWorkspace}
                                            className="hover:text-primary transition-colors"
                                            title={`Open workspace ${workspaceSlug}`}
                                        >
                                            Workspace {workspaceSlug}
                                        </button>
                                    </>
                                ) : (
                                    <span>{summary}</span>
                                )}
                            </div>
                        ) : null}
                        {actionContext ? (
                            <p className="text-[11px] font-semibold text-muted-foreground truncate">
                                {actionContext}
                            </p>
                        ) : null}
                    </div>
                </td>
                <td className="px-3 sm:px-5 py-3 sm:py-4 font-mono text-xs max-w-[150px] truncate" title={item.actor_user_id || 'System'}>
                    <div className="flex flex-col max-w-[180px]">
                        <button
                            type="button"
                            onClick={() => applyFilter(actorPrimary)}
                            className="font-semibold text-xs not-italic truncate text-foreground text-left hover:text-primary transition-colors"
                            title={`Filter by actor: ${actorPrimary}`}
                        >
                            {actorPrimary}
                        </button>
                        {actorSecondary ? (
                            <button
                                type="button"
                                onClick={() => applyFilter(actorSecondary)}
                                className="not-italic text-[10px] text-muted-foreground truncate text-left hover:text-primary transition-colors"
                                title={item.action === 'api_key.used' ? `Filter by key label: ${actorSecondary}` : `Filter by actor detail: ${actorSecondary}`}
                            >
                                {actorSecondary}
                            </button>
                        ) : null}
                    </div>
                </td>
                <td className="px-3 sm:px-5 py-3 sm:py-4 hidden sm:table-cell">
                    <div className="flex flex-col max-w-[220px]">
                        <span className="font-semibold text-xs">{targetTypeLabel}</span>
                        <button
                            type="button"
                            onClick={openTarget}
                            className="font-mono text-[10px] text-muted-foreground truncate text-left hover:text-primary transition-colors disabled:cursor-default disabled:hover:text-muted-foreground"
                            title={targetDisplay ? `Filter by target: ${targetDisplay}` : ''}
                            disabled={!targetDisplay}
                        >
                            {targetDisplay}
                        </button>
                        {targetDetail && targetDetail !== targetDisplay ? (
                            <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[150px]">
                                {targetDetail}
                            </span>
                        ) : null}
                    </div>
                </td>
                <td className="px-3 sm:px-5 py-3 sm:py-4 font-mono text-xs text-muted-foreground hidden md:table-cell">
                    {item.ip ? (
                        <button
                            type="button"
                            onClick={() => applyFilter(item.ip)}
                            className="hover:text-primary transition-colors"
                            title={`Filter by IP: ${item.ip}`}
                        >
                            {item.ip}
                        </button>
                    ) : '-'}
                </td>
                <td className="px-2 sm:px-3 py-3 sm:py-4 text-right">
                    {showMeta && (
                        <button
                            type="button"
                            onClick={() => setExpanded(v => !v)}
                            title="Show event metadata — extra context captured with this event (app, device, reason, etc.)"
                            className={`inline-flex items-center justify-center w-6 h-6 rounded-md border transition-colors ${
                                expanded
                                    ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                                    : 'bg-muted/30 border-muted-foreground/20 text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                            }`}
                        >
                            <Braces className="w-3 h-3" />
                        </button>
                    )}
                </td>
            </tr>
            {expanded && (
                <tr className={showBorder ? 'border-b' : ''}>
                    <td colSpan={6} className="px-3 sm:px-5 pb-3 pt-0">
                        <pre className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-[11px] font-mono text-slate-700 overflow-x-auto whitespace-pre-wrap break-all">
                            {JSON.stringify(item.metadata, null, 2)}
                        </pre>
                    </td>
                </tr>
            )}
        </React.Fragment>
    )
}
