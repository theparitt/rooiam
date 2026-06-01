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
            <svg viewBox="0 0 24 24" className="h-[9px] w-[9px]" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Demo
        </span>
    )
}
