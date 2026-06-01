import React from 'react'
import SettingRowCard from './SettingRowCard'

type Props = {
    checked: boolean
    disabled?: boolean
    onChange: (value: boolean) => void
    label: string
    hint?: string
    tone?: 'pink' | 'emerald'
    children?: React.ReactNode
}

export default function ToggleRow({
    checked,
    disabled,
    onChange,
    label,
    hint,
    tone = 'pink',
    children,
}: Props) {
    return (
        <SettingRowCard
            label={label}
            hint={hint}
            action={
                <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange(!checked)}
                    className={`relative h-7 w-12 shrink-0 overflow-hidden rounded-full transition-colors ${
                        checked ? (tone === 'emerald' ? 'bg-emerald-500' : 'bg-pink-400') : 'bg-slate-300'
                    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                    aria-pressed={checked}
                >
                    <span className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
            }
        >
            {children}
        </SettingRowCard>
    )
}
