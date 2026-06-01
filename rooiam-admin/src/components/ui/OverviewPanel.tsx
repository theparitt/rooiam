import type { LucideIcon } from 'lucide-react'
import SectionHeader from './SectionHeader'

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

export default function OverviewPanel({
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
            <SectionHeader
                title={title}
                subtitle={subtitle}
                icon={icon}
                tone={tone}
                action={action}
            />
            <div className={bodyClassName}>{children}</div>
        </div>
    )
}
