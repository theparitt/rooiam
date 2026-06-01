import React from 'react'
import type { LucideIcon } from 'lucide-react'
import PortalSectionHeader from './PortalSectionHeader'

type Props = {
    icon: LucideIcon
    title: string
    subtitle?: string
    action?: React.ReactNode
    tone?: 'neutral' | 'sky' | 'emerald' | 'violet' | 'amber' | 'rose' | 'indigo'
    children: React.ReactNode
    className?: string
    bodyClassName?: string
}

export default function PortalSectionCard({
    icon: Icon,
    title,
    subtitle,
    action,
    tone,
    children,
    className = '',
    bodyClassName = 'p-4 sm:p-6',
}: Props) {
    return (
        <div className={`glass-card rounded-4xl ${className}`.trim()}>
            <div className="border-b bg-white/80 p-4 sm:p-5">
                <PortalSectionHeader icon={Icon} title={title} subtitle={subtitle} action={action} tone={tone} />
            </div>
            <div className={bodyClassName}>{children}</div>
        </div>
    )
}
