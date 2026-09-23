import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPublicKey, verify } from 'node:crypto'
import { approval, generateIdentity, parseQr } from './fake-phone.mjs'
const origin = 'https://auth.example'
const id = '12345678-1234-4234-8234-123456789abc'
test('QR origin and ambiguity checks happen before authentication', () => {
  assert.equal(parseQr(`rooiam://device-login?server=${origin}&public_id=${id}`, origin), id)
  for (const qr of [`rooiam://device-login?server=https://evil.example&public_id=${id}`, `rooiam://device-login?server=${origin}&public_id=${id}&server=${origin}`, `rooiam://device-login?server=${origin}&public_id=${id}&access_token=secret`]) assert.throws(() => parseQr(qr, origin))
})
test('real Ed25519 signatures are bound to exact payload bytes', () => {
  const identity = generateIdentity(origin)
  const preview = { public_id: id, protocol_version: 1, status: 'pending', expires_at: new Date(Date.now() + 60000).toISOString(), match_number: 42, approval_payload: `rooiam-device-login/v1\n${id}\n123456\n42\nexpiry` }
  const request = approval(identity, preview, 42)
  const signature = Buffer.from(request.approval_signature, 'base64url')
  assert.ok(verify(null, Buffer.from(preview.approval_payload), createPublicKey(identity.private_key), signature))
  assert.equal(verify(null, Buffer.from(preview.approval_payload + 'x'), createPublicKey(identity.private_key), signature), false)
  assert.throws(() => approval(identity, preview, 11))
  assert.throws(() => approval(identity, { ...preview, status: 'consumed' }, 42))
})
