import React, { useEffect, useMemo, useState } from 'react'
import { RooiamBrowser } from '@rooiam/sdk-browser'
import { getApiBase } from '../../lib/api-base'

export default function TrustedDevices({ disabled = false }: { disabled?: boolean }) {
    const sdk = useMemo(() => new RooiamBrowser({ apiBase: getApiBase() }), [])
    const [devices, setDevices] = useState<Awaited<ReturnType<typeof sdk.trustedDevices.list>>>([])
    const [message, setMessage] = useState('')
    const [busy, setBusy] = useState(false)
    useEffect(() => { let active = true; sdk.trustedDevices.list().then(list => { if (active) setDevices(list) }).catch(() => { if (active) setMessage('Could not load trusted phones.') }); return () => { active = false } }, [sdk])
    async function revoke(id: string) {
        if (!window.confirm('Revoke this phone? It will no longer approve sign-ins.')) return
        setBusy(true)
        try { await sdk.trustedDevices.revoke(id); setDevices(await sdk.trustedDevices.list()); setMessage('Phone revoked.') }
        catch (e) { setMessage(e instanceof Error ? e.message : 'Could not revoke the phone.') }
        finally { setBusy(false) }
    }
    return <section className="rounded-2xl border bg-white p-5 space-y-3">
        <h2 className="font-bold">Trusted phones</h2>
        <p className="text-sm text-gray-600">Enroll a phone in the Rooiam Android app. Revoke a lost or unused phone here.</p>
        {message && <p role="status" className="text-sm">{message}</p>}
        {!devices.length && <p className="text-sm">No trusted phones registered.</p>}
        {devices.map(device => <div key={device.id} className="flex items-center justify-between gap-3 border-t pt-3">
            <div><p className="font-semibold">{device.device_label}</p><p className="text-xs text-gray-600">{device.revoked_at ? 'Revoked' : device.attestation.status === 'verified' ? 'Attestation verified' : `Attestation: ${device.attestation.status}`}</p></div>
            {!device.revoked_at && <button disabled={disabled || busy} className="text-sm text-red-700 underline disabled:opacity-50" onClick={() => revoke(device.id)}>Revoke</button>}
        </div>)}
    </section>
}
