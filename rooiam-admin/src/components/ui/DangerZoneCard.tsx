import type { ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

export default function DangerZoneCard({
    title = 'Danger Zone',
    subtitle,
    children,
}: {
    title?: string
    subtitle?: ReactNode
    children: ReactNode
}) {
    return (
        <section className="rounded-3xl border border-rose-200 bg-rose-50/70 p-5 shadow-sm">
            <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-rose-200 bg-white text-rose-600">
                    <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-base font-black text-rose-900">{title}</p>
                    {subtitle ? <p className="mt-1 text-sm font-medium text-rose-700">{subtitle}</p> : null}
                </div>
            </div>
            <div className="mt-4 space-y-3">{children}</div>
        </section>
    )
}
