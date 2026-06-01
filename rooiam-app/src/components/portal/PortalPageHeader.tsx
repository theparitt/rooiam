import React from 'react'

type Props = {
    eyebrow?: string
    title: React.ReactNode
    description?: React.ReactNode
    actions?: React.ReactNode
}

export default function PortalPageHeader({ eyebrow, title, description, actions }: Props) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
                {eyebrow ? <p className="text-sm font-semibold text-muted-foreground">{eyebrow}</p> : null}
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{title}</h1>
                {description ? <p className="text-muted-foreground mt-1 text-sm font-medium">{description}</p> : null}
            </div>
            {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
        </div>
    )
}
