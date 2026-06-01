import type { LucideIcon } from 'lucide-react'

type Props = {
    title?: string
    subtitle?: string
    icon?: LucideIcon
    action?: React.ReactNode
    children?: React.ReactNode
    className?: string
}

export default function ContentCard({
    title,
    subtitle,
    icon: Icon,
    action,
    children,
    className = '',
}: Props) {
    return (
        <div className={`rounded-3xl border border-border bg-white p-5 shadow-sm ${className}`.trim()}>
            {title || subtitle || action ? (
                <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        {title ? (
                            <h3 className="flex items-center gap-2 text-base font-black text-gray-800">
                                {Icon ? <Icon className="h-4 w-4 text-sky-500" /> : null}
                                {title}
                            </h3>
                        ) : null}
                        {subtitle ? (
                            <p className="mt-1 text-xs font-semibold text-gray-400">{subtitle}</p>
                        ) : null}
                    </div>
                    {action ? <div className="shrink-0">{action}</div> : null}
                </div>
            ) : null}
            {children}
        </div>
    )
}
