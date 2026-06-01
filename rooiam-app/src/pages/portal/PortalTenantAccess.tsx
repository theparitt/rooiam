import React from 'react'
import { ShieldCheck } from 'lucide-react'
import PortalPageHeader from '../../components/portal/PortalPageHeader'
import PortalConfigChangeNote from '../../components/portal/PortalConfigChangeNote'
import PortalContentCard from '../../components/portal/PortalContentCard'
import PortalSettingRow from '../../components/portal/PortalSettingRow'
import PortalSaveActionFooter from '../../components/portal/PortalSaveActionFooter'
import PortalTabBar from '../../components/portal/PortalTabBar'
import PortalToggleRow from '../../components/portal/PortalToggleRow'
import { TENANT_LOGIN_LABEL, WORKSPACE_ACCESS_LABEL } from '../../lib/domain-labels'
import type { AuthPolicyForm, OrganizationActivityItem } from '../../lib/portal-types'

type AccessTab = 'policy' | 'how-it-works'

type Props = {
    demoMode?: boolean
    canManageTenantAccess: boolean
    authPolicyForm: AuthPolicyForm
    setAuthPolicyForm: React.Dispatch<React.SetStateAction<AuthPolicyForm>>
    savingPolicy: boolean
    policyMessage: boolean
    onSaveAuthPolicy: (e: React.FormEvent) => void
    lastChange: OrganizationActivityItem | null
}

export default function PortalTenantAccess({
    demoMode = false,
    canManageTenantAccess,
    authPolicyForm,
    setAuthPolicyForm,
    savingPolicy,
    policyMessage,
    onSaveAuthPolicy,
    lastChange,
}: Props) {
    const savedTab = localStorage.getItem('rooiam_tab_portal_tenant_access') as AccessTab | null
    const [tab, setTab] = React.useState<AccessTab>(savedTab === 'how-it-works' ? 'how-it-works' : 'policy')
    const handleTabChange = (t: AccessTab) => {
        setTab(t)
        localStorage.setItem('rooiam_tab_portal_tenant_access', t)
    }

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PortalPageHeader
                eyebrow="Tenant"
                title={TENANT_LOGIN_LABEL}
                description="Controls how workspace owners and workspace admins sign in here. Platform admin sets the ceiling — you can only restrict further."
            />

            {/* Tab bar */}
            <PortalTabBar
                active={tab}
                onChange={handleTabChange}
                items={[
                    { id: 'policy', label: 'Sign-In Policy' },
                    { id: 'how-it-works', label: 'How it works' },
                ]}
            />

            <div className="space-y-4">
                <PortalConfigChangeNote
                    item={lastChange}
                    emptyText="No tenant access changes recorded yet."
                />

                {demoMode ? (
                    <div className="rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: '#FEF3C7', border: '1px solid #FCD34D' }}>
                        <p className="font-bold text-amber-900 mb-1">Tenant access is fixed in demo mode</p>
                        <p className="text-xs text-amber-800">Demo keeps sign-in methods fixed so shared walkthroughs stay predictable.</p>
                    </div>
                ) : null}

                    <div className="rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: '#E0F2FE', border: '1px solid #7DD3FC' }}>
                    <p className="font-bold text-sky-900 mb-1">Workspace owner and admin policy</p>
                    <p className="text-xs text-sky-800">This page controls how workspace owners and workspace admins sign in here. End-user sign-in for each workspace is configured separately under Workspace Access.</p>
                </div>

                {tab === 'policy' && (
                    <form onSubmit={onSaveAuthPolicy}>
                        <div className="rounded-3xl border border-border bg-white p-5 shadow-sm space-y-5">
                            <div>
                                <h3 className="font-black text-gray-800 mb-1 flex items-center gap-2">
                                    <ShieldCheck className="w-4 h-4 text-sky-500" /> Portal sign-in policy
                                </h3>
                                <p className="text-xs font-semibold text-gray-400">
                                    You can only disable methods — you cannot enable a method the platform admin has not already allowed.
                                </p>
                            </div>

                            {/* Sign-in methods */}
                            <div>
                                <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Sign-In Methods</p>
                                <div className="space-y-2">
                                    {([
                                        { key: 'allow_magic_link' as const, label: 'Magic Link', hint: 'One-time email link.' },
                                        { key: 'allow_passkey' as const, label: 'Passkey', hint: 'WebAuthn device passkey.' },
                                        { key: 'allow_google' as const, label: 'Google', hint: 'Sign in with Google account.' },
                                        { key: 'allow_microsoft' as const, label: 'Microsoft', hint: 'Sign in with Microsoft account.' },
                                    ] as const).map(({ key, label, hint }) => (
                                        <PortalToggleRow
                                            key={key}
                                            label={label}
                                            hint={hint}
                                            checked={authPolicyForm[key]}
                                            onChange={v => setAuthPolicyForm(f => ({ ...f, [key]: v }))}
                                            disabled={!canManageTenantAccess || demoMode}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* MFA */}
                            <div>
                                <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Security</p>
                                <PortalToggleRow
                                    label="Require MFA"
                                    hint="Workspace owners and workspace admins must complete TOTP verification every time they sign in here. They will be prompted to enroll if they have not set up MFA yet."
                                    checked={authPolicyForm.tenant_portal_require_mfa}
                                    onChange={v => setAuthPolicyForm(f => ({ ...f, tenant_portal_require_mfa: v }))}
                                    disabled={!canManageTenantAccess || demoMode}
                                />
                            </div>

                            {canManageTenantAccess && !demoMode ? (
                                <PortalSaveActionFooter
                                    loading={savingPolicy}
                                    dirty={policyMessage}
                                    disabled={savingPolicy}
                                    type="submit"
                                />
                            ) : null}
                            {!canManageTenantAccess ? (
                                <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-900">
                                    Only the tenant owner can change Tenant Access in the current portal model.
                                </div>
                            ) : null}
                        </div>
                    </form>
                )}

                {tab === 'how-it-works' && (
                    <PortalContentCard title="How Tenant Access Works" icon={ShieldCheck} className="space-y-3">
                        <PortalSettingRow
                            label="Platform admin sets the ceiling"
                            hint="The platform admin controls which sign-in methods are available at all (magic link, Google, Microsoft, passkey). If a method is disabled by the platform, you cannot turn it on here."
                        />
                        <PortalSettingRow
                            label="You can only restrict further"
                            hint="Within what the platform allows, you can disable specific methods for your portal. For example: platform allows Google + magic link, so you can disable magic link to require Google only."
                        />
                        <PortalSettingRow
                            label="This is only for tenant admins — not end-users"
                            hint={`These settings control how workspace owners and workspace admins sign in here. End-user sign-in for each workspace is configured separately under ${WORKSPACE_ACCESS_LABEL} and has no platform ceiling.`}
                        />
                    </PortalContentCard>
                )}
            </div>
        </div>
    )
}
