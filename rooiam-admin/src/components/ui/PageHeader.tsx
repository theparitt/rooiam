import type { ReactNode } from 'react'

export default function PageHeader({
    eyebrow,
    title,
    description,
    actions,
}: {
    eyebrow?: ReactNode
    title: ReactNode
    description?: ReactNode
    actions?: ReactNode
}) {
    return (
        <div className="flex items-start justify-between gap-4">
            <div>
                {eyebrow ? <p className="text-sm font-semibold text-muted-foreground">{eyebrow}</p> : null}
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{title}</h1>
                {description ? (
                    <p className="text-muted-foreground mt-1 text-sm font-medium">
                        {description}
                    </p>
                ) : null}
            </div>
            {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
    )
}
