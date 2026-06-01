type Status = 'active' | 'suspended' | 'archived' | string

const CONFIG: Record<string, { tone: string; label: string }> = {
    active:    { tone: 'border-emerald-200 bg-emerald-100 text-emerald-700', label: 'active' },
    suspended: { tone: 'border-amber-200 bg-amber-100 text-amber-700',       label: 'suspended' },
    archived:  { tone: 'border-gray-200 bg-gray-100 text-gray-500',          label: 'archived' },
}

function getConfig(status: string) {
    return CONFIG[status] ?? { tone: 'border-gray-200 bg-gray-100 text-gray-500', label: status }
}

type Props = {
    status: Status
    className?: string
}

export default function StatusBadge({ status, className = '' }: Props) {
    const { tone, label } = getConfig(status)
    return (
        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black ${tone} ${className}`.trim()}>
            {label}
        </span>
    )
}
