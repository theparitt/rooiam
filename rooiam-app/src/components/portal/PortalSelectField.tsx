type Props = {
    value: string
    onChange: (value: string) => void
    children: React.ReactNode
    className?: string
}

export default function PortalSelectField({
    value,
    onChange,
    children,
    className = '',
}: Props) {
    return (
        <select
            value={value}
            onChange={event => onChange(event.target.value)}
            className={`w-full rounded-2xl border border-border bg-white px-4 py-3 text-sm font-medium outline-none transition-all focus:ring-2 focus:ring-primary ${className}`.trim()}
        >
            {children}
        </select>
    )
}
