import type { LucideIcon } from 'lucide-react'

type Tone = 'neutral' | 'sky' | 'emerald' | 'violet' | 'amber' | 'rose' | 'indigo'

const TONE_STYLES: Record<Tone, { chip: string; icon: string; title: string; subtitle: string }> = {
    neutral: {
        chip: 'bg-white/90 ring-gray-200',
        icon: 'text-gray-700',
        title: 'text-gray-900',
        subtitle: 'text-muted-foreground',
    },
    sky: {
        chip: 'bg-sky-50 ring-sky-100',
        icon: 'text-sky-700',
        title: 'text-gray-900',
        subtitle: 'text-sky-700/80',
    },
    emerald: {
        chip: 'bg-emerald-50 ring-emerald-100',
        icon: 'text-emerald-700',
        title: 'text-gray-900',
        subtitle: 'text-emerald-700/80',
    },
    violet: {
        chip: 'bg-violet-50 ring-violet-100',
        icon: 'text-violet-700',
        title: 'text-gray-900',
        subtitle: 'text-violet-700/80',
    },
    amber: {
        chip: 'bg-amber-50 ring-amber-100',
        icon: 'text-amber-700',
        title: 'text-gray-900',
        subtitle: 'text-amber-700/80',
    },
    rose: {
        chip: 'bg-rose-50 ring-rose-100',
        icon: 'text-rose-700',
        title: 'text-gray-900',
        subtitle: 'text-rose-700/80',
    },
    indigo: {
        chip: 'bg-indigo-50 ring-indigo-100',
        icon: 'text-indigo-700',
        title: 'text-gray-900',
        subtitle: 'text-indigo-700/80',
    },
}

type Props = {
    title: string
    subtitle?: string
    icon?: LucideIcon
    action?: React.ReactNode
    tone?: Tone
    className?: string
}

export default function SectionHeader({
    title,
    subtitle,
    icon: Icon,
    action,
    tone = 'neutral',
    className = '',
}: Props) {
    const styles = TONE_STYLES[tone]

    return (
        <div className={`flex items-start justify-between gap-3 ${className}`.trim()}>
            <div className="flex min-w-0 items-start gap-3">
                {Icon ? (
                    <div className={`rounded-2xl p-2.5 shadow-sm ring-1 ${styles.chip}`}>
                        <Icon className={`h-5 w-5 ${styles.icon}`} />
                    </div>
                ) : null}
                <div className="min-w-0">
                    <h2 className={`text-lg font-black tracking-tight ${styles.title}`}>{title}</h2>
                    {subtitle ? (
                        <p className={`mt-0.5 text-sm font-semibold ${styles.subtitle}`}>{subtitle}</p>
                    ) : null}
                </div>
            </div>
            {action ? <div className="shrink-0">{action}</div> : null}
        </div>
    )
}
