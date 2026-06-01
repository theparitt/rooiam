type Props = {
    label: string
    hint?: string
    action?: React.ReactNode
    children?: React.ReactNode
    className?: string
}

export default function SettingRowCard({
    label,
    hint,
    action,
    children,
    className = '',
}: Props) {
    return (
        <div className={`rounded-2xl border border-border bg-white px-4 py-3 shadow-sm ${className}`.trim()}>
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-sm font-black text-gray-700">{label}</p>
                    {hint ? <p className="mt-1 text-xs font-semibold text-gray-500">{hint}</p> : null}
                </div>
                {action ? <div className="shrink-0">{action}</div> : null}
            </div>
            {children ? <div>{children}</div> : null}
        </div>
    )
}
