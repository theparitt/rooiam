import React, { useEffect, useState } from 'react'
import { ShieldAlert, Loader2 } from 'lucide-react'
import { sysAdminApi } from '@/lib/api'
import type { RiskPolicy } from '@/lib/api'
import PageHeader from '@/components/ui/PageHeader'
import SectionCard from '@/components/ui/SectionCard'
import SaveActionFooter from '@/components/ui/SaveActionFooter'

function ToggleRow({ label, description, checked, onChange }: {
    label: string
    description: string
    checked: boolean
    onChange: (v: boolean) => void
}) {
    return (
        <div className="flex items-start justify-between gap-4 py-3">
            <div>
                <p className="text-sm font-semibold text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                onClick={() => onChange(!checked)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${checked ? 'bg-primary' : 'bg-muted'}`}
            >
                <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
        </div>
    )
}

function NumberField({ label, description, value, min, max, onChange, disabled }: {
    label: string
    description: string
    value: number
    min: number
    max: number
    onChange: (v: number) => void
    disabled?: boolean
}) {
    return (
        <div className={`flex items-start justify-between gap-4 py-3 ${disabled ? 'opacity-40' : ''}`}>
            <div>
                <p className="text-sm font-semibold text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            </div>
            <input
                type="number"
                min={min}
                max={max}
                value={value}
                disabled={disabled}
                onChange={e => onChange(Math.max(min, Math.min(max, Number(e.target.value))))}
                className="w-24 px-3 py-1.5 bg-card border-2 border-border rounded-xl text-sm font-bold text-center outline-none focus:ring-2 focus:ring-primary transition-all disabled:cursor-not-allowed"
            />
        </div>
    )
}

export default function RiskSettings() {
    const [policy, setPolicy] = useState<RiskPolicy | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [loadError, setLoadError] = useState('')
    const [saveError, setSaveError] = useState('')

    // Local edit state
    const [enabled, setEnabled] = useState(true)
    const [newIpEnabled, setNewIpEnabled] = useState(true)
    const [newIpLookback, setNewIpLookback] = useState(10)
    const [rapidEnabled, setRapidEnabled] = useState(true)
    const [rapidWindow, setRapidWindow] = useState(10)
    const [newUserAgentEnabled, setNewUserAgentEnabled] = useState(true)
    const [newUserAgentLookback, setNewUserAgentLookback] = useState(10)
    const [operatorEmailEnabled, setOperatorEmailEnabled] = useState(true)

    useEffect(() => {
        setLoading(true)
        sysAdminApi.riskPolicy()
            .then(data => {
                setPolicy(data)
                setEnabled(data.enabled)
                setNewIpEnabled(data.new_ip_enabled)
                setNewIpLookback(data.new_ip_lookback)
                setRapidEnabled(data.rapid_ip_change_enabled)
                setRapidWindow(data.rapid_ip_change_window_minutes)
                setNewUserAgentEnabled(data.new_user_agent_enabled)
                setNewUserAgentLookback(data.new_user_agent_lookback)
                setOperatorEmailEnabled(data.operator_email_enabled)
            })
            .catch(err => setLoadError(err instanceof Error ? err.message : 'Could not load risk policy.'))
            .finally(() => setLoading(false))
    }, [])

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        setSaved(false)
        setSaveError('')
        try {
            const updated = await sysAdminApi.updateRiskPolicy({
                enabled,
                new_ip_enabled: newIpEnabled,
                new_ip_lookback: newIpLookback,
                rapid_ip_change_enabled: rapidEnabled,
                rapid_ip_change_window_minutes: rapidWindow,
                new_user_agent_enabled: newUserAgentEnabled,
                new_user_agent_lookback: newUserAgentLookback,
                operator_email_enabled: operatorEmailEnabled,
            })
            setPolicy(updated)
            setSaved(true)
        } catch (err) {
            setSaveError(err instanceof Error ? err.message : 'Save failed.')
        } finally {
            setSaving(false)
        }
    }

    const dirty = policy !== null && (
        enabled !== policy.enabled ||
        newIpEnabled !== policy.new_ip_enabled ||
        newIpLookback !== policy.new_ip_lookback ||
        rapidEnabled !== policy.rapid_ip_change_enabled ||
        rapidWindow !== policy.rapid_ip_change_window_minutes ||
        newUserAgentEnabled !== policy.new_user_agent_enabled ||
        newUserAgentLookback !== policy.new_user_agent_lookback ||
        operatorEmailEnabled !== policy.operator_email_enabled
    )

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PageHeader
                title="Risk Detection"
                description="Configure signals used to detect suspicious logins. Flagged events are written to audit logs with the suspicious tone — no logins are blocked at Level 1."
            />

            {loading ? (
                <div className="flex items-center justify-center py-20 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
                </div>
            ) : loadError ? (
                <div className="text-center py-16 text-red-500 bg-red-50 rounded-3xl">
                    <p className="text-5xl mb-3">🛑</p>
                    <p className="font-bold text-lg max-w-sm mx-auto">{loadError}</p>
                </div>
            ) : (
                <form onSubmit={handleSave} className="space-y-5">
                    {/* Master switch */}
                    <SectionCard
                        icon={ShieldAlert}
                        title="Risk Detection"
                        subtitle="When disabled, no signals are evaluated and no suspicious events are logged."
                        tone="amber"
                        bodyClassName=""
                    >
                        <div className="px-5 py-2 divide-y">
                            <ToggleRow
                                label="Enable risk detection"
                                description="Master switch for all login risk signals."
                                checked={enabled}
                                onChange={v => { setEnabled(v); setSaved(false) }}
                            />
                        </div>
                    </SectionCard>

                    {/* Signal config */}
                    <SectionCard
                        icon={ShieldAlert}
                        title="Signals"
                        subtitle="Each signal independently detects a login anomaly and writes an auth.login.suspicious event to audit logs."
                        bodyClassName=""
                    >
                        <div className={`px-5 divide-y transition-opacity ${!enabled ? 'opacity-40 pointer-events-none' : ''}`}>

                            {/* New IP */}
                            <div className="py-4">
                                <ToggleRow
                                    label="New IP address"
                                    description="Flag logins from an IP not seen in the user's recent login history. Skipped on first-ever login."
                                    checked={newIpEnabled}
                                    onChange={v => { setNewIpEnabled(v); setSaved(false) }}
                                />
                                <NumberField
                                    label="Lookback (logins)"
                                    description="How many recent successful logins to check for a known IP."
                                    value={newIpLookback}
                                    min={1}
                                    max={100}
                                    disabled={!newIpEnabled}
                                    onChange={v => { setNewIpLookback(v); setSaved(false) }}
                                />
                            </div>

                            {/* Rapid IP change */}
                            <div className="py-4">
                                <ToggleRow
                                    label="Rapid IP change"
                                    description="Flag when the same user logs in from a different IP within a short time window — may indicate session sharing or account takeover."
                                    checked={rapidEnabled}
                                    onChange={v => { setRapidEnabled(v); setSaved(false) }}
                                />
                                <NumberField
                                    label="Time window (minutes)"
                                    description="How far back to look for a prior login from a different IP."
                                    value={rapidWindow}
                                    min={1}
                                    max={1440}
                                    disabled={!rapidEnabled}
                                    onChange={v => { setRapidWindow(v); setSaved(false) }}
                                />
                            </div>

                            <div className="py-4">
                                <ToggleRow
                                    label="New user agent"
                                    description="Flag when the browser or device signature has not been seen in the user's recent successful logins."
                                    checked={newUserAgentEnabled}
                                    onChange={v => { setNewUserAgentEnabled(v); setSaved(false) }}
                                />
                                <NumberField
                                    label="User-agent lookback (logins)"
                                    description="How many recent successful logins to check for a known browser/device signature."
                                    value={newUserAgentLookback}
                                    min={1}
                                    max={100}
                                    disabled={!newUserAgentEnabled}
                                    onChange={v => { setNewUserAgentLookback(v); setSaved(false) }}
                                />
                            </div>

                            <div className="py-4">
                                <ToggleRow
                                    label="High-severity operator email"
                                    description="Send suspicious-auth email alerts to tenant owners/admins or platform staff for high-severity login anomalies such as rapid IP change."
                                    checked={operatorEmailEnabled}
                                    onChange={v => { setOperatorEmailEnabled(v); setSaved(false) }}
                                />
                            </div>
                        </div>

                        <div className="px-5 pb-5">
                            <SaveActionFooter
                                loading={saving}
                                saved={saved}
                                disabled={!dirty || saving}
                                error={saveError}
                                type="submit"
                            />
                        </div>
                    </SectionCard>
                </form>
            )}
        </div>
    )
}
