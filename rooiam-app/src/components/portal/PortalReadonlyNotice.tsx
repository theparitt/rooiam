import PortalHintBox from './PortalHintBox'

export default function PortalReadonlyNotice({
    title = 'Read-only access',
    children,
}: {
    title?: string
    children: React.ReactNode
}) {
    return (
        <PortalHintBox tone="violet" title={title}>
            {children}
        </PortalHintBox>
    )
}
