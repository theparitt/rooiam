export default function PortalFormField({
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
            <label className="mb-1.5 block text-xs font-bold text-muted-foreground">{label}</label>
            {children}
            {hint ? <p className="mt-1 text-[11px] font-semibold text-gray-400">{hint}</p> : null}
        </div>
    )
}
