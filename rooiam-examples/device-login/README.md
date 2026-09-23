# Signing fake phone

This Node 22 CLI uses real Ed25519 keys and the same preview/sign/approve contract as Android. It does not synthesize vendor attestation. Use an isolated development stack; the live runner in `test/device-login-live.mjs` provisions test-only users and exercises the complete HTTP journey.

For manual use, save an authenticated account's `rooiam_sid=...` cookie in a private file and copy the browser's QR text to another file. Never commit either file or the generated identity. The identity contains the private key and random device token.

```sh
chmod 600 /tmp/phone-cookie
export ROOIAM_PHONE_ORIGIN=http://127.0.0.1:15470
node fake-phone.mjs enroll /tmp/phone-identity /tmp/phone-cookie
node fake-phone.mjs preview /tmp/phone-identity /tmp/phone-cookie /tmp/request-qr
node fake-phone.mjs approve /tmp/phone-identity /tmp/phone-cookie /tmp/request-qr 42
node fake-phone.mjs deny /tmp/phone-identity /tmp/phone-cookie /tmp/request-qr
node fake-phone.mjs revoke /tmp/phone-identity /tmp/phone-cookie
node --test fake-phone.test.mjs
```

Use the actual matching number from preview and compare the browser request code before approving. `approve` and `deny` are alternative decisions. Origin/account changes and ambiguous QR parameters are rejected before device credentials can be sent to another server. Completion and MFA remain the browser's responsibility. Keep the default attestation requirements on every real deployment.
