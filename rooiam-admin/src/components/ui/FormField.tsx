export default function FormField({
    label,
    hint,
    children,
    className = '',
}: {
    label: string
    hint?: string
    children: React.ReactNode
    className?: string
}) {
    return (
        <div className={className}>
            <label className="wizard-label">{label}</label>
            {children}
            {hint ? <p className="mt-1 text-[11px] font-semibold text-gray-400">{hint}</p> : null}
        </div>
    )
}
