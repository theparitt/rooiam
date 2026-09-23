import { describe, it, expect, vi } from 'vitest'
import { RooiamBrowser, RooiamError } from './index.js'

describe('device login browser binding', () => {
  it('binds the native browser fetch receiver', async () => {
    const nativeLike = function (this: unknown) {
      if (this !== globalThis) throw new TypeError('Illegal invocation')
      return Promise.resolve(new Response(JSON.stringify({ status: 'pending' })))
    }
    vi.stubGlobal('fetch', nativeLike)
    try {
      const sdk = new RooiamBrowser({ apiBase: 'https://auth.example/v1' })
      await expect(sdk.deviceLogin.status({ public_id: 'id', browser_nonce: 'nonce' })).resolves.toEqual({ status: 'pending' })
    } finally { vi.unstubAllGlobals() }
  })
  it('uses only the initiating nonce and public ID and supports cancellation of polling', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'pending' })))
    const sdk = new RooiamBrowser({ apiBase: 'https://auth.example/v1', fetch })
    const controller = new AbortController()
    await sdk.deviceLogin.status({ public_id: 'request-id', browser_nonce: 'secret+nonce' }, controller.signal)
    const [url, init] = fetch.mock.calls[0]
    expect(new URL(url).searchParams.get('browser_nonce')).toBe('secret+nonce')
    expect(init).toMatchObject({ credentials: 'include', cache: 'no-store', signal: controller.signal })
    expect(init.headers.Authorization).toBeUndefined()
  })
  it('never retries ambiguous completion', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('connection lost'))
    const sdk = new RooiamBrowser({ apiBase: 'https://auth.example/v1', fetch })
    await expect(sdk.deviceLogin.complete({ public_id: 'request', browser_nonce: 'nonce' })).rejects.toThrow('connection lost')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('preserves MFA as an incomplete authentication result', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, mfa_required: true, challenge_id: 'challenge' })))
    const result = await new RooiamBrowser({ apiBase: 'https://auth.example/v1', fetch }).deviceLogin.complete({ public_id: 'request', browser_nonce: 'nonce' })
    expect(result.mfa_required).toBe(true)
    expect(result.user_id).toBeUndefined()
  })
  it('exposes an expired/conflicting result as an error', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Expired' } }), { status: 409 }))
    await expect(new RooiamBrowser({ apiBase: 'https://auth.example/v1', fetch }).deviceLogin.complete({ public_id: 'request', browser_nonce: 'nonce' })).rejects.toBeInstanceOf(RooiamError)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
