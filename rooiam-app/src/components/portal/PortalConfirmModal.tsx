import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { AlertTriangle, Loader2, X } from 'lucide-react'

type Props = {
    title: string
    description: ReactNode
    confirmLabel: string
    busyLabel?: string
    onConfirm: () => void
    onClose: () => void
    busy?: boolean
    error?: string
}

export default function PortalConfirmModal({
    title,
    description,
    confirmLabel,
    busyLabel = 'Working…',
    onConfirm,
    onClose,
    busy = false,
    error,
}: Props) {
    const dialogRef = useRef<HTMLDialogElement>(null)
    const cancelRef = useRef<HTMLButtonElement>(null)
    const titleId = useId()
    const descriptionId = useId()

    useEffect(() => {
        const dialog = dialogRef.current
        if (!dialog) return
        dialog.showModal()
        cancelRef.current?.focus()
        return () => dialog.close()
    }, [])

    return (
        <dialog
            ref={dialogRef}
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            className="m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl border border-violet-100 bg-white p-0 text-foreground shadow-2xl backdrop:bg-slate-950/45 backdrop:backdrop-blur-sm"
            onCancel={event => {
                event.preventDefault()
                if (!busy) onClose()
            }}
            onClick={event => {
                if (event.target === event.currentTarget && !busy) onClose()
            }}
        >
            <div className="p-6 sm:p-7">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
                        <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        aria-label="Close confirmation"
                        className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>
                <h2 id={titleId} className="mt-4 text-xl font-black text-slate-900">{title}</h2>
                <div id={descriptionId} className="mt-3 space-y-3 text-sm leading-6 text-slate-600">{description}</div>
                {error ? <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p> : null}
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                        ref={cancelRef}
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={busy}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-black text-white transition-colors hover:bg-rose-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 disabled:opacity-50"
                    >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                        {busy ? busyLabel : confirmLabel}
                    </button>
                </div>
            </div>
        </dialog>
    )
}
