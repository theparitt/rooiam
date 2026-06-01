import type { LucideIcon } from 'lucide-react'

type Props = {
    label: string
    icon?: LucideIcon
    onClick?: () => void
    type?: 'button' | 'submit'
    disabled?: boolean
    className?: string
    title?: string
}

export default function PortalSecondaryActionButton({
    label,
    icon: Icon,
    onClick,
    type = 'button',
    disabled = false,
    className = '',
    title,
}: Props) {
    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled}
            title={title}
            className={`inline-flex items-center gap-2 rounded-full border border-border bg-white px-4 py-2 text-sm font-black text-foreground transition-colors hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white ${className}`.trim()}
        >
            {Icon ? <Icon className="h-4 w-4" /> : null}
            {label}
        </button>
    )
}
