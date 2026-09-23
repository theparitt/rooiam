import React from 'react'
import { Clock3 } from 'lucide-react'
import PortalPageHeader from '../../components/portal/PortalPageHeader'
import PortalConfigChangeNote from '../../components/portal/PortalConfigChangeNote'
import PortalContentCard from '../../components/portal/PortalContentCard'
import PortalSettingRow from '../../components/portal/PortalSettingRow'
import PortalSaveActionFooter from '../../components/portal/PortalSaveActionFooter'
import type { AuthPolicyForm, Organization, OrganizationActivityItem } from '../../lib/portal-types'

type Props = {
    currentOrg: Organization | null
    demoMode?: boolean
    canManageAuthPolicy: boolean
    authPolicyForm: AuthPolicyForm
    setAuthPolicyForm: React.Dispatch<React.SetStateAction<AuthPolicyForm>>
    savingPolicy: boolean
    policyMessage: boolean
    onSaveAuthPolicy: (e: React.FormEvent) => void
    lastChange: OrganizationActivityItem | null
}

const inputClass = 'w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-sky-200 transition-all'
const labelClass = 'block text-xs font-black uppercase tracking-[0.16em] text-gray-500 mb-2'

export default function PortalWorkspaceSessionPolicy({
    currentOrg,
    demoMode = false,
    canManageAuthPolicy,
    authPolicyForm,
    setAuthPolicyForm,
    savingPolicy,
    policyMessage,
    onSaveAuthPolicy,
    lastChange,
}: Props) {
    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PortalPageHeader
                eyebrow="Workspace"
                title="Workspace Session Policy"
                description="Control end-user session duration and concurrency for this workspace."
            />

            {!currentOrg ? (
                <div className="rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: '#EDE9FE', border: '1px solid #C4B5FD' }}>
                    <p className="font-bold text-violet-900">No workspace selected</p>
                    <p className="text-xs text-violet-800 mt-1">Select a workspace to manage its session policy.</p>
                </div>
            ) : !canManageAuthPolicy ? (
                <div className="rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: '#EDE9FE', border: '1px solid #C4B5FD' }}>
                    <p className="font-bold text-violet-900">Read-only access</p>
                    <p className="text-xs text-violet-800 mt-1">You do not have permission to change this session policy.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    <PortalConfigChangeNote
                        item={lastChange}
                        emptyText="No workspace session policy changes recorded yet."
                    />

                    {demoMode ? (
                        <div className="rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: '#FEF3C7', border: '1px solid #FCD34D' }}>
                            <p className="font-bold text-amber-900 mb-1">Workspace session policy is locked in demo mode</p>
                            <p className="text-xs text-amber-800">Demo workspaces keep seeded session behavior fixed so the walkthrough stays stable.</p>
                        </div>
                    ) : null}

                    <div className="rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: '#E0F2FE', border: '1px solid #7DD3FC' }}>
                        <p className="font-bold text-sky-900 mb-1">Workspace end-user session policy</p>
                        <p className="text-xs text-sky-800">This page controls end-user sessions for this workspace. Workspace owner and workspace admin sign-in is configured separately under Tenant Access.</p>
                    </div>

                    <form onSubmit={onSaveAuthPolicy} className="space-y-4">
                        <PortalContentCard
                            title="Session Rules"
                            subtitle="Control how long end-user sessions can stay active and how many can exist at the same time."
                            icon={Clock3}
                        >
                            <div className="space-y-3">
                                <PortalSettingRow
                                    label="Session duration"
                                    hint="Sessions older than this are automatically revoked. Leave blank to inherit the platform default (7 days / 168 h). Set a lower value to enforce a stricter limit for this workspace — values equal to or higher than the platform default have no effect."
                                >
                                    <div className="mt-3">
                                        <label className={labelClass}>Max session age (hours)</label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="8760"
                                            value={authPolicyForm.max_session_age_hours}
                                            onChange={e => setAuthPolicyForm((prev: AuthPolicyForm) => ({ ...prev, max_session_age_hours: e.target.value }))}
                                            disabled={demoMode}
                                            placeholder="Blank = platform default (168 h / 7 days)"
                                            className={`${inputClass} disabled:opacity-60`}
                                        />
                                    </div>
                                </PortalSettingRow>

                                <PortalSettingRow
                                    label="Concurrent sessions"
                                    hint="When exceeded, the oldest session is automatically revoked. Leave blank for no limit — users can have as many active sessions as they want."
                                >
                                    <div className="mt-3">
                                        <label className={labelClass}>Max concurrent sessions per user</label>
                                        <input
                                            type="number"
                                            min="1"
                                            max="100"
                                            value={authPolicyForm.max_concurrent_sessions}
                                            onChange={e => setAuthPolicyForm((prev: AuthPolicyForm) => ({ ...prev, max_concurrent_sessions: e.target.value }))}
                                            disabled={demoMode}
                                            placeholder="Blank = unlimited"
                                            className={`${inputClass} disabled:opacity-60`}
                                        />
                                    </div>
                                </PortalSettingRow>
                            </div>
                            <PortalSaveActionFooter
                                loading={savingPolicy}
                                dirty={policyMessage}
                                disabled={demoMode || savingPolicy}
                                label="Save Session Policy"
                                type="submit"
                            />
                        </PortalContentCard>
                    </form>
                </div>
            )}
        </div>
    )
}
