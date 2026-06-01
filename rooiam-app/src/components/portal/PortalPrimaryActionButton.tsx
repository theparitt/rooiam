import type { LucideIcon } from 'lucide-react'
import { Loader2 } from 'lucide-react'

type Props = {
    label: string
    icon?: LucideIcon
    loading?: boolean
    loadingLabel?: string
    disabled?: boolean
    type?: 'button' | 'submit'
    onClick?: () => void
    className?: string
}

export default function PortalPrimaryActionButton({
    label,
    icon: Icon,
    loading = false,
    loadingLabel,
    disabled = false,
    type = 'button',
    onClick,
    className = '',
}: Props) {
    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled}
            className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-black shadow-md transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50 wizard-btn ${className}`.trim()}
        >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
            {loading ? (loadingLabel || label) : label}
        </button>
    )
}
