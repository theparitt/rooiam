import React, { useEffect, useRef, useState } from 'react'
import PortalPrimarySaveButton from './PortalPrimarySaveButton'

type Props = {
    note?: React.ReactNode
    error?: string
    success?: string
    loading?: boolean
    /** Pass dirty=true when the user has unsaved changes. The component tracks justSaved internally. */
    dirty?: boolean
    /** Legacy: pass saved directly (overrides dirty-based justSaved logic). */
    saved?: boolean
    disabled?: boolean
    label?: string
    onClick?: () => void
    type?: 'button' | 'submit'
    className?: string
}

export default function PortalSaveActionFooter({
    note,
    error,
    success,
    loading = false,
    dirty,
    saved: savedProp,
    disabled = false,
    label = 'Save Changes',
    onClick,
    type = 'button',
    className = '',
}: Props) {
    const [justSaved, setJustSaved] = useState(false)
    const prevDirty = useRef(dirty)

    useEffect(() => {
        if (dirty === undefined) return
        if (prevDirty.current && !dirty) setJustSaved(true)
        if (dirty) setJustSaved(false)
        prevDirty.current = dirty
    }, [dirty])

    const useDirtyMode = dirty !== undefined
    const saved = useDirtyMode ? justSaved : (savedProp ?? false)
    const isDisabled = useDirtyMode
        ? (disabled || (!dirty && !justSaved))
        : disabled

    return (
        <div className={`pt-2 ${className}`.trim()}>
            {error ? (
                <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                    {error}
                </p>
            ) : note ? (
                <p className="text-sm font-medium text-muted-foreground">{note}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-3">
                <PortalPrimarySaveButton
                    loading={loading}
                    saved={saved}
                    disabled={isDisabled}
                    label={label}
                    onClick={onClick}
                    type={type}
                />
                {success ? <p className="text-xs font-bold text-green-700 bg-green-50 rounded-xl px-4 py-2">{success}</p> : null}
            </div>
        </div>
    )
}
