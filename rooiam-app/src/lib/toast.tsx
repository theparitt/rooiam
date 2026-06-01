import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type ToastKind = 'error' | 'success' | 'info'

interface Toast {
    id: number
    kind: ToastKind
    message: string
}

interface ToastApi {
    error: (message: string) => void
    success: (message: string) => void
    info: (message: string) => void
}

// ── Context ───────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastApi | null>(null)

// ── Auto-dismiss durations ────────────────────────────────────────────────────

const DURATION: Record<ToastKind, number> = {
    error: 6000,
    success: 3500,
    info: 4000,
}

// ── Single toast item ─────────────────────────────────────────────────────────

const STYLES: Record<ToastKind, { bg: string; border: string; text: string; icon: string }> = {
    error: {
        bg: 'bg-red-50',
        border: 'border-red-200',
        text: 'text-red-800',
        icon: 'text-red-500',
    },
    success: {
        bg: 'bg-emerald-50',
        border: 'border-emerald-200',
        text: 'text-emerald-800',
        icon: 'text-emerald-500',
    },
    info: {
        bg: 'bg-sky-50',
        border: 'border-sky-200',
        text: 'text-sky-800',
        icon: 'text-sky-500',
    },
}

const ICONS: Record<ToastKind, React.ReactNode> = {
    error: <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />,
    success: <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />,
    info: <Info className="w-4 h-4 shrink-0 mt-0.5" />,
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
    const s = STYLES[toast.kind]
    const [visible, setVisible] = useState(false)

    // Trigger enter animation on mount
    useEffect(() => {
        const frame = requestAnimationFrame(() => setVisible(true))
        return () => cancelAnimationFrame(frame)
    }, [])

    const dismiss = useCallback(() => {
        setVisible(false)
        setTimeout(() => onDismiss(toast.id), 300)
    }, [toast.id, onDismiss])

    // Auto-dismiss
    useEffect(() => {
        const timer = setTimeout(dismiss, DURATION[toast.kind])
        return () => clearTimeout(timer)
    }, [dismiss, toast.kind])

    return (
        <div
            role="alert"
            aria-live={toast.kind === 'error' ? 'assertive' : 'polite'}
            className={`
                flex items-start gap-3 w-full max-w-sm px-4 py-3
                rounded-2xl border shadow-lg
                transition-all duration-300 ease-out
                ${s.bg} ${s.border}
                ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'}
            `}
        >
            <span className={s.icon}>{ICONS[toast.kind]}</span>
            <p className={`flex-1 text-sm font-semibold leading-snug ${s.text}`}>{toast.message}</p>
            <button
                type="button"
                onClick={dismiss}
                className={`shrink-0 opacity-50 hover:opacity-100 transition-opacity ${s.text}`}
                aria-label="Dismiss"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    )
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([])
    const counter = useRef(0)

    const add = useCallback((kind: ToastKind, message: string) => {
        const id = ++counter.current
        setToasts(prev => [...prev, { id, kind, message }])
    }, [])

    const dismiss = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }, [])

    const api: ToastApi = {
        error: (message) => add('error', message),
        success: (message) => add('success', message),
        info: (message) => add('info', message),
    }

    return (
        <ToastContext.Provider value={api}>
            {children}
            {/* Toast container — fixed top-right, stacks downward */}
            <div
                aria-label="Notifications"
                className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
            >
                {toasts.map(t => (
                    <div key={t.id} className="pointer-events-auto">
                        <ToastItem toast={t} onDismiss={dismiss} />
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    )
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useToast(): ToastApi {
    const ctx = useContext(ToastContext)
    if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
    return ctx
}
