import { HelpCircle } from 'lucide-react'
import { useState } from 'react'
import InlineMessage from './InlineMessage'

export default function HelpLabel({
    label,
    help,
    hint,
    className = '',
}: {
    label: string
    help: string
    hint?: string
    className?: string
}) {
    const [open, setOpen] = useState(false)

    return (
        <div className={className}>
            <div className="flex items-center gap-2 mb-1.5">
                <label className="wizard-label mb-0">{label}</label>
                <button
                    type="button"
                    onClick={() => setOpen(value => !value)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label={`What is ${label}?`}
                >
                    <HelpCircle className="w-4 h-4" />
                </button>
            </div>
            {hint ? <p className="mb-2 text-xs font-semibold text-gray-400">{hint}</p> : null}
            {open ? <InlineMessage tone="info">{help}</InlineMessage> : null}
        </div>
    )
}
