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

// ---------------------------------------------------------------- highlight
// Line-based regex tokenizers — same visual language as the login-widget
// snippet card. Good enough for our own short samples; not a real parser.

type Token = { type: string; value: string }

function tokenize(line: string, pattern: RegExp, pick: (m: RegExpExecArray) => Token[]): Token[] {
    const tokens: Token[] = []
    let last = 0
    let m: RegExpExecArray | null
    while ((m = pattern.exec(line)) !== null) {
        if (m.index > last) tokens.push({ type: 'plain', value: line.slice(last, m.index) })
        tokens.push(...pick(m))
        last = pattern.lastIndex
    }
    if (last < line.length) tokens.push({ type: 'plain', value: line.slice(last) })
    return tokens.length > 0 ? tokens : [{ type: 'plain', value: line }]
}

/** Index of a real `//` comment (ignores `//` inside quoted strings, e.g. URLs). */
function findJsCommentStart(line: string): number {
    let quote: string | null = null
    for (let i = 0; i < line.length; i++) {
        const c = line[i]
        if (quote) {
            if (c === '\\') i++
            else if (c === quote) quote = null
        } else if (c === "'" || c === '"' || c === '`') {
            quote = c
        } else if (c === '/' && line[i + 1] === '/') {
            return i
        }
    }
    return -1
}

function tokenizeJs(line: string): Token[] {
    const comment = findJsCommentStart(line)
    if (comment !== -1) {
        return [...tokenizeJs(line.slice(0, comment)).filter(t => t.value), { type: 'comment', value: line.slice(comment) }]
    }
    const pattern =
        /('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|\b(const|let|var|function|return|async|await|export|import|from|new|if|else|throw|type)\b|\b(window|document|crypto|sessionStorage|localStorage|fetch|console|process|JSON|URLSearchParams|Error)\b|(\.[a-zA-Z_]\w*)|\b(\d+)\b/g
    return tokenize(line, pattern, m => [
        m[1] ? { type: 'string', value: m[1] }
        : m[2] ? { type: 'keyword', value: m[2] }
        : m[3] ? { type: 'builtin', value: m[3] }
        : m[4] ? { type: 'property', value: m[4] }
        : { type: 'number', value: m[5] },
    ])
}

function tokenizeJson(line: string): Token[] {
    const pattern = /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)/g
    return tokenize(line, pattern, m => {
        if (m[1] && m[2]) return [{ type: 'attribute', value: m[1] }, { type: 'plain', value: m[2] }]
        if (m[1]) return [{ type: 'string', value: m[1] }]
        if (m[3]) return [{ type: 'keyword', value: m[3] }]
        return [{ type: 'number', value: m[4] }]
    })
}

function tokenizeBash(line: string): Token[] {
    if (line.trimStart().startsWith('#')) return [{ type: 'comment', value: line }]
    const pattern = /('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|(^\s*(?:curl|npm|npx|node)\b)|(\s-{1,2}[\w-]+)/g
    return tokenize(line, pattern, m => [
        m[1] ? { type: 'string', value: m[1] }
        : m[2] ? { type: 'keyword', value: m[2] }
        : { type: 'attribute', value: m[3] },
    ])
}

function tokenizeHtml(line: string): Token[] {
    const pattern = /(<\/?)([\w-]+)|([\w:-]+)(=)("(?:[^"]*)")|(\/?>)/g
    return tokenize(line, pattern, m => {
        if (m[1] && m[2]) return [{ type: 'plain', value: m[1] }, { type: 'tag', value: m[2] }]
        if (m[3] && m[4] && m[5]) {
            return [
                { type: 'attribute', value: m[3] },
                { type: 'plain', value: m[4] },
                { type: 'string', value: m[5] },
            ]
        }
        return [{ type: 'plain', value: m[6] }]
    })
}

function highlight(line: string, language: SnippetLanguage): Token[] {
    switch (language) {
        case 'javascript':
        case 'typescript':
            return tokenizeJs(line)
        case 'json':
            return tokenizeJson(line)
        case 'bash':
            return tokenizeBash(line)
        case 'html':
            return tokenizeHtml(line)
    }
}

function tokenClass(type: string): string {
    switch (type) {
        case 'keyword': return 'text-fuchsia-600 font-bold'
        case 'string': return 'text-emerald-600'
        case 'builtin': return 'text-violet-600 font-semibold'
        case 'property': return 'text-sky-600'
        case 'attribute': return 'text-sky-600 font-semibold'
        case 'tag': return 'text-rose-500 font-bold'
        case 'number': return 'text-amber-600'
        case 'comment': return 'text-slate-400 italic'
        default: return 'text-slate-700'
    }
}

// ---------------------------------------------------------------- component

/** Copyable, syntax-highlighted code card matching the widget snippet style. */
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
                <pre className="min-w-full text-xs font-mono leading-6">
                    {lines.map((line, index) => (
                        <div key={index} className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-start px-4">
                            <span className="select-none pr-4 text-right text-[10px] font-bold text-slate-300">
                                {index + 1}
                            </span>
                            <code className="whitespace-pre">
                                {line
                                    ? highlight(line, language).map((token, i) => (
                                        <span key={i} className={tokenClass(token.type)}>{token.value}</span>
                                    ))
                                    : ' '}
                            </code>
                        </div>
                    ))}
                </pre>
            </div>
        </div>
    )
}
