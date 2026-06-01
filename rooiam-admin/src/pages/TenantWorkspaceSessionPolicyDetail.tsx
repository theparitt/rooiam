import { useParams, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { WorkspaceSessionPolicy } from './PlatformSettings'

export default function TenantWorkspaceSessionPolicyDetail() {
    const { workspaceId } = useParams()

    if (!workspaceId) return null

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <Link
                to={`/tenant-workspace/workspaces/${workspaceId}`}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-gray-800 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" /> Back to Workspace
            </Link>
            <WorkspaceSessionPolicy orgId={workspaceId} />
        </div>
    )
}
