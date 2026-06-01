import PortalSettingRow from './PortalSettingRow'

type Props = {
    checked: boolean
    disabled?: boolean
    onChange: (value: boolean) => void
    label: string
    hint?: string
}

export default function PortalToggleRow({
    checked,
    disabled,
    onChange,
    label,
    hint,
}: Props) {
    return (
        <PortalSettingRow
            label={label}
            hint={hint}
            action={
                <button
                    type="button"
                    role="switch"
                    aria-checked={checked}
                    disabled={disabled}
                    onClick={() => onChange(!checked)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-pink-400' : 'bg-gray-200'}`}
                >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
            }
        />
    )
}
