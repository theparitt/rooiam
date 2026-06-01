type PillTone = 'gray' | 'green' | 'blue' | 'amber' | 'purple' | 'rose'

const TONES: Record<PillTone, string> = {
    gray: 'border-gray-200 bg-gray-100 text-gray-700',
    green: 'border-emerald-200 bg-emerald-100 text-emerald-700',
    blue: 'border-sky-200 bg-sky-100 text-sky-700',
    amber: 'border-amber-200 bg-amber-100 text-amber-700',
    purple: 'border-purple-200 bg-purple-100 text-purple-700',
    rose: 'border-rose-200 bg-rose-100 text-rose-700',
}

type Props = {
    children: React.ReactNode
    tone?: PillTone
    className?: string
}

export default function Pill({
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
