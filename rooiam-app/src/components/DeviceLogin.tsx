import React, { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { RooiamBrowser, type DeviceLoginInput, type DeviceLoginResult, type DeviceLoginStart } from '@rooiam/sdk-browser'
import { getApiBase } from '../lib/api-base'

export default function DeviceLogin({ input, onComplete }: { input: DeviceLoginInput; onComplete: (result: DeviceLoginResult) => void }) {
    const sdk = useMemo(() => new RooiamBrowser({ apiBase: getApiBase() }), [])
    const [intent, setIntent] = useState<DeviceLoginStart | null>(null)
    const [qr, setQr] = useState('')
    const [status, setStatus] = useState('idle')
    const [error, setError] = useState('')
    const [seconds, setSeconds] = useState(0)
    const running = useRef(false)
    const completeCallback = useRef(onComplete)
    completeCallback.current = onComplete
    const controller = useRef<AbortController | null>(null)

    useEffect(() => () => controller.current?.abort(), [])

    async function start() {
        if (running.current) return
        running.current = true
        setError(''); setStatus('starting')
        const abort = new AbortController()
        controller.current = abort
        try {
            const created = await sdk.deviceLogin.start(input, abort.signal)
            const image = await QRCode.toDataURL(created.qr_value, { width: 240, margin: 2 })
            if (abort.signal.aborted) return
            setQr(image); setIntent(created); setStatus('pending')
        } catch (e) {
            if (!abort.signal.aborted) { setStatus('error'); setError(e instanceof Error ? e.message : 'Could not start phone sign-in.') }
        } finally { running.current = false }
    }

    useEffect(() => {
        if (!intent || status !== 'pending') return
        const abort = new AbortController()
        controller.current = abort
        const binding = { public_id: intent.public_id, browser_nonce: intent.browser_nonce }
        let timeout: ReturnType<typeof setTimeout>
        const clock = setInterval(() => setSeconds(Math.max(0, Math.ceil((Date.parse(intent.expires_at) - Date.now()) / 1000))), 1000)
        setSeconds(Math.max(0, Math.ceil((Date.parse(intent.expires_at) - Date.now()) / 1000)))
        async function poll() {
            try {
                if (Date.now() >= Date.parse(intent!.expires_at)) { setStatus('expired'); return }
                const result = await sdk.deviceLogin.status(binding, abort.signal)
                if (abort.signal.aborted) return
                if (result.status === 'approved') {
                    // Complete once. An ambiguous network result must not be retried automatically.
                    const completed = await sdk.deviceLogin.complete(binding, abort.signal)
                    if (abort.signal.aborted) return
                    setStatus('completed')
                    completeCallback.current(completed)
                } else if (result.status === 'pending') {
                    timeout = setTimeout(poll, 2000)
                } else if (['rejected', 'cancelled', 'expired', 'consumed'].includes(result.status)) {
                    setStatus(result.status)
                } else { throw new Error('Unsupported sign-in status. Start a new request.') }
            } catch (e) {
                if (!abort.signal.aborted) { setStatus('error'); setError(e instanceof Error ? e.message : 'Connection lost. Start a new request.') }
            }
        }
        timeout = setTimeout(poll, 1500)
        return () => { abort.abort(); clearTimeout(timeout); clearInterval(clock) }
    }, [intent, sdk, status])

    async function cancel() {
        if (!intent) return
        controller.current?.abort()
        setStatus('cancelling')
        try {
            await sdk.deviceLogin.cancel({ public_id: intent.public_id, browser_nonce: intent.browser_nonce })
            setStatus('cancelled')
        } catch (e) { setStatus('error'); setError(e instanceof Error ? e.message : 'Could not cancel.') }
    }

    return <section className="mt-4 rounded-2xl border border-purple-200 bg-white p-5 text-center" aria-label="Sign in with your phone">
        <h2 className="font-bold text-gray-800">Sign in with your phone</h2>
        {status === 'idle' && <><p className="my-3 text-sm text-gray-600">Use an enrolled Rooiam Android phone to approve this browser.</p><button type="button" className="rounded-xl bg-purple-100 px-5 py-3 font-bold" onClick={start}>Show QR code</button></>}
        {status === 'starting' && <p role="status">Preparing your request…</p>}
        {status === 'pending' && intent && <>
            <img className="mx-auto" width={240} height={240} src={qr} alt="Scan this sign-in request with Rooiam Android" />
            <p className="text-sm">Match this request code on your phone:</p>
            <p className="my-2 font-mono text-3xl tracking-widest">{intent.display_code}</p>
            <p className="text-sm">Your phone will show one of these numbers: {intent.number_choices.join(' · ')}.</p>
            <p className="my-2 text-sm" role="status">Waiting for approval · {seconds}s remaining</p>
            <button type="button" className="underline" onClick={cancel}>Cancel sign-in</button>
        </>}
        {error && <p role="alert" className="my-3 text-sm text-red-700">{error}</p>}
        {!['idle', 'pending', 'starting', 'completed'].includes(status) && <>
            <p role="status" className="my-3 text-sm">{status === 'rejected' ? 'Your phone denied this request.' : status === 'expired' ? 'This request expired.' : status === 'cancelled' ? 'Sign-in cancelled.' : 'This request is no longer available.'}</p>
            <button type="button" className="font-bold underline" onClick={() => window.location.reload()}>Start a new request</button>
        </>}
    </section>
}
