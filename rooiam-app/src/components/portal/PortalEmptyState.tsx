import type { LucideIcon } from 'lucide-react'

export default function PortalEmptyState({
    icon: Icon,
    title,
    description,
}: {
    icon?: LucideIcon
    title: string
    description?: string
}) {
    return (
        <div className="rounded-3xl border border-border bg-white px-6 py-10 text-center shadow-sm">
            {Icon ? <Icon className="mx-auto mb-3 h-8 w-8 text-gray-300" /> : null}
            <p className="text-sm font-bold text-gray-700">{title}</p>
            {description ? <p className="mt-1 text-xs font-semibold text-gray-400">{description}</p> : null}
        </div>
    )
}
