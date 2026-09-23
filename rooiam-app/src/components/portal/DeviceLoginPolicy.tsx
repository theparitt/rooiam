import React, { useEffect, useState } from 'react'
import { apiFetch, getApiBase } from '../../lib/api-base'

export default function DeviceLoginPolicy({ disabled, workspaceId }: { disabled: boolean; workspaceId: string }) {
    const [enabled, setEnabled] = useState(false)
    const [platformEnabled, setPlatformEnabled] = useState(false)
    const [message, setMessage] = useState('')
    const [busy, setBusy] = useState(true)
    useEffect(() => {
        let active = true; setBusy(true)
        apiFetch(`${getApiBase()}/identity/device-login/workspace-policy`).then(async r => {
            if (!r.ok) throw new Error('Could not load phone sign-in policy.')
            const result = await r.json(); if (active) { setEnabled(result.enabled); setPlatformEnabled(result.platform_enabled) }
        }).catch(e => { if (active) setMessage(e.message) }).finally(() => { if (active) setBusy(false) })
        return () => { active = false }
    }, [workspaceId])
    async function save(value: boolean) {
        setBusy(true); setMessage('')
        try {
            const response = await apiFetch(`${getApiBase()}/identity/device-login/workspace-policy`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: value }) })
            const result = await response.json()
            if (!response.ok) throw new Error(result.error?.message || 'Could not save policy.')
            setEnabled(result.enabled); setMessage('Phone sign-in policy saved.')
        } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not save policy.') }
        finally { setBusy(false) }
    }
    return <section className="rounded-2xl border bg-white p-5">
        <h2 className="font-bold">Trusted-phone sign-in</h2>
        <p className="my-2 text-sm text-gray-600">Allow enrolled Android phones to approve sign-ins for this workspace. Existing MFA requirements still apply.</p>
        {!platformEnabled && <p className="my-2 text-sm text-amber-800">The operator must enable phone sign-in before it becomes available.</p>}
        <label className="flex gap-3 items-center text-sm"><input type="checkbox" checked={enabled} disabled={disabled || busy} onChange={e => save(e.target.checked)} />Allow phone sign-in</label>
        {message && <p className="mt-2 text-sm" role="status">{message}</p>}
    </section>
}
