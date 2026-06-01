import type { LucideIcon } from 'lucide-react'

type Props = {
    title: string
    value: string
    description: string
    icon: LucideIcon
    colorClass: string
    surfaceClass: string
    className?: string
}

export default function PortalOverviewStatCard({
    title,
    value,
    description,
    icon: Icon,
    colorClass,
    surfaceClass,
    className = '',
}: Props) {
    return (
        <div
            className={`rounded-3xl border-2 p-4 sm:p-5 transition-transform duration-300 hover:-translate-y-1 ${surfaceClass} ${className}`.trim()}
        >
            <div className="mb-3 flex items-start justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</p>
                <Icon className={`h-5 w-5 shrink-0 ${colorClass}`} />
            </div>
            <p className="mb-1 truncate text-2xl font-black sm:text-3xl">{value}</p>
            <p className="text-xs font-medium text-muted-foreground">{description}</p>
        </div>
    )
}
