import { useEffect, useState } from 'react'
import { Shield } from 'lucide-react'
import { sysAdminApi } from '@/lib/api'
import { apiFetch, getApiBase } from '@/lib/api-base'
import { WORKSPACE_LABEL_LOWER, WORKSPACE_LABEL_PLURAL_LOWER } from '@/lib/domain-labels'
import type { PlatformIpPolicy, TenantAccessPolicy } from '@/lib/api'
import PageHeader from '@/components/ui/PageHeader'
import HintBox from '@/components/ui/HintBox'
import SaveActionFooter from '@/components/ui/SaveActionFooter'
import TabBar from '@/components/ui/TabBar'
import ToggleRow from '@/components/ui/ToggleRow'

export default function TenantAccess()
{
    const apiBase = getApiBase()
    const [tenantAccess, setTenantAccess] = useState<TenantAccessPolicy | null>(null)
    const [ipPolicy, setIpPolicy] = useState<PlatformIpPolicy | null>(null)
    const [demoMode, setDemoMode] = useState(false)
    const [accessDirty, setAccessDirty] = useState(false)
    const [accessSaving, setAccessSaving] = useState(false)
    const [accessError, setAccessError] = useState('')
    const [ipPolicyDirty, setIpPolicyDirty] = useState(false)
    const [ipPolicySaving, setIpPolicySaving] = useState(false)
    const [ipPolicyError, setIpPolicyError] = useState('')
    const savedTab = localStorage.getItem('rooiam_tab_tenant_access')
    const [tab, setTab] = useState<'signin' | 'ip'>(savedTab === 'ip' ? 'ip' : 'signin')

    useEffect(() => {
        localStorage.setItem('rooiam_tab_tenant_access', tab)
    }, [tab])

    useEffect(() => {
        const load = async () => {
            try {
                const res = await apiFetch(`${apiBase}/setup/status`)
                if (res.ok) {
                    const data = await res.json().catch(() => ({}))
                    setDemoMode(Boolean(data?.demo_mode))
                }
            } catch {
                setDemoMode(false)
            }
            try {
                const ta = await sysAdminApi.tenantAccess()
                setTenantAccess(ta)
            } catch { setTenantAccess(null) }
            try {
                const ip = await sysAdminApi.ipPolicy()
                setIpPolicy(ip)
            } catch { setIpPolicy(null) }
        }
        load()
    }, [apiBase])

    const saveTenantAccess = async () => {
        if (!tenantAccess || demoMode) return
        setAccessSaving(true); setAccessError('')
        try {
            const saved = await sysAdminApi.updateTenantAccess(tenantAccess)
            setTenantAccess(saved)
            setAccessDirty(false)
        } catch (error) {
            setAccessError(error instanceof Error ? error.message : 'Failed to save tenant sign-in methods.')
        } finally { setAccessSaving(false) }
    }

    const saveIpPolicy = async () => {
        if (!ipPolicy || demoMode) return
        setIpPolicySaving(true); setIpPolicyError('')
        try {
            const saved = await sysAdminApi.updateIpPolicy(ipPolicy)
            setIpPolicy(saved)
            setIpPolicyDirty(false)
        } catch (error) {
            setIpPolicyError(error instanceof Error ? error.message : 'Failed to save platform IP policy.')
        } finally { setIpPolicySaving(false) }
    }

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PageHeader
                eyebrow="Tenant"
                title="Tenant Access"
                description="Control how tenant owners and tenant admins can sign in."
            />

            <TabBar
                active={tab}
                onChange={id => setTab(id)}
                items={[
                    { id: 'signin', label: 'Sign-In Methods', icon: <Shield className="w-4 h-4" /> },
                    { id: 'ip', label: 'IP Policy', icon: <Shield className="w-4 h-4" /> },
                ]}
            />

            <div className="space-y-4">
                {demoMode ? (
                    <HintBox tone="amber" title="Tenant access is locked in demo mode">
                        Demo keeps tenant-admin sign-in methods and tenant workspace guardrails fixed so visitors can explore without rewriting the seeded operator model.
                    </HintBox>
                ) : null}

                <HintBox tone="sky" title="Tenant operator policy">
                    This page controls how tenant owners and tenant admins sign in. Workspace end-user sign-in is configured separately under Tenant Workspace.
                </HintBox>

                {tab === 'signin' && tenantAccess && (
                    <div className="rounded-3xl border border-border bg-white p-5 shadow-sm">
                        <h3 className="font-black text-gray-800 mb-1 flex items-center gap-2">
                            <Shield className="w-4 h-4 text-sky-500" /> Tenant Login Methods
                        </h3>
                        <p className="text-xs font-semibold text-gray-400 mb-4">
                            Controls for how tenant owners and tenant admins can log in. These are operator login methods, not workspace end-user login methods.
                        </p>
                        <div className="space-y-3">
                            <ToggleRow
                                checked={tenantAccess.allow_magic_link}
                                onChange={value => { setTenantAccess(current => current ? { ...current, allow_magic_link: value } : current); setAccessDirty(true) }}
                                disabled={demoMode}
                                label="Allow Magic Link"
                                hint="Tenant owners and tenant admins can sign in with email magic links."
                            />
                            <ToggleRow
                                checked={tenantAccess.allow_google}
                                onChange={value => { setTenantAccess(current => current ? { ...current, allow_google: value } : current); setAccessDirty(true) }}
                                disabled={demoMode}
                                label="Allow Google"
                                hint="Tenant owners and tenant admins can use Google sign-in when Google OAuth is configured."
                            />
                            <ToggleRow
                                checked={tenantAccess.allow_microsoft}
                                onChange={value => { setTenantAccess(current => current ? { ...current, allow_microsoft: value } : current); setAccessDirty(true) }}
                                disabled={demoMode}
                                label="Allow Microsoft"
                                hint="Tenant owners and tenant admins can use Microsoft sign-in when Microsoft OAuth is configured."
                            />
                            <ToggleRow
                                checked={tenantAccess.allow_passkey}
                                onChange={value => { setTenantAccess(current => current ? { ...current, allow_passkey: value } : current); setAccessDirty(true) }}
                                disabled={demoMode}
                                label="Allow Passkey"
                                hint="Tenant owners and tenant admins can sign in with passkeys when WebAuthn is available."
                            />
                        </div>
                        <SaveActionFooter
                            error={accessError}
                            loading={accessSaving}
                            dirty={accessDirty}
                            onClick={saveTenantAccess}
                            disabled={demoMode || accessSaving}
                            label="Save Access Policy"
                        />
                    </div>
                )}

                {tab === 'ip' && ipPolicy && (
                    <div className="rounded-3xl border border-border bg-white p-5 shadow-sm">
                        <h3 className="font-black text-gray-800 mb-1 flex items-center gap-2">
                            <Shield className="w-4 h-4 text-rose-500" /> IP Policy
                        </h3>
                        <p className="text-xs font-semibold text-gray-400 mb-4">
                            {`Default IP allow/block lists applied to tenant access. ${WORKSPACE_LABEL_PLURAL_LOWER.charAt(0).toUpperCase()}${WORKSPACE_LABEL_PLURAL_LOWER.slice(1)} can override these only when the toggle below is enabled.`}
                        </p>
                        <div className="space-y-3">
                            <ToggleRow
                                checked={ipPolicy.tenant_ip_policy_editable}
                                onChange={value => { setIpPolicy(current => current ? { ...current, tenant_ip_policy_editable: value } : current); setIpPolicyDirty(true) }}
                                disabled={demoMode}
                                label={`Allow ${WORKSPACE_LABEL_LOWER} IP policy override`}
                                hint={`If enabled, ${WORKSPACE_LABEL_LOWER}s can set their own allow/block lists.`}
                            />
                            <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
                                <label className="block text-xs font-black uppercase tracking-[0.16em] text-gray-500 mb-2">Default Allowlist</label>
                                <textarea value={ipPolicy.default_allowlist}
                                    onChange={e => { setIpPolicy(current => current ? { ...current, default_allowlist: e.target.value } : current); setIpPolicyDirty(true) }}
                                    disabled={demoMode}
                                    placeholder={"203.0.113.0/24\n198.51.100.12"}
                                    className="w-full min-h-[100px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-sky-200" />
                                <p className="mt-2 text-xs font-semibold text-gray-400">Optional. One IP or CIDR per line. Leave blank to allow all.</p>
                            </div>
                            <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
                                <label className="block text-xs font-black uppercase tracking-[0.16em] text-gray-500 mb-2">Default Blocklist</label>
                                <textarea value={ipPolicy.default_blocklist}
                                    onChange={e => { setIpPolicy(current => current ? { ...current, default_blocklist: e.target.value } : current); setIpPolicyDirty(true) }}
                                    disabled={demoMode}
                                    placeholder={"198.51.100.0/24\n203.0.113.10"}
                                    className="w-full min-h-[100px] rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-sky-200" />
                                <p className="mt-2 text-xs font-semibold text-gray-400">Optional. One IP or CIDR per line.</p>
                            </div>
                        </div>
                        <SaveActionFooter
                            error={ipPolicyError}
                            loading={ipPolicySaving}
                            dirty={ipPolicyDirty}
                            onClick={saveIpPolicy}
                            disabled={demoMode || ipPolicySaving}
                            label="Save IP Policy"
                        />
                    </div>
                )}

            </div>
        </div>
    )
}
