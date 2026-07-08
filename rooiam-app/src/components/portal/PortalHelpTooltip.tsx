import React, { useState } from 'react'
import { HelpCircle } from 'lucide-react'

type Props = {
    text: string
}

export default function PortalHelpTooltip({ text }: Props) {
    const [open, setOpen] = useState(false)
    return (
        <span className="relative inline-flex items-center">
            <button
                type="button"
                onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
                className={`ml-1.5 shrink-0 align-middle rounded-full transition-colors ${open ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                aria-label="Toggle help"
            >
                <HelpCircle className="w-4 h-4" />
            </button>
            {open && (
                <span className="absolute top-full left-0 mt-2 w-72 rounded-2xl border border-border bg-white px-3 py-2.5 text-xs font-medium text-foreground shadow-xl z-50 leading-relaxed">
                    <span className="absolute bottom-full left-3 border-4 border-transparent border-b-border" />
                    {text}
                </span>
            )}
        </span>
    )
}
