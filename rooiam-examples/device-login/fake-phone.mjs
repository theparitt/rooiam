import { generateKeyPairSync, randomBytes, createPrivateKey, sign } from 'node:crypto'
import { readFileSync, writeFileSync, statSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function parseQr(raw, origin) {
  if (raw.length > 2048) throw new Error('QR is too large')
  const qr = new URL(raw)
  if (qr.protocol !== 'rooiam:' || qr.hostname !== 'device-login' || qr.username || qr.password || qr.port || qr.pathname || qr.hash) throw new Error('Unsupported QR')
  const entries = [...qr.searchParams]
  if (entries.length !== 2 || new Set(entries.map(([key]) => key)).size !== 2 || !qr.searchParams.has('server') || !qr.searchParams.has('public_id')) throw new Error('Ambiguous QR parameters')
  if (qr.searchParams.get('server').replace(/\/$/, '') !== origin) throw new Error('QR server differs from the enrolled server')
  const id = qr.searchParams.get('public_id')
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)) throw new Error('Invalid request ID')
  return id
}

export function generateIdentity(origin) {
  const pair = generateKeyPairSync('ed25519')
  const publicDer = pair.publicKey.export({ type: 'spki', format: 'der' })
  return { origin, device_token: randomBytes(32).toString('base64url'),
    device_public_key: 'ed25519:' + publicDer.subarray(-32).toString('base64url'),
    private_key: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }) }
}

export function approval(identity, preview, selectedNumber) {
  if (preview.protocol_version !== 1 || preview.status !== 'pending' || Date.parse(preview.expires_at) <= Date.now()) throw new Error('Request expired, unavailable or unsupported')
  if (selectedNumber !== preview.match_number) throw new Error('The selected number does not match')
  return { public_id: preview.public_id, device_token: identity.device_token, selected_number: selectedNumber,
    approval_signature: sign(null, Buffer.from(preview.approval_payload, 'utf8'), createPrivateKey(identity.private_key)).toString('base64url') }
}

async function main() {
  const [command, identityFile, cookieFile, qrFile, number] = process.argv.slice(2)
  const origin = process.env.ROOIAM_PHONE_ORIGIN?.replace(/\/$/, '')
  if (!origin || !identityFile || !cookieFile) throw new Error('Usage: ROOIAM_PHONE_ORIGIN=https://auth.example node fake-phone.mjs enroll|preview|approve|deny|revoke IDENTITY_FILE COOKIE_FILE [QR_FILE] [MATCH_NUMBER]')
  const url = new URL(origin)
  if (url.origin !== origin || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname)))) throw new Error('Use HTTPS or localhost development origin')
  if (!['enroll', 'preview', 'approve', 'deny', 'revoke'].includes(command)) throw new Error('Unknown command')
  if (statSync(cookieFile).mode & 0o077) throw new Error('Cookie file must be private (chmod 600)')
  let identity
  try { identity = JSON.parse(readFileSync(identityFile, 'utf8')); if (statSync(identityFile).mode & 0o077) throw new Error('Identity file must be private (chmod 600)') }
  catch (e) { if (e.code !== 'ENOENT' || command !== 'enroll') throw e; identity = generateIdentity(origin); writeFileSync(identityFile, JSON.stringify(identity), { mode: 0o600, flag: 'wx' }) }
  if (identity.origin !== origin) throw new Error('Identity belongs to another server')
  // Validate QR before loading/sending the cookie to any endpoint.
  const id = qrFile ? parseQr(readFileSync(qrFile, 'utf8').trim(), origin) : null
  const cookie = readFileSync(cookieFile, 'utf8').trim()
  const request = async (path, method = 'GET', body) => {
    const response = await fetch(origin + '/v1' + path, { method, redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error?.message || `HTTP ${response.status}`)
    return result
  }
  const user = await request('/identity/me')
  if (identity.user_id && identity.user_id !== user.id) throw new Error('Sign in with the account that enrolled this identity')
  if (command === 'enroll') {
    identity.user_id = user.id
    const devices = await request('/identity/me/devices')
    let registered = devices.find(d => d.device_public_key === identity.device_public_key && !d.revoked_at)
    if (!registered) registered = await request('/identity/me/devices', 'POST', { device_label: 'Development fake phone', platform: 'android', device_token: identity.device_token, device_public_key: identity.device_public_key })
    identity.id = registered.id; writeFileSync(identityFile, JSON.stringify(identity), { mode: 0o600 })
    console.log('Enrolled:', registered.id, 'attestation:', registered.attestation.status)
    console.log('This harness does not fabricate vendor attestation. Approval requires an explicitly configured isolated development server.')
  } else if (command === 'revoke') {
    if (!identity.id) throw new Error('Enroll first')
    await request('/identity/me/devices/' + identity.id, 'DELETE'); console.log('Device revoked')
  } else {
    if (!id) throw new Error('A QR file is required')
    const preview = await request('/identity/device-login/intents/' + id)
    if (command === 'preview') console.log(JSON.stringify({ server: origin, request: preview.public_id, code: preview.display_code, number: preview.match_number, expires_at: preview.expires_at, application: preview.redirect_uri }))
    if (command === 'approve') { await request('/identity/device-login/approve', 'POST', approval(identity, preview, Number(number))); console.log('Approved; browser must complete and satisfy MFA.') }
    if (command === 'deny') { await request('/identity/device-login/reject', 'POST', { public_id: id, device_token: identity.device_token }); console.log('Denied') }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => { console.error(e.message); process.exitCode = 1 })
