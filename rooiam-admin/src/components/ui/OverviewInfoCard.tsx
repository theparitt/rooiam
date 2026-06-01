import type { LucideIcon } from 'lucide-react'

type Props = {
    title?: string
    subtitle?: string
    icon?: LucideIcon
    iconContent?: React.ReactNode
    children: React.ReactNode
    className?: string
}

export default function OverviewInfoCard({
    title,
    subtitle,
    icon: Icon,
    iconContent,
    children,
    className = '',
}: Props) {
    return (
        <div className={`rounded-2xl border bg-card p-3 sm:p-4 ${className}`.trim()}>
            {title || subtitle ? (
                <div className="mb-3 flex items-start gap-3">
                    {Icon ? (
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : iconContent ? (
                        <div className="shrink-0">{iconContent}</div>
                    ) : null}
                    <div className="min-w-0">
                        {title ? <p className="truncate text-sm font-bold">{title}</p> : null}
                        {subtitle ? <p className="mt-1 text-xs font-medium text-muted-foreground">{subtitle}</p> : null}
                    </div>
                </div>
            ) : null}
            {children}
        </div>
    )
}
