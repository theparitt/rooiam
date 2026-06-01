type DemoBadgeProps = {
  className?: string
}

// Keep badge visuals aligned with docs/internal/12_demo_badge_rules.md.
export default function DemoBadge({ className = '' }: DemoBadgeProps) {
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.22rem',
        borderRadius: '999px',
        padding: '0.18rem 0.45rem',
        fontSize: '0.5rem',
        fontWeight: 900,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: '#fff',
        background: 'rgba(236, 72, 153, 0.92)',
        boxShadow: '0 10px 22px rgba(236, 72, 153, 0.22)',
      }}
    >
      <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2.5">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      Demo
    </span>
  )
}
