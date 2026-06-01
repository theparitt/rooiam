type Props = {
    label: string
    value: React.ReactNode
    description?: React.ReactNode
    className?: string
}

export default function PortalStatTile({
    label,
    value,
    description,
    className = '',
}: Props) {
    return (
        <div className={`rounded-2xl border border-border bg-muted/30 p-4 ${className}`.trim()}>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] opacity-60">{label}</p>
            <div className="mt-2 text-lg font-black">{value}</div>
            {description ? <div className="mt-2 text-sm font-bold opacity-70">{description}</div> : null}
        </div>
    )
}
