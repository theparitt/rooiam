import { Check, Loader2, Save } from 'lucide-react'

type Props = {
    loading?: boolean
    saved?: boolean
    disabled?: boolean
    label?: string
    onClick?: () => void
    type?: 'button' | 'submit'
    className?: string
}

export default function PrimarySaveButton({
    loading = false,
    saved = false,
    disabled = false,
    label = 'Save Changes',
    onClick,
    type = 'button',
    className = '',
}: Props) {
    return (
        <button
            type={type}
            onClick={onClick}
            disabled={disabled}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl font-black text-sm transition-all ${saved ? 'bg-green-100 text-green-700' : 'wizard-btn'} disabled:opacity-50 disabled:cursor-not-allowed ${className}`.trim()}
        >
            {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
                <>
                    <Check className="w-4 h-4" />
                    Saved!
                </>
            ) : (
                <>
                    <Save className="w-4 h-4" />
                    {label}
                </>
            )}
        </button>
    )
}
