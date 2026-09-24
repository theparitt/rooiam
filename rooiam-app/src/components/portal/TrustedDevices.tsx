import React, { useEffect, useMemo, useState } from 'react'
import { RooiamBrowser } from '@rooiam/sdk-browser'
import { getApiBase } from '../../lib/api-base'
import { portalRoutes } from '../../lib/routes'
import PortalConfirmModal from './PortalConfirmModal'

export default function TrustedDevices({ disabled = false }: { disabled?: boolean }) {
    const sdk = useMemo(() => new RooiamBrowser({ apiBase: getApiBase() }), [])
    const [devices, setDevices] = useState<Awaited<ReturnType<typeof sdk.trustedDevices.list>>>([])
    const [message, setMessage] = useState('')
    const [busy, setBusy] = useState(false)
    const [loading, setLoading] = useState(true)
    const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null)
    const [revokeError, setRevokeError] = useState('')
    useEffect(() => { let active = true; sdk.trustedDevices.list().then(list => { if (active) setDevices(list) }).catch(() => { if (active) setMessage('Could not load trusted phones.') }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [sdk])
    const selectedDevice = devices.find(device => device.id === selectedDeviceId)
    function closeConfirmation() {
        if (busy) return
        setSelectedDeviceId(null)
        setRevokeError('')
    }
    async function revoke() {
        if (!selectedDevice || disabled || busy) return
        setBusy(true)
        setRevokeError('')
        try {
            await sdk.trustedDevices.revoke(selectedDevice.id)
            setDevices(current => current.map(device => device.id === selectedDevice.id ? { ...device, revoked_at: new Date().toISOString() } : device))
            setSelectedDeviceId(null)
            setMessage('Phone revoked. Pending approvals from it have been stopped. Review My Sessions if it may be stolen.')
            void sdk.trustedDevices.list().then(setDevices).catch(() => {})
        } catch (e) { setRevokeError(e instanceof Error ? e.message : 'Could not revoke the phone.') }
        finally { setBusy(false) }
    }
    return <section className="rounded-2xl border bg-white p-5 space-y-3">
        <h2 className="font-bold">Trusted phones</h2>
        <p className="text-sm text-gray-600">A phone must be enrolled on this Rooiam account before it can approve sign-ins or workspace API keys.</p>
        <details className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-gray-700">
            <summary className="cursor-pointer font-bold text-violet-800">Lost your phone or moving to a new one?</summary>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
                <li>Sign in with another method you already use, such as a magic link or passkey. Complete MFA if asked. Sign in again if this session is older than 10 minutes.</li>
                <li>Revoke the lost phone below. Its pending approvals stop, but existing browser sessions need separate review in <a className="font-bold text-violet-700 underline" href={portalRoutes.mySessions()}>My Sessions</a>.</li>
                <li>Install your Android app on the new phone, sign in to the same Rooiam account, then enroll it. Wait for device verification before using Phone sign-in or approving API keys.</li>
            </ol>
            <p className="mt-3">If a workspace requires phone confirmation, new API keys stay blocked until an eligible phone is enrolled. Losing every sign-in method needs operator-assisted account recovery; Rooiam will not bypass the phone policy automatically.</p>
        </details>
        {message && <p role="status" className="text-sm">{message}</p>}
        {!loading && !devices.length && <p className="text-sm">No trusted phones registered. Sign in to your Android app and enroll this account to add one.</p>}
        {devices.map(device => <div key={device.id} className="flex items-center justify-between gap-3 border-t pt-3">
            <div><p className="font-semibold">{device.device_label}</p><p className="text-xs text-gray-600">{device.revoked_at ? 'Revoked' : device.attestation.status === 'verified' ? 'Attestation verified' : `Attestation: ${device.attestation.status}`}</p><p className="text-xs text-gray-500">Enrolled {new Date(device.created_at).toLocaleString()} · ID …{device.id.slice(-8)}{device.last_used_at ? ` · Last used ${new Date(device.last_used_at).toLocaleString()}` : ''}</p></div>
            {!device.revoked_at && <button type="button" disabled={disabled || busy} className="text-sm text-red-700 underline disabled:opacity-50" onClick={() => { setRevokeError(''); setSelectedDeviceId(device.id) }}>Revoke phone</button>}
        </div>)}
        {selectedDevice && !selectedDevice.revoked_at ? (
            <PortalConfirmModal
                title="Revoke this phone?"
                description={<>
                    <p className="font-bold text-slate-800">{selectedDevice.device_label} <span className="font-medium text-slate-500">· ID …{selectedDevice.id.slice(-8)}</span></p>
                    <p>This phone will stop approving sign-ins and pending API-key requests. If it is lost, review your other browser sessions separately in My Sessions.</p>
                </>}
                confirmLabel="Revoke phone"
                busyLabel="Revoking…"
                onConfirm={() => void revoke()}
                onClose={closeConfirmation}
                busy={busy}
                error={revokeError}
            />
        ) : null}
    </section>
}
