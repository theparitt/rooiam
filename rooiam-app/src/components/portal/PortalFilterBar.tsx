type Props = {
    children: React.ReactNode
    className?: string
}

export default function PortalFilterBar({
    children,
    className = '',
}: Props) {
    return (
        <div className={`border-b px-4 py-4 ${className}`.trim()}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                {children}
            </div>
        </div>
    )
}
