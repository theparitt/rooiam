import { Search } from 'lucide-react'

type Props = {
    value: string
    onChange: (value: string) => void
    placeholder: string
    className?: string
}

export default function PortalSearchField({
    value,
    onChange,
    placeholder,
    className = '',
}: Props) {
    return (
        <label className={`relative block w-full sm:max-w-sm ${className}`.trim()}>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
                type="text"
                value={value}
                onChange={event => onChange(event.target.value)}
                placeholder={placeholder}
                className="w-full rounded-2xl border border-border bg-white py-2.5 pl-9 pr-4 text-sm font-medium outline-none transition-all focus:ring-2 focus:ring-primary"
            />
        </label>
    )
}
