import { HelpCircle } from 'lucide-react'
import React from 'react'
import PortalInlineMessage from './PortalInlineMessage'

export default function PortalHelpLabel({
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
    const [open, setOpen] = React.useState(false)

    return (
        <div className={className}>
            <div className="flex items-center gap-2 mb-1.5">
                <label className="text-xs font-bold text-muted-foreground">{label}</label>
                <button
                    type="button"
                    onClick={() => setOpen(value => !value)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={`What is ${label}?`}
                >
                    <HelpCircle className="w-4 h-4" />
                </button>
            </div>
            {hint ? <p className="mb-2 text-xs font-semibold text-gray-400">{hint}</p> : null}
            {open ? <PortalInlineMessage tone="info">{help}</PortalInlineMessage> : null}
        </div>
    )
}
