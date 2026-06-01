type Tone = 'success' | 'error' | 'warning' | 'info'

const toneClasses: Record<Tone, string> = {
    success: 'border-green-200 bg-green-50 text-green-700',
    error: 'border-red-200 bg-red-50 text-red-600',
    warning: 'border-amber-200 bg-amber-50 text-amber-700',
    info: 'border-sky-200 bg-sky-50 text-sky-700',
}

export default function InlineMessage({
    tone,
    children,
    className = '',
}: {
    tone: Tone
    children: React.ReactNode
    className?: string
}) {
    return (
        <p className={`rounded-2xl border px-4 py-2.5 text-xs font-bold ${toneClasses[tone]} ${className}`.trim()}>
            {children}
        </p>
    )
}
