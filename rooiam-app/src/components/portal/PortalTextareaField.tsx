type Props = {
    value: string
    onChange: (value: string) => void
    rows?: number
    placeholder?: string
    className?: string
}

export default function PortalTextareaField({
    value,
    onChange,
    rows = 5,
    placeholder,
    className = '',
}: Props) {
    return (
        <textarea
            value={value}
            onChange={event => onChange(event.target.value)}
            rows={rows}
            placeholder={placeholder}
            className={`w-full resize-none rounded-2xl border border-border bg-muted/50 px-4 py-3 text-sm font-mono outline-none transition-all focus:ring-2 focus:ring-primary ${className}`.trim()}
        />
    )
}
