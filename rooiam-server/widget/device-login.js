import QRCode from 'qrcode'
import { RooiamBrowser } from '@rooiam/sdk-browser'

// Bundled locally: no third-party QR service receives the sign-in request.
window.RooiamDeviceLogin = async function ({ element, apiBase, input, onComplete, onBack, onResize }) {
    const sdk = new RooiamBrowser({ apiBase })
    const controller = new AbortController()
    let intent, timer, done = false
    element.replaceChildren()
    const heading = document.createElement('h2'); heading.textContent = 'Sign in with your phone'
    const status = document.createElement('p'); status.setAttribute('role', 'status'); status.textContent = 'Preparing your request…'
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'secondary'; cancel.textContent = 'Cancel sign-in'
    element.append(heading, status, cancel); onResize()
    const onPageHide = () => { controller.abort(); finish('Start a new phone sign-in request.'); cancel.disabled = false }
    const finish = message => { done = true; clearTimeout(timer); window.removeEventListener('pagehide', onPageHide); status.textContent = message; cancel.textContent = 'Back to sign-in methods'; onResize() }
    cancel.onclick = async () => {
        if (done) { onBack(); return }
        cancel.disabled = true
        controller.abort(); clearTimeout(timer)
        try {
            if (intent) await sdk.deviceLogin.cancel({ public_id: intent.public_id, browser_nonce: intent.browser_nonce })
            finish('Sign-in cancelled.')
        } catch { finish('Could not confirm cancellation. Start a new request; do not approve the old one.') }
        finally { cancel.disabled = false }
    }
    window.addEventListener('pagehide', onPageHide, { once: true })
    try {
        cancel.disabled = true
        intent = await sdk.deviceLogin.start(input, controller.signal)
        const image = document.createElement('img'); image.width = 240; image.height = 240
        image.alt = 'Scan this sign-in request with Rooiam Android'
        image.src = await QRCode.toDataURL(intent.qr_value, { width: 240, margin: 2 })
        if (controller.signal.aborted) return
        const code = document.createElement('p'); code.className = 'device-code'; code.textContent = intent.display_code
        const hint = document.createElement('p'); hint.textContent = 'Compare this request code with your phone. Matching numbers: ' + intent.number_choices.join(' · ')
        element.insertBefore(image, status); element.insertBefore(code, status); element.insertBefore(hint, status)
        const binding = { public_id: intent.public_id, browser_nonce: intent.browser_nonce }
        async function poll() {
            try {
                if (Date.now() >= Date.parse(intent.expires_at)) { finish('This request expired.'); return }
                status.textContent = 'Waiting for approval · ' + Math.max(0, Math.ceil((Date.parse(intent.expires_at) - Date.now()) / 1000)) + 's remaining'
                const result = await sdk.deviceLogin.status(binding, controller.signal)
                if (controller.signal.aborted) return
                if (result.status === 'approved') {
                    cancel.disabled = true
                    // Completion is attempted once, including after ambiguous network failures.
                    const completed = await sdk.deviceLogin.complete(binding, controller.signal)
                    if (controller.signal.aborted) return
                    done = true; onComplete(completed)
                } else if (result.status === 'pending') timer = setTimeout(poll, 2000)
                else finish(result.status === 'rejected' ? 'Your phone denied this request.' : 'This request is no longer available.')
            } catch (error) {
                if (!controller.signal.aborted) { cancel.disabled = false; finish(error.message || 'Connection lost. Start a new request.') }
            }
        }
        status.textContent = 'Waiting for approval'; cancel.disabled = false; onResize()
        timer = setTimeout(poll, 1500)
    } catch (error) {
        cancel.disabled = false
        if (!controller.signal.aborted) finish(error.message || 'Could not start phone sign-in.')
    }
}
