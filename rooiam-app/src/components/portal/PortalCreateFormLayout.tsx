type Props = {
    title: string
    subtitle?: string
    children: React.ReactNode
    className?: string
}

export default function PortalCreateFormLayout({
    title,
    subtitle,
    children,
    className = '',
}: Props) {
    return (
        <div className={`space-y-5 ${className}`.trim()}>
            <div>
                <h3 className="text-base font-black text-gray-900">{title}</h3>
                {subtitle ? <p className="mt-1 text-sm font-medium text-muted-foreground">{subtitle}</p> : null}
            </div>
            {children}
        </div>
    )
}
