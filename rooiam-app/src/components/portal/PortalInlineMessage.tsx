import PortalHintBox from './PortalHintBox'

type Tone = 'success' | 'error' | 'warning' | 'info'

export default function PortalInlineMessage({
    tone,
    children,
    className = '',
}: {
    tone: Tone
    children: React.ReactNode
    className?: string
}) {
    const level: 'success' | 'danger' | 'warning' | 'info' = tone === 'error' ? 'danger' : tone
    return (
        <PortalHintBox level={level} className={`rounded-2xl px-4 py-2.5 text-xs ${className}`.trim()}>
            {children}
        </PortalHintBox>
    )
}
