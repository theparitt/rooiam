import React from 'react'
import { Building2, Loader2, Sparkles } from 'lucide-react'
import PortalPageHeader from '../../components/portal/PortalPageHeader'
import PortalSectionCard from '../../components/portal/PortalSectionCard'
import { WORKSPACE_LABEL, WORKSPACE_LABEL_PLURAL_LOWER } from '../../lib/domain-labels'
import { DEFAULT_BRAND, MeResponse } from '../../lib/portal-types'

type Props = {
    user: MeResponse | null
    requestedAppName: string
    createWorkspaceName: string
    setCreateWorkspaceName: (v: string) => void
    creatingWorkspace: boolean
    createWorkspaceMessage: string
    maxWorkspacesAllowed: number | null
    workspaceLimitReached: boolean
    onCreateWorkspace: (e: React.FormEvent) => void
    error: string
}

export default function PortalOnboarding({
    user,
    requestedAppName,
    createWorkspaceName,
    setCreateWorkspaceName,
    creatingWorkspace,
    createWorkspaceMessage,
    maxWorkspacesAllowed,
    workspaceLimitReached,
    onCreateWorkspace,
    error,
}: Props) {
    const inputClass = 'w-full px-4 py-3 bg-muted/50 border border-border rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary transition-all'
    const labelClass = 'text-xs font-bold text-muted-foreground mb-1.5 block'

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PortalPageHeader
                title={`Set up your ${WORKSPACE_LABEL.toLowerCase()} portal`}
                actions={
                    <div className="rounded-3xl border border-violet-100 bg-violet-50 px-4 py-3 shrink-0 min-w-[220px]">
                        <p className="text-xs font-bold text-violet-500">Tenant Admin</p>
                        <p className="mt-1 text-sm font-black text-violet-900 truncate">{user?.display_name || user?.email || 'Tenant Admin'}</p>
                        <p className="mt-1 text-xs font-semibold text-violet-700 truncate">{requestedAppName}</p>
                    </div>
                }
            />

            {error ? <p className="text-xs font-semibold text-red-500 bg-red-50 px-4 py-2 rounded-2xl">{error}</p> : null}
            {workspaceLimitReached ? (
                <p className="text-xs font-semibold text-amber-700 bg-amber-50 px-4 py-2 rounded-2xl">
                    Workspace limit reached.
                    {typeof maxWorkspacesAllowed === 'number' ? ` This account can create up to ${maxWorkspacesAllowed} ${WORKSPACE_LABEL_PLURAL_LOWER}.` : null}
                </p>
            ) : null}

            <div className="max-w-3xl">
                <PortalSectionCard
                    icon={Building2}
                    title={`Create your first ${WORKSPACE_LABEL.toLowerCase()}`}
                    className="rounded-4xl"
                >
                    <form onSubmit={onCreateWorkspace} className="space-y-4">
                        <div>
                            <label className={labelClass}>{`${WORKSPACE_LABEL} Name`}</label>
                            <input type="text" value={createWorkspaceName} onChange={e => setCreateWorkspaceName(e.target.value)} className={inputClass} placeholder="Acme, Inc." required />
                        </div>

                        <div className="flex flex-wrap items-center gap-3 pt-2">
                            <button
                                type="submit"
                                disabled={workspaceLimitReached || creatingWorkspace || !createWorkspaceName.trim()}
                                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 font-bold text-sm rounded-full transition-all hover:scale-105 shadow-md disabled:opacity-50"
                                style={{ background: DEFAULT_BRAND, color: 'hsl(346 60% 25%)' }}
                            >
                                {creatingWorkspace ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                {`Create ${WORKSPACE_LABEL}`}
                            </button>
                            {createWorkspaceMessage ? <span className="text-sm font-bold text-emerald-600">{createWorkspaceMessage}</span> : null}
                        </div>
                    </form>
                </PortalSectionCard>
            </div>
        </div>
    )
}
