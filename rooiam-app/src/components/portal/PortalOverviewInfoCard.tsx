import type { LucideIcon } from 'lucide-react'

type Props = {
    title?: string
    subtitle?: string
    icon?: LucideIcon
    trailing?: React.ReactNode
    children?: React.ReactNode
    className?: string
}

export default function PortalOverviewInfoCard({
    title,
    subtitle,
    icon: Icon,
    trailing,
    children,
    className = '',
}: Props) {
    return (
        <div className={`rounded-2xl border bg-card p-4 sm:p-5 ${className}`.trim()}>
            {title || subtitle || Icon || trailing ? (
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        {title ? <p className="text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">{title}</p> : null}
                        {subtitle ? <p className="mt-1 text-xs font-medium text-muted-foreground">{subtitle}</p> : null}
                    </div>
                    {Icon ? <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" /> : trailing}
                </div>
            ) : null}
            {children ? <div className={title || subtitle || Icon || trailing ? 'mt-3' : ''}>{children}</div> : null}
        </div>
    )
}
