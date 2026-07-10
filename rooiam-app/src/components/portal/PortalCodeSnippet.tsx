import React from 'react'
import { Check, Copy } from 'lucide-react'

export type SnippetLanguage = 'bash' | 'javascript' | 'typescript' | 'json' | 'html'

const LANGUAGE_LABEL: Record<SnippetLanguage, string> = {
    bash: 'Shell',
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    json: 'JSON',
    html: 'HTML',
}

/**
 * A copyable code card with a language badge and traffic-light header, matching
 * the login-widget snippet styling. Intentionally without syntax highlighting —
 * it stays legible for any language and keeps the integration guide clean.
 */
export default function PortalCodeSnippet({
    code,
    language,
    caption,
}: {
    code: string
    language: SnippetLanguage
    caption?: string
}) {
    const [copied, setCopied] = React.useState(false)
    const lines = code.split('\n')

    const handleCopy = React.useCallback(() => {
        navigator.clipboard.writeText(code).then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 4000)
        }).catch(() => {})
    }, [code])

    return (
        <div className="overflow-hidden rounded-3xl border border-border bg-[#fffdfd] shadow-[0_18px_48px_rgba(83,42,73,0.08)]">
            <div className="flex items-center justify-between border-b border-border bg-[linear-gradient(135deg,rgba(255,235,242,0.9),rgba(245,241,255,0.95))] px-4 py-3">
                <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                    {caption ? (
                        <span className="ml-2 text-[11px] font-bold text-slate-500">{caption}</span>
                    ) : null}
                </div>
                <div className="flex items-center gap-2">
                    <span className="rounded-full border border-white/70 bg-white/80 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                        {LANGUAGE_LABEL[language]}
                    </span>
                    <button
                        type="button"
                        onClick={handleCopy}
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] transition-colors ${
                            copied
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-border bg-white text-slate-500 hover:bg-muted/40'
                        }`}
                        title={copied ? 'Copied' : 'Copy snippet'}
                    >
                        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                </div>
            </div>
            <div className="overflow-x-auto py-2">
                <pre className="min-w-full text-xs font-mono leading-6 text-slate-700">
                    {lines.map((line, index) => (
                        <div key={index} className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-start px-4">
                            <span className="select-none pr-4 text-right text-[10px] font-bold text-slate-300">
                                {index + 1}
                            </span>
                            <code className="whitespace-pre">{line || ' '}</code>
                        </div>
                    ))}
                </pre>
            </div>
        </div>
    )
}
