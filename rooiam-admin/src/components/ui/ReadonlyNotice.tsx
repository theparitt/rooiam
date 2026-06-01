export default function ReadonlyNotice({
    title = 'Read-only access',
    children,
}: {
    title?: string
    children: React.ReactNode
}) {
    return (
        <div className="rounded-3xl border border-violet-100 bg-violet-50 p-4">
            <p className="font-bold text-violet-900">{title}</p>
            <p className="mt-1 text-sm font-medium text-violet-800">{children}</p>
        </div>
    )
}
