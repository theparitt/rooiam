import { History } from 'lucide-react'
import { actionLabel } from '../../lib/audit-events'
import type { OrganizationActivityItem } from '../../lib/portal-types'

type Props = {
    item: OrganizationActivityItem | null
    emptyText?: string
}

export default function PortalConfigChangeNote({
    item,
    emptyText = 'No configuration changes recorded yet.',
}: Props) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-start gap-3">
                <History className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                {item ? (
                    <div className="min-w-0">
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Last Change</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                            {actionLabel(item.action)}
                        </p>
                        <p className="mt-1 text-xs font-medium text-slate-600">
                            {item.actor_display_name || item.actor_email || 'System'}
                            {' · '}
                            {new Date(item.created_at).toLocaleString()}
                        </p>
                    </div>
                ) : (
                    <div className="min-w-0">
                        <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Last Change</p>
                        <p className="mt-1 text-sm font-medium text-slate-600">{emptyText}</p>
                    </div>
                )}
            </div>
        </div>
    )
}
