# Mobile Device Login Contract

Status: active server contract.
Updated: 2026-06-16.

This document is the implementation guide for `rooiam-android`, `rooiam-ios`,
and any fake-phone/dev tester that participates in Rooiam QR login.

Use this together with [40_device_login_plan.md](./40_device_login_plan.md).
This page is the concrete mobile contract. The plan doc is the broader design.

## Goal

The mobile app acts as a trusted authenticator for QR login.

The current server requires two things for approval:

- a registered trusted-device token
- a valid Ed25519 signature from that device's registered public key

Device token alone is not enough anymore.

The server also now accepts and stores attestation evidence at device
registration time. Attestation is not yet fully verified, but the server can
already distinguish:

- `missing` — device registered with no attestation evidence
- `pending` — attestation evidence received and stored, verification pipeline not finished
- `verified` — attestation evidence passed the current server verifier
- `rejected` — attestation evidence failed the current server verifier or policy

For QR approval, the current server policy requires a trusted device to end up
in `verified` status.

## Current Endpoints

Trusted device registration:

- `POST /v1/identity/me/devices/attestation-challenge`
- `POST /v1/identity/me/devices`
- `GET /v1/identity/me/devices`
- `PUT /v1/identity/me/devices/{id}/push-token`
- `DELETE /v1/identity/me/devices/{id}`

QR approval flow:

- `GET /v1/identity/device-login/intents/{public_id}`
- `POST /v1/identity/device-login/approve`
- `POST /v1/identity/device-login/reject`

Browser-side endpoints exist separately:

- `POST /v1/auth/device-login/start`
- `GET /v1/auth/device-login/{public_id}/status`
- `POST /v1/auth/device-login/complete`
- `POST /v1/auth/device-login/cancel`

## QR Format

The QR code currently carries a deep-link style value:

```text
rooiam://device-login?server=https%3A%2F%2Fapi.rooiam.com&public_id=<uuid>
```

Mobile clients must read:

- `server`
- `public_id`

`server` is the API origin to contact.
`public_id` identifies the login intent.

## Device Identity Requirements

Each mobile installation that can approve QR login must have:

- a random `device_token`
- an Ed25519 key pair

Rules:

- generate them once during trusted-device registration
- keep the private key only on the device
- keep the private key in OS-protected secure storage
- never send the private key to the server
- the server stores only `device_public_key` and a hash of `device_token`

Recommended values:

- `device_token`: at least 32 random bytes, encoded as base64url or hex
- `device_label`: human-readable device name, for example `Pixel 8 Pro`
- `platform`: `android` or `ios`

## Registration Contract

### iOS App Attest challenge

Before a real `ios-app-attest` registration, the mobile app must first ask the
server for a one-time challenge:

`POST /v1/identity/me/devices/attestation-challenge`

```json
{
  "format": "ios-app-attest",
  "key_id": "base64url-app-attest-key-id",
  "app_id": "com.rooiam.mobile",
  "environment": "production",
  "device_public_key": "ed25519:base64url-32-byte-public-key"
}
```

Current server behavior:

- this endpoint is currently only for `ios-app-attest`
- the server stores the challenge in Redis for 10 minutes
- the challenge is bound to:
  - current user
  - attestation format
  - App Attest `key_id`
  - `app_id`
  - `environment`
  - Rooiam device approval `device_public_key`

Response:

```json
{
  "ok": true,
  "challenge_token": "server-issued-token",
  "challenge": "base64url-random-challenge",
  "expires_at": "2026-06-16T03:10:00Z"
}
```

The iOS app must not hash only the raw challenge.

Rooiam binds the Apple attestation to the Rooiam QR-approval device key with
this exact UTF-8 preimage:

```text
rooiam-apple-app-attest/v1
{challenge}
{device_public_key}
{app_id}
{key_id}
{environment}
```

Then:

- `clientDataHash = SHA256(preimage)`
- call Apple `attestKey(keyId, clientDataHash: ...)`
- send the resulting attestation object back as the registration `statement`

The reason this exists is simple: real App Attest verification is not valid
without a server-issued one-time challenge bound to the registration data.

Request:

`POST /v1/identity/me/devices`

```json
{
  "device_label": "Pixel 8 Pro",
  "platform": "android",
  "device_token": "base64url-random-device-token",
  "device_public_key": "ed25519:base64url-32-byte-public-key",
  "attestation": {
    "format": "android-play-integrity",
    "key_id": "device-key-1",
    "app_id": "com.rooiam.mobile",
    "environment": "production",
    "challenge_token": "server-issued-token-if-needed",
    "statement": "base64-or-jws-attestation-evidence"
  }
}
```

Important:

- `device_public_key` is required
- `attestation` is optional for now, but recommended for real mobile clients
- `attestation.challenge_token` is currently used for real `ios-app-attest`
  registrations and is now required for `ios-app-attest`
- if `attestation` is omitted, registration still works but the device will stay
  in `missing` status and cannot approve QR login while attestation enforcement
  is enabled
- the server normalizes and validates the key
- the current accepted format is `ed25519:<base64url-32-byte-key>`
- accepted attestation formats are currently:
  - `android-play-integrity`
  - `android-key-attestation`
  - `ios-app-attest`
  - `ios-devicecheck`
- older devices registered without a key must be re-registered

Important distinction:

- `device_public_key` is the Rooiam Ed25519 key used later for QR approval signatures
- Apple App Attest creates a different Secure Enclave P-256 key
- the server binds those two key systems through the `clientDataHash` preimage above

Success response includes the trusted device record, including an attestation
summary:

```json
{
  "id": "uuid",
  "device_label": "Pixel 8 Pro",
  "platform": "android",
  "device_public_key": "ed25519:base64url-32-byte-public-key",
  "attestation": {
    "status": "pending",
    "format": "android-play-integrity",
    "key_id": "device-key-1",
    "app_id": "com.rooiam.mobile",
    "environment": "production",
    "received_at": "2026-06-16T03:00:00Z",
    "verified_at": null
  },
  "last_seen_at": null,
  "last_used_at": null,
  "revoked_at": null,
  "created_at": "2026-06-16T03:00:00Z"
}
```

The raw attestation statement is stored on the server but is not returned to clients.

## Push Token Bootstrap Contract

The server now supports a bootstrap contract for future push delivery.

Current endpoint:

`PUT /v1/identity/me/devices/{id}/push-token`

```json
{
  "push_token": "opaque-apns-or-fcm-token"
}
```

Rules:

- send the token after the trusted device is registered
- send the latest token again if the OS rotates it
- send `null` or an empty value to clear it on logout or push disable
- the server does not return the raw token back to clients
- trusted device responses now expose `push_capable: true|false`

Current boundary:

- this is only the bootstrap contract
- the server stores whether a trusted device is push-capable
- the server does not yet deliver APNs or FCM messages itself

Important QR constraint:

- anonymous browser QR start does not identify a user account yet
- because of that, the server cannot safely fan out a login-approval push at
  QR-start time today
- future push approval requires a user-bound initiation flow or a different
  login surface that identifies the account before push fan-out

## What The Server Verifies Today

The current compatibility verifier checks attestation evidence for:

- format matches the registered attestation format
- platform matches the trusted device platform
- attestation `public_key` matches the registered `device_public_key`
- `key_id`, `app_id`, and `environment` stay consistent with the registration
- `app_id` passes the server allowlist if configured
- development-style environments are blocked unless explicitly allowed by policy
- `issued_at` or `iat` is fresh enough for policy

Important boundary:

- this is still compatibility verification, not full vendor cryptographic verification
- Google Play Integrity vendor verification now has a real backend path on the server, but it is only active when `device_attestation_require_vendor_verification_for_qr_login=true`
- Apple App Attest vendor verification requires attestation-object and certificate-chain validation
- Apple App Attest also requires a server-issued one-time challenge before the
  attestation call; that challenge endpoint is now present on the server
- real Apple App Attest registration now verifies:
  - certificate chain to Apple App Attestation Root CA
  - nonce extension against the server-issued challenge binding
  - App ID hash
  - AAGUID
  - `key_id` / credential ID binding
- the server now has a separate enforcement switch for this:
  `device_attestation_require_vendor_verification_for_qr_login`
- keep that switch `false` until the Google Play service-account env vars are configured and the mobile app is sending the exact Android `requestHash` contract below
- do not enable that switch for iOS yet unless all mobile clients are using the real App Attest challenge flow

The server currently accepts attestation statements in one of these transport forms:

- raw JSON
- base64/base64url-encoded JSON
- JWS/JWT-like string where the payload decodes to JSON

The JSON payload the server currently evaluates should include:

```json
{
  "format": "android-play-integrity",
  "platform": "android",
  "key_id": "device-key-1",
  "app_id": "com.rooiam.mobile",
  "environment": "production",
  "public_key": "ed25519:base64url-32-byte-public-key",
  "issued_at": "2026-06-16T03:00:00Z"
}
```

`issued_at` may also be represented as JWT-style numeric `iat`.

For `android-play-integrity`, the server currently accepts either:

- the flat compatibility shape above
- a nested Play Integrity style payload

Nested Android example:

```json
{
  "format": "android-play-integrity",
  "platform": "android",
  "key_id": "device-key-1",
  "requestDetails": {
    "requestPackageName": "com.rooiam.mobile",
    "timestampMillis": 1781578800000
  },
  "appIntegrity": {
    "appRecognitionVerdict": "PLAY_RECOGNIZED",
    "packageName": "com.rooiam.mobile"
  },
  "deviceIntegrity": {
    "deviceRecognitionVerdict": ["MEETS_DEVICE_INTEGRITY"]
  },
  "deviceAttributes": {
    "publicKey": "ed25519:base64url-32-byte-public-key"
  }
}
```

Android notes:

- `requestDetails.requestPackageName` or `appIntegrity.packageName` is used as `app_id`
- `requestDetails.timestampMillis` is used as the attestation timestamp
- `deviceAttributes.publicKey` is matched against the registered `device_public_key`
- if a top-level `environment` is present, the server uses it
- otherwise `appRecognitionVerdict=PLAY_RECOGNIZED` is treated as `production`

When vendor verification is enabled for `android-play-integrity`, the mobile app must send the opaque Play Integrity token, not compatibility JSON.

The server then sends that token to Google Play for decoding and verifies a canonical `requestHash` binding.

The Android app must compute `requestHash` as SHA-256 hex of this exact UTF-8 payload:

```text
rooiam-google-play-attestation/v1
{device_public_key}
{app_id}
{key_id}
{environment}
```

Example:

```text
rooiam-google-play-attestation/v1
ed25519:base64url-32-byte-public-key
com.rooiam.mobile
device-key-1
production
```

Server-side Google Play verifier env vars:

- `ROOIAM_GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL`
- `ROOIAM_GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY_PATH` or `ROOIAM_GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY_PEM`
- optional `ROOIAM_GOOGLE_PLAY_TOKEN_URI` (default `https://oauth2.googleapis.com/token`)

For `ios-app-attest`, the server currently accepts either:

- the flat compatibility shape above
- a nested App Attest style payload
- a real App Attest registration should carry `challenge_token` alongside a
  base64/base64url Apple attestation object so the server can perform vendor verification

Nested iOS example:

```json
{
  "format": "ios-app-attest",
  "platform": "ios",
  "environment": "production",
  "appAttest": {
    "bundleId": "com.rooiam.mobile",
    "keyId": "device-key-1",
    "publicKey": "ed25519:base64url-32-byte-public-key",
    "receiptCreationDate": "2026-06-16T03:00:00Z"
  }
}
```

iOS notes:

- `appAttest.bundleId` is used as `app_id`
- `appAttest.keyId` is used as `key_id`
- `appAttest.receiptCreationDate` is used as the attestation timestamp
- that nested JSON shape is only for compatibility/dev tooling
- real Apple App Attest does not reuse the Rooiam `device_public_key` as the Apple attestation key
- for real App Attest, the server instead binds the Rooiam Ed25519 key through the `clientDataHash` preimage

Server-side Apple verifier env var:

- `ROOIAM_APPLE_APP_ID_PREFIX`

Set it to your Apple Team ID / App ID prefix so the server can verify the
App ID hash inside App Attest `authData`.

## Preview Contract

After scanning the QR code, the mobile app fetches the intent preview:

`GET /v1/identity/device-login/intents/{public_id}`

Current response shape:

```json
{
  "ok": true,
  "public_id": "uuid",
  "status": "pending",
  "display_code": "123456",
  "match_number": 42,
  "approval_payload": "rooiam-device-login/v1\n...",
  "expires_at": "2026-06-16T03:00:00Z"
}
```

The mobile app must display:

- the six-digit `display_code`
- the `match_number`
- expiry state

The mobile app must sign:

- `approval_payload`

The app should not reconstruct this payload itself if the server already sent it.
Use the exact bytes returned by the server, UTF-8 encoded, with no trimming,
normalization, or line-ending changes.

## Approval Payload

The current payload format is:

```text
rooiam-device-login/v1
{public_id}
{display_code}
{match_number}
{expires_at_rfc3339}
```

If any field changes, the signature must no longer verify.

## Approval Contract

Request:

`POST /v1/identity/device-login/approve`

```json
{
  "public_id": "uuid",
  "device_token": "base64url-random-device-token",
  "selected_number": 42,
  "approval_signature": "base64-or-base64url-ed25519-signature"
}
```

Server-side checks:

- mobile session cookie is valid
- trusted device exists for that user
- trusted device is not revoked
- trusted device attestation is `verified` when attestation policy is enforced
- trusted device has a registered public key
- `selected_number` matches the browser challenge
- `approval_signature` verifies against `approval_payload`
- intent is still pending and unexpired

If approval succeeds, the browser can later complete the login.

## Signing Rules

Sign the raw `approval_payload` bytes with the trusted device private key.

- algorithm: Ed25519
- payload encoding: UTF-8
- output: 64-byte signature
- request transport: base64url preferred, base64 accepted by server

Do not:

- hash the payload first unless the signing library requires it and still produces a standard Ed25519 signature over the original message semantics
- JSON-encode the payload before signing
- add trailing newline characters
- replace `\n` with platform-native line endings

## Recommended Mobile Flow

1. User signs into Rooiam on the phone.
2. App generates `device_token` and Ed25519 key pair if not already registered.
3. App registers itself with `POST /v1/identity/me/devices`.
4. User scans QR code from browser.
5. App extracts `server` and `public_id` from the QR value.
6. App loads `GET /v1/identity/device-login/intents/{public_id}`.
7. App shows the code/number to the user.
8. App signs `approval_payload`.
9. App posts `POST /v1/identity/device-login/approve`.
10. Browser polling sees `approved` and completes login.

## Error Handling

Expect failures such as:

- trusted device not registered
- trusted device revoked
- device key missing on old registration
- invalid attestation format
- invalid or too-short attestation statement
- invalid signature
- wrong selected number
- expired intent
- tenant/device-login policy disabled

Recommended client behavior:

- if server says the device was registered before key verification existed, force device re-registration
- if server says attestation was rejected, surface the rejection reason and force device re-registration
- if signature fails, treat it as a serious device-state error and do not retry endlessly
- if intent expired, prompt the user to start again in the browser

## Migration Rule For Old Devices

Some previously registered devices may still exist with only `device_token` and
no usable `device_public_key`.

Those devices can no longer approve QR login.

Mobile client behavior should be:

1. detect the server error
2. tell the user the phone must be registered again
3. revoke the old record if needed
4. create a fresh registration with a new device key

The same flow should be used for devices whose attestation status becomes
`rejected`.

## Fake Phone / Test Harness

A dev tester must implement the same contract as real mobile clients:

- load preview by `public_id`
- read exact `approval_payload`
- sign it with an Ed25519 private key
- send `approval_signature` and `device_token`

If the tester bypasses signature generation, it is no longer testing the real system.

## Remaining Gaps

This server contract is strong enough for production-style trusted-device
approval, but it is not the final ceiling.

Still recommended later:

- platform attestation verification
- local biometric gating before signature release
- push approval flow
- per-device risk scoring and approval alerts
