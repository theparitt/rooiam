type PortalPillTone = 'gray' | 'green' | 'blue' | 'amber' | 'purple' | 'sky'

const TONES: Record<PortalPillTone, string> = {
    gray: 'border-gray-200 bg-gray-50 text-gray-600',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    blue: 'border-blue-200 bg-blue-100 text-blue-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    purple: 'border-purple-200 bg-purple-100 text-purple-700',
    sky: 'border-sky-200 bg-sky-100 text-sky-800',
}

type Props = {
    children: React.ReactNode
    tone?: PortalPillTone
    className?: string
}

export default function PortalPill({
    children,
    tone = 'gray',
    className = '',
}: Props) {
    return (
        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black ${TONES[tone]} ${className}`.trim()}>
            {children}
        </span>
    )
}
