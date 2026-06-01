import type { LucideIcon } from 'lucide-react'
import { Loader2 } from 'lucide-react'

type Props = {
    label: string
    icon?: LucideIcon
    loading?: boolean
    disabled?: boolean
    onClick?: () => void
    type?: 'button' | 'submit'
    className?: string
}

export default function PortalDangerActionButton({
    label,
    icon: Icon,
    loading = false,
    disabled = false,
    onClick,
    type = 'button',
    className = '',
}: Props) {
    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled}
            className={`inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-black text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50 ${className}`.trim()}
        >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
            {label}
        </button>
    )
}
