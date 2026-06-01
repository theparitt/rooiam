import React from 'react'

type Tone = 'amber' | 'violet' | 'sky' | 'emerald' | 'rose' | 'slate'
type Level = 'info' | 'warning' | 'danger' | 'success' | 'note'

const TONE: Record<Tone, { border: string; bg: string; title: string; body: string }> = {
    amber: {
        border: 'border-amber-200',
        bg: 'bg-amber-50',
        title: 'text-amber-900',
        body: 'text-amber-800',
    },
    violet: {
        border: 'border-violet-100',
        bg: 'bg-violet-50',
        title: 'text-violet-900',
        body: 'text-violet-800',
    },
    sky: {
        border: 'border-sky-200',
        bg: 'bg-sky-50',
        title: 'text-sky-900',
        body: 'text-sky-800',
    },
    emerald: {
        border: 'border-emerald-200',
        bg: 'bg-emerald-50',
        title: 'text-emerald-900',
        body: 'text-emerald-800',
    },
    rose: {
        border: 'border-rose-200',
        bg: 'bg-rose-50',
        title: 'text-rose-900',
        body: 'text-rose-800',
    },
    slate: {
        border: 'border-slate-200',
        bg: 'bg-slate-50',
        title: 'text-slate-900',
        body: 'text-slate-700',
    },
}

const LEVEL_TO_TONE: Record<Level, Tone> = {
    info: 'sky',
    warning: 'amber',
    danger: 'rose',
    success: 'emerald',
    note: 'slate',
}

type Props = {
    level?: Level
    tone?: Tone
    title?: React.ReactNode
    children?: React.ReactNode
    className?: string
}

export default function PortalHintBox({ level, tone, title, children, className = '' }: Props) {
    const resolvedTone = tone ?? (level ? LEVEL_TO_TONE[level] : 'slate')
    const t = TONE[resolvedTone]
    return (
        <div className={`rounded-3xl border ${t.border} ${t.bg} p-4 ${className}`.trim()}>
            {title ? <p className={`text-sm font-black ${t.title}`}>{title}</p> : null}
            {children ? (
                <div className={`${title ? 'mt-1.5' : ''} text-sm font-semibold leading-6 ${t.body}`.trim()}>{children}</div>
            ) : null}
        </div>
    )
}
