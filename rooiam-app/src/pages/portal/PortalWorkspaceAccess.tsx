import React from 'react'
import { Network, ShieldCheck } from 'lucide-react'
import PortalPageHeader from '../../components/portal/PortalPageHeader'
import PortalConfigChangeNote from '../../components/portal/PortalConfigChangeNote'
import PortalSaveActionFooter from '../../components/portal/PortalSaveActionFooter'
import PortalTabBar from '../../components/portal/PortalTabBar'
import PortalToggleRow from '../../components/portal/PortalToggleRow'
import { LOGIN_SECTION_LABEL, WORKSPACE_LABEL } from '../../lib/domain-labels'
import type { AuthPolicyForm, OrgIpPolicyResponse, Organization, OrganizationActivityItem, TenantIpPolicy } from '../../lib/portal-types'

type SignInTab = 'access' | 'ip'
const SIGNIN_TABS: { id: SignInTab; label: string; icon: React.ReactNode }[] = [
    { id: 'access', label: 'Sign-In Methods', icon: <ShieldCheck className="w-4 h-4" /> },
    { id: 'ip', label: 'IP Policy', icon: <Network className="w-4 h-4" /> },
]

type Props = {
    currentOrg: Organization | null
    demoMode?: boolean
    canManageAuthPolicy: boolean
    activeBrandColor: string
    authPolicyForm: AuthPolicyForm
    setAuthPolicyForm: React.Dispatch<React.SetStateAction<AuthPolicyForm>>
    savingPolicy: boolean
    policyMessage: boolean
    onSaveAuthPolicy: (e: React.FormEvent) => void
    orgIpPolicy: OrgIpPolicyResponse | null
    ipPolicyForm: TenantIpPolicy
    setIpPolicyForm: React.Dispatch<React.SetStateAction<TenantIpPolicy>>
    loadingIpPolicy: boolean
    savingIpPolicy: boolean
    ipPolicyMessage: boolean
    onSaveIpPolicy: (e: React.FormEvent) => void
    lastChange: OrganizationActivityItem | null
}

export default function PortalWorkspaceAccess({
    currentOrg,
    demoMode = false,
    canManageAuthPolicy,
    activeBrandColor: _activeBrandColor,
    authPolicyForm,
    setAuthPolicyForm,
    savingPolicy,
    policyMessage,
    onSaveAuthPolicy,
    orgIpPolicy,
    ipPolicyForm,
    setIpPolicyForm,
    loadingIpPolicy,
    savingIpPolicy,
    ipPolicyMessage,
    onSaveIpPolicy,
    lastChange,
}: Props) {
    const savedTab = localStorage.getItem('rooiam_tab_portal_signin') as SignInTab | null
    const [tab, setTab] = React.useState<SignInTab>(
        savedTab === 'ip' ? 'ip' : 'access'
    )
    const inputClass = 'w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-sky-200 transition-all'
    const labelClass = 'block text-xs font-black uppercase tracking-[0.16em] text-gray-500 mb-2'
    const handleTabChange = (t: SignInTab) => {
        setTab(t)
        localStorage.setItem('rooiam_tab_portal_signin', t)
    }

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PortalPageHeader
                eyebrow="Workspace"
                title={LOGIN_SECTION_LABEL}
                description="Control how end-users sign into this workspace."
            />

            {!currentOrg ? (
                <div className="rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: '#EDE9FE', border: '1px solid #C4B5FD' }}>
                    <p className="font-bold text-violet-900">No {WORKSPACE_LABEL.toLowerCase()} selected</p>
                    <p className="text-xs text-violet-800 mt-1">Select a {WORKSPACE_LABEL.toLowerCase()} to manage its sign-in settings.</p>
                </div>
            ) : !canManageAuthPolicy ? (
                <div className="rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: '#EDE9FE', border: '1px solid #C4B5FD' }}>
                    <p className="font-bold text-violet-900">Read-only access</p>
                    <p className="text-xs text-violet-800 mt-1">You do not have permission to change this policy.</p>
                </div>
            ) : (
                <>
                    {/* Tab bar */}
                    <PortalTabBar active={tab} onChange={handleTabChange} items={SIGNIN_TABS} />

                    <div className="space-y-4">
                        <PortalConfigChangeNote
                            item={lastChange}
                            emptyText="No workspace access changes recorded yet."
                        />

                        {demoMode ? (
                            <div className="rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: '#FEF3C7', border: '1px solid #FCD34D' }}>
                                <p className="font-bold text-amber-900 mb-1">Workspace access is locked in demo mode</p>
                                <p className="text-xs text-amber-800">Demo workspaces keep seeded sign-in methods and IP policy fixed so the walkthrough stays stable.</p>
                            </div>
                        ) : null}

                        <div className="rounded-2xl px-4 py-3 text-sm font-semibold" style={{ background: '#E0F2FE', border: '1px solid #7DD3FC' }}>
                            <p className="font-bold text-sky-900 mb-1">Workspace end-user policy</p>
                            <p className="text-xs text-sky-800">This page controls how end-users sign into this workspace. Tenant owner and tenant admin sign-in is configured separately under Tenant Access.</p>
                        </div>

                        {/* Sign-In Methods tab */}
                        {tab === 'access' && (
                            <>
                                <div className="rounded-3xl border border-border bg-white p-5 shadow-sm">
                                    <h3 className="font-black text-gray-800 mb-1 flex items-center gap-2">
                                        <ShieldCheck className="w-4 h-4 text-sky-500" /> Login Methods
                                    </h3>
                                    <p className="text-xs font-semibold text-gray-400 mb-4">
                                        Which methods end-users can use to sign into this workspace.
                                    </p>
                                    <div className="space-y-3">
                                        <PortalToggleRow
                                            checked={authPolicyForm.allow_magic_link}
                                            onChange={value => setAuthPolicyForm((prev: AuthPolicyForm) => ({ ...prev, allow_magic_link: value }))}
                                            disabled={demoMode}
                                            label="Magic Link"
                                            hint="Users can sign in with a one-time email link."
                                        />
                                        <PortalToggleRow
                                            checked={authPolicyForm.allow_passkey}
                                            onChange={value => setAuthPolicyForm((prev: AuthPolicyForm) => ({ ...prev, allow_passkey: value }))}
                                            disabled={demoMode}
                                            label="Passkey"
                                            hint="Users can sign in with a device passkey (WebAuthn)."
                                        />
                                        <PortalToggleRow
                                            checked={authPolicyForm.allow_google}
                                            onChange={value => setAuthPolicyForm((prev: AuthPolicyForm) => ({ ...prev, allow_google: value }))}
                                            disabled={demoMode}
                                            label="Google"
                                            hint="Users can sign in with their Google account."
                                        />
                                        <PortalToggleRow
                                            checked={authPolicyForm.allow_microsoft}
                                            onChange={value => setAuthPolicyForm((prev: AuthPolicyForm) => ({ ...prev, allow_microsoft: value }))}
                                            disabled={demoMode}
                                            label="Microsoft"
                                            hint="Users can sign in with their Microsoft account."
                                        />
                                    </div>
                                </div>

                                <div className="rounded-3xl border border-border bg-white p-5 shadow-sm">
                                    <h3 className="font-black text-gray-800 mb-1 flex items-center gap-2">
                                        <ShieldCheck className="w-4 h-4 text-rose-500" /> Access Rules
                                    </h3>
                                    <p className="text-xs font-semibold text-gray-400 mb-4">
                                        Tighten access requirements for this workspace.
                                    </p>
                                    <div className="space-y-3">
                                        <PortalToggleRow
                                            checked={Boolean(authPolicyForm.allowed_email_domains.trim())}
                                            onChange={value => setAuthPolicyForm((prev: AuthPolicyForm) => ({ ...prev, allowed_email_domains: value ? prev.allowed_email_domains : '' }))}
                                            disabled={demoMode}
                                            label="Restrict allowed email domains"
                                            hint="Use a domain allowlist to limit end-user access to approved email domains only. Configure the domains below."
                                        />
                                        <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
                                            <label className="block text-xs font-black uppercase tracking-[0.16em] text-gray-500 mb-2">Allowed email domains</label>
                                            <input
                                                type="text"
                                                value={authPolicyForm.allowed_email_domains}
                                                onChange={e => setAuthPolicyForm((prev: AuthPolicyForm) => ({ ...prev, allowed_email_domains: e.target.value }))}
                                                disabled={demoMode}
                                                placeholder="acme.com, acme.io"
                                                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-sky-200 transition-all disabled:opacity-60"
                                            />
                                            <p className="mt-2 text-xs font-semibold text-gray-400">Comma-separated. Leave blank to allow any domain.</p>
                                        </div>
                                    </div>

                                    {authPolicyForm.allow_magic_link && (
                                        <div className="mt-6 space-y-6">
                                            {/* Admin Rate Limiting */}
                                            <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-5">
                                                <h4 className="font-black text-amber-900 mb-1 flex items-center gap-2 text-sm uppercase tracking-wider">
                                                    <ShieldCheck className="w-4 h-4 text-amber-500" /> Admin Rate Limiting
                                                </h4>
                                                <p className="text-[10px] font-bold text-amber-800/60 mb-4">
                                                    PROTECTS OWNERS & ADMINS. ADJUSTED BY WORKSPACE OWNERS.
                                                </p>
                                                <div className="grid gap-4 sm:grid-cols-2">
                                                    <div>
                                                        <label className="block text-xs font-black uppercase tracking-[0.16em] text-amber-900/60 mb-2">Max requests</label>
                                                        <input
                                                            type="number"
                                                            value={authPolicyForm.magic_link_rate_limit_admin_override}
                                                            onChange={e => setAuthPolicyForm((prev: AuthPolicyForm) => ({ ...prev, magic_link_rate_limit_admin_override: e.target.value }))}
                                                            disabled={demoMode}
                                                            placeholder="e.g. 3"
                                                            className="w-full px-4 py-3 bg-white border border-amber-200 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-amber-200 transition-all disabled:opacity-60"
                                                        />
                                                        <p className="mt-2 text-[10px] font-semibold text-amber-800/50">Leave blank to use platform floor.</p>
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-black uppercase tracking-[0.16em] text-amber-900/60 mb-2">Window (seconds)</label>
                                                        <input
                                                            type="number"
                                                            value={authPolicyForm.magic_link_rate_window_admin_override}
                                                            onChange={e => setAuthPolicyForm((prev: AuthPolicyForm) => ({ ...prev, magic_link_rate_window_admin_override: e.target.value }))}
                                                            disabled={demoMode}
                                                            placeholder="e.g. 600"
                                                            className="w-full px-4 py-3 bg-white border border-amber-200 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-amber-200 transition-all disabled:opacity-60"
                                                        />
                                                        <p className="mt-2 text-[10px] font-semibold text-amber-800/50">Time window for the limit above.</p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Staff Rate Limiting */}
                                            <div className="rounded-2xl border border-sky-100 bg-sky-50/50 p-5">
                                                <h4 className="font-black text-sky-900 mb-1 flex items-center gap-2 text-sm uppercase tracking-wider">
                                                    <ShieldCheck className="w-4 h-4 text-sky-500" /> Staff Rate Limiting
                                                </h4>
                                                <p className="text-[10px] font-bold text-sky-800/60 mb-4">
                                                    PROTECTS END-USERS & STAFF. ADJUSTED BY WORKSPACE ADMINS.
                                                </p>
                                                <div className="grid gap-4 sm:grid-cols-2">
                                                    <div>
                                                        <label className="block text-xs font-black uppercase tracking-[0.16em] text-sky-900/60 mb-2">Max requests</label>
                                                        <input
                                                            type="number"
                                                            value={authPolicyForm.magic_link_rate_limit_staff_override}
                                                            onChange={e => setAuthPolicyForm((prev: AuthPolicyForm) => ({ ...prev, magic_link_rate_limit_staff_override: e.target.value }))}
                                                            disabled={demoMode}
                                                            placeholder="e.g. 5"
                                                            className="w-full px-4 py-3 bg-white border border-sky-200 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-sky-200 transition-all disabled:opacity-60"
                                                        />
                                                        <p className="mt-2 text-[10px] font-semibold text-sky-800/50">Leave blank to use platform floor.</p>
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-black uppercase tracking-[0.16em] text-sky-900/60 mb-2">Window (seconds)</label>
                                                        <input
                                                            type="number"
                                                            value={authPolicyForm.magic_link_rate_window_staff_override}
                                                            onChange={e => setAuthPolicyForm((prev: AuthPolicyForm) => ({ ...prev, magic_link_rate_window_staff_override: e.target.value }))}
                                                            disabled={demoMode}
                                                            placeholder="e.g. 3600"
                                                            className="w-full px-4 py-3 bg-white border border-sky-200 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-sky-200 transition-all disabled:opacity-60"
                                                        />
                                                        <p className="mt-2 text-[10px] font-semibold text-sky-800/50">Time window for the limit above.</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <form onSubmit={onSaveAuthPolicy}>
                                    <PortalSaveActionFooter
                                        loading={savingPolicy}
                                        dirty={policyMessage}
                                        disabled={demoMode || savingPolicy}
                                        label="Save Access Policy"
                                        type="submit"
                                    />
                                </form>
                            </>
                        )}

                        {/* IP Policy tab */}
                        {tab === 'ip' && (
                            <div className="rounded-3xl border border-border bg-white p-5 shadow-sm">
                                <h3 className="font-black text-gray-800 mb-1 flex items-center gap-2">
                                    <Network className="w-4 h-4 text-rose-500" /> IP Policy
                                </h3>
                                <p className="text-xs font-semibold text-gray-400 mb-4">
                                    Allow or deny access by IP or CIDR for this workspace.
                                    {' '}
                                    {!orgIpPolicy?.platform.tenant_ip_policy_editable
                                        ? 'The platform admin has locked this workspace to inherited IP defaults.'
                                        : 'Enable the override to replace platform defaults for this workspace only.'}
                                </p>
                                <form onSubmit={onSaveIpPolicy} className="space-y-3">
                                    <PortalToggleRow
                                        checked={ipPolicyForm.use_custom_ip_policy}
                                        onChange={value => setIpPolicyForm((prev: TenantIpPolicy) => ({ ...prev, use_custom_ip_policy: value }))}
                                        disabled={demoMode || !orgIpPolicy?.platform.tenant_ip_policy_editable}
                                        label="Use workspace IP override"
                                        hint={orgIpPolicy?.platform.tenant_ip_policy_editable
                                            ? 'Replace the platform IP defaults for this workspace only.'
                                            : 'Platform admin has locked this workspace to inherited IP defaults.'}
                                    />
                                    <div className="rounded-2xl border border-border bg-white p-4 shadow-sm space-y-4">
                                        <div>
                                            <label className={labelClass}>Allowlist</label>
                                            <textarea
                                                value={ipPolicyForm.allowlist}
                                                onChange={e => setIpPolicyForm((prev: TenantIpPolicy) => ({ ...prev, allowlist: e.target.value }))}
                                                disabled={demoMode || !ipPolicyForm.use_custom_ip_policy || !orgIpPolicy?.platform.tenant_ip_policy_editable}
                                                placeholder={"203.0.113.0/24\n198.51.100.14"}
                                                className={`${inputClass} min-h-[100px] resize-y disabled:opacity-60`}
                                            />
                                            <p className="mt-2 text-xs font-semibold text-gray-400">Optional. One IP or CIDR per line. Leave blank to allow all.</p>
                                        </div>
                                        <div>
                                            <label className={labelClass}>Blocklist</label>
                                            <textarea
                                                value={ipPolicyForm.blocklist}
                                                onChange={e => setIpPolicyForm((prev: TenantIpPolicy) => ({ ...prev, blocklist: e.target.value }))}
                                                disabled={demoMode || !ipPolicyForm.use_custom_ip_policy || !orgIpPolicy?.platform.tenant_ip_policy_editable}
                                                placeholder={"198.51.100.0/24\n203.0.113.20"}
                                                className={`${inputClass} min-h-[100px] resize-y disabled:opacity-60`}
                                            />
                                            <p className="mt-2 text-xs font-semibold text-gray-400">Optional. One IP or CIDR per line.</p>
                                        </div>
                                    </div>
                                    <PortalSaveActionFooter
                                        loading={savingIpPolicy}
                                        dirty={ipPolicyMessage}
                                        disabled={demoMode || savingIpPolicy || loadingIpPolicy}
                                        label="Save IP Policy"
                                        type="submit"
                                    />
                                </form>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}
