import React from 'react'
import { Check, Copy } from 'lucide-react'

type Props = {
    label?: string
    value: string
    tone?: 'neutral' | 'sky' | 'emerald'
    copyable?: boolean
    className?: string
}

const toneClasses = {
    neutral: 'border-border bg-white text-foreground',
    sky: 'border-sky-200 bg-white text-foreground',
    emerald: 'border-emerald-200 bg-white text-foreground',
} as const

export default function PortalCodeBlockField({
    label,
    value,
    tone = 'neutral',
    copyable = false,
    className = '',
}: Props) {
    const [copied, setCopied] = React.useState(false)

    const handleCopy = React.useCallback(() => {
        navigator.clipboard.writeText(value).then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 5000)
        }).catch(() => {})
    }, [value])

    return (
        <div className={className}>
            {label ? (
                <p className="mb-1 text-[11px] font-black uppercase tracking-[0.14em] text-gray-400">{label}</p>
            ) : null}
            <div className="flex items-center gap-2">
                <code className={`min-w-0 flex-1 break-all rounded-xl border px-3 py-2 text-xs font-mono ${toneClasses[tone]}`}>
                    {value}
                </code>
                {copyable ? (
                    <button
                        type="button"
                        onClick={handleCopy}
                        className={`shrink-0 rounded-xl border p-2 transition-colors ${
                            copied
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-border bg-white text-muted-foreground hover:bg-muted/30'
                        }`}
                        title={copied ? 'Copied' : 'Copy value'}
                        aria-label={copied ? 'Copied' : 'Copy value'}
                    >
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </button>
                ) : null}
            </div>
        </div>
    )
}
