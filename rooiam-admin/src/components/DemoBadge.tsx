import { Lock } from 'lucide-react'

type DemoBadgeProps = {
    className?: string
}

// Keep badge visuals aligned with docs/internal/12_demo_badge_rules.md.
export default function DemoBadge({ className = '' }: DemoBadgeProps) {
    return (
        <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] shadow-sm ${className}`.trim()}
            style={{ background: 'rgba(236, 72, 153, 0.92)', color: '#fff' }}
        >
            <Lock className="h-[9px] w-[9px]" />
            Demo
        </span>
    )
}
