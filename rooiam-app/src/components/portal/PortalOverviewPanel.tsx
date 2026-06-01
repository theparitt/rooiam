import type { LucideIcon } from 'lucide-react'
import PortalSectionHeader from './PortalSectionHeader'

type Tone = 'neutral' | 'sky' | 'emerald' | 'violet' | 'amber' | 'rose' | 'indigo'

type Props = {
    title: string
    subtitle?: string
    icon: LucideIcon
    action?: React.ReactNode
    tone?: Tone
    children: React.ReactNode
    className?: string
    bodyClassName?: string
}

export default function PortalOverviewPanel({
    title,
    subtitle,
    icon,
    action,
    tone = 'neutral',
    children,
    className = '',
    bodyClassName = 'mt-4 sm:mt-5',
}: Props) {
    return (
        <div className={`glass-card rounded-4xl p-4 sm:p-6 ${className}`.trim()}>
            <div className="-mx-4 -mt-4 border-b bg-white/80 p-4 sm:-mx-6 sm:-mt-6 sm:p-5 sm:px-6">
                <PortalSectionHeader
                    icon={icon}
                    title={title}
                    subtitle={subtitle}
                    action={action}
                    tone={tone}
                />
            </div>
            <div className={bodyClassName}>{children}</div>
        </div>
    )
}
