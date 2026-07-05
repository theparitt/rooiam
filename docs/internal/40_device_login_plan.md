# Device Login (QR / Phone) — Server-Aligned Plan

Status: **SERVER IMPLEMENTED / MOBILE HARDENING ACTIVE**.
Updated: 2026-06-16.

## Goal

Rooiam should support **cross-device login approval**:

1. A browser login surface shows a QR code and a short number.
2. A logged-in Rooiam mobile app scans the QR code.
3. The phone shows the login request details and a number-matching choice.
4. The user approves on the phone.
5. `rooiam-server` completes the browser login for the exact browser session that started the request.

This is **not** "QR code equals login credential".
The QR code only points to a short-lived server-side login intent.

Build order remains:

1. `rooiam-server`
2. web/downstream demo surface
3. fake phone tester
4. `rooiam-android`
5. `rooiam-ios`

## Current Implementation Snapshot

The server foundation is now live in `rooiam-server`.

Implemented:

- trusted device registration and revocation
- trusted-device push-token bootstrap contract
- browser QR start / status / complete flow
- authenticated mobile preview + approve flow
- authenticated mobile reject flow
- browser cancel flow
- browser-binding enforcement
- number matching
- Postgres-backed device-login intents
- tenant-level device-login enable / disable gate
- MFA-aware session completion
- audit logging around the main flow

Production-grade server hardening now enforced:

- trusted device registration requires a device public key
- trusted device registration can now capture attestation evidence and track attestation status
- QR approval requires a device signature
- the server verifies that signature against the registered device key before approval
- legacy trusted devices without a stored key must be re-registered before they can approve QR login

Not implemented yet:

- real push delivery through APNs / FCM
- full platform attestation verification
- biometric proof from the mobile device before signing

Current attestation enforcement boundary:

- compatibility verification is implemented now
- a hard-enforcement policy key now exists for future vendor proof:
  `device_attestation_require_vendor_verification_for_qr_login`
- Google Play Integrity backend decoding is now wired behind that policy key
- Apple App Attest registration now has:
  - a server-issued one-time challenge endpoint
  - certificate-chain verification to Apple App Attestation Root CA
  - nonce / App ID / AAGUID / key-id binding checks
- the iOS registration flow binds App Attest to the Rooiam Ed25519 device key
  through a canonical `clientDataHash` preimage
- do not enable that key in production until:
  - Google service-account env vars are configured
  - the Android client sends the required `requestHash` binding
  - the iOS client uses the App Attest challenge endpoint and sends the challenge
    token back at registration time
  - `ROOIAM_APPLE_APP_ID_PREFIX` is configured with the Apple Team ID / App ID prefix

## Current Server Foundation To Reuse

This plan should follow the current `rooiam-server` patterns instead of inventing a parallel auth system.

- Workspace login methods already live on `organizations`:
  `allow_magic_link`, `allow_google`, `allow_microsoft`, `allow_passkey`.
- Workspace auth gating already happens in `src/shared/auth_policy.rs`.
- Platform-wide tenant login toggles already live in `system_settings` via `src/shared/tenant_access.rs`.
- Challenge-style auth flows already exist:
  - MFA in `src/modules/mfa`
  - WebAuthn in `src/modules/webauthn`
- Audit logging already exists in `src/modules/audit`.
- Session issuance already exists in `src/modules/session/service.rs`.
- Hosted login widget and redirect-driven login flows already exist in `src/modules/auth/handlers.rs`.

So QR login should become:

- a new auth method in workspace policy
- a new device-login module in the server
- a normal audited login path
- a normal session issuance path

## Product Decision

V1 QR login should be a **trusted mobile approval flow**, not an anonymous login shortcut.

Required properties:

- the phone user is already logged in
- the phone is a trusted registered device
- the workspace allows device login
- the QR request is short-lived and single-use
- the approval is bound to the browser that started it
- the browser does not receive a session until the phone explicitly approves

This keeps QR login closer to passkey/device-approval security than to a weak magic QR shortcut.

## Policy Model

QR login should follow the same policy structure as existing auth methods.

### Platform level

Add a platform-wide tenant login toggle in `system_settings`, alongside:

- `tenant_login_magic_link_enabled`
- `tenant_login_google_enabled`
- `tenant_login_microsoft_enabled`
- `tenant_login_passkey_enabled`

New key:

- `tenant_login_device_enabled`

This is managed from the platform/admin side and acts as the master switch.

### Workspace level

Add a new `organizations` boolean:

- `allow_device_login BOOLEAN NOT NULL DEFAULT FALSE`

This matches the existing per-workspace method flags.

Also allow the method in `login_method_order` using:

- `device_login`

If `device_login` is disabled by workspace policy or by the platform-wide toggle, the login UI should not offer it.

### UI control

`app.rooiam.com` should expose a workspace-level toggle:

- `Allow QR / phone login`

with explanatory text:

- "Users must register a trusted Rooiam mobile device before they can sign in with phone QR login."

## Server Data Model

### 1. Trusted devices

Add a user-owned device table.

Suggested table:

```sql
CREATE TABLE user_trusted_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_label TEXT NOT NULL,
  platform TEXT NOT NULL,
  device_token_hash TEXT NOT NULL,
  device_public_key TEXT,
  push_token TEXT,
  last_seen_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX user_trusted_devices_device_token_hash_idx
  ON user_trusted_devices(device_token_hash);
```

Notes:

- `device_public_key` is required for production-grade device approval.
- Current server normalization format is `ed25519:<base64url-32-byte-key>`.
- `push_token` is for later push approval, not required in QR-scan v1.
- the server now has a first bootstrap contract for this token, but it still does
  not deliver APNs / FCM notifications itself yet.
- Use `revoked_at` instead of delete-only semantics so audit and recent-history remain explainable.

## Push Delivery Boundary

The server now supports trusted-device push-token registration so mobile apps can
declare that a device is push-capable.

What exists now:

- trusted device records can store a push token
- mobile clients can update or clear that token through the identity API
- trusted device responses now expose whether a device is `push_capable`

What does not exist yet:

- APNs dispatch
- FCM dispatch
- background fan-out workers
- delivery receipts / retry logic

Important product constraint:

- the current browser QR start flow is anonymous
- at `POST /v1/auth/device-login/start`, the server does not yet know which user
  account should receive a push
- because of that, Rooiam can bootstrap push-ready devices today, but it cannot
  safely fan out a login-approval push during anonymous QR start without a
  future user-bound initiation flow

### 2. Device login intents

Use a dedicated database table for login intents instead of Redis-only state.
The server already leans on SQL-backed challenge tables for MFA and WebAuthn.
Redis can still be used later for fan-out, polling acceleration, or rate limiting, but the source of truth should be Postgres.

Suggested table:

```sql
CREATE TABLE device_login_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id UUID NOT NULL UNIQUE,
  browser_binding_hash TEXT NOT NULL,
  nonce_hash TEXT NOT NULL,
  workspace_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  oauth_client_id UUID REFERENCES oauth_clients(id) ON DELETE SET NULL,
  redirect_uri TEXT,
  surface TEXT,
  display_code TEXT NOT NULL,
  match_number SMALLINT NOT NULL,
  decoy_numbers SMALLINT[] NOT NULL DEFAULT '{}',
  approved_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_device_id UUID REFERENCES user_trusted_devices(id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  status_reason TEXT,
  requester_ip TEXT,
  requester_user_agent TEXT,
  approved_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Recommended status values:

- `pending`
- `scanned`
- `approved`
- `rejected`
- `expired`
- `cancelled`
- `consumed`

## Server Module Shape

Add a new module:

- `src/modules/device_login`

Suggested layout:

- `handlers.rs`
- `service.rs`
- `repository.rs`
- `models.rs`
- `mod.rs`

And register it from:

- `src/modules/mod.rs`
- `src/bootstrap/router.rs`

This should look like the existing MFA and WebAuthn modules rather than a one-off handler blob.

## API Split

Keep unauthenticated browser-start endpoints under `/v1/auth`, and authenticated phone/device actions under `/v1/identity`.

### Browser / unauthenticated flow

```text
POST /v1/auth/device-login/start
GET  /v1/auth/device-login/{public_id}/status
POST /v1/auth/device-login/complete
```

### Mobile app / authenticated flow

```text
GET  /v1/identity/device-login/intents/{public_id}
POST /v1/identity/device-login/approve
```

### Trusted device management

```text
POST   /v1/identity/me/devices
GET    /v1/identity/me/devices
DELETE /v1/identity/me/devices/{id}
```

This split is consistent with the current server:

- `auth/*` for unauthenticated login initiation
- `identity/me/*` for authenticated self-service actions

## Browser Flow

1. Browser chooses `Sign in with phone`.
2. Browser calls `POST /v1/auth/device-login/start`.
3. Server validates:
   - platform tenant-device-login enabled
   - workspace allows device login
   - redirect/client/surface are valid
4. Server creates a `device_login_intent`.
5. Response contains:
   - `public_id`
   - raw `nonce`
   - `expires_at`
   - `display_code`
   - `match_number`
   - a QR payload or QR URL
6. Browser renders QR code and starts polling `status`.
7. Once approved, browser calls `complete`.
8. Server verifies the browser binding and issues the real session using the existing session service.

Important:

- `complete` must only work for the same browser binding that created the intent.
- approval does not itself set the browser session; completion does.

## Mobile Flow

1. Mobile app user is already logged in.
2. Mobile device is already registered as trusted.
3. Mobile app scans the QR code.
4. Mobile app calls `GET /v1/identity/device-login/intents/{public_id}`.
5. Server returns request details:
   - `public_id`
   - status
   - `display_code`
   - `match_number`
   - `expires_at`
   - `approval_payload`
6. Mobile app signs `approval_payload` with the registered device private key.
7. User approves.
8. Approve endpoint verifies:
   - phone session valid
   - trusted device valid and not revoked
   - workspace still allows device login
   - number chosen is correct
   - `approval_signature` is valid for the registered device key
   - intent still pending and not expired
9. Server updates intent status.
10. Browser polling sees the new status.

Current approve request body:

```json
{
  "public_id": "uuid",
  "device_token": "device-secret-or-installation-token",
  "selected_number": 42,
  "approval_signature": "base64-or-base64url-ed25519-signature"
}
```

## Security Rules

### Mandatory for v1

1. **Phone already logged in**
   QR login is not for anonymous mobile devices.

2. **Trusted device required**
   Only registered non-revoked devices can approve.

3. **Workspace + platform policy re-check**
   Policy must be enforced at both `start` and `approve`.

4. **Number matching**
   Browser shows one number. Phone shows multiple choices. User chooses the matching one.

5. **Browser binding**
   The browser that started the flow must be the only one allowed to complete it.

6. **Single-use intent**
   Once consumed, the intent cannot be approved or completed again.

7. **Short TTL**
   120 seconds is a good v1 default.

8. **Explicit rejection / expiry**
   No silent fallback and no ambiguous states.

9. **Audit logs**
   Every meaningful transition should be logged.

10. **Rate limits**
   Required on start, preview, approve, and complete.

11. **Cryptographic device proof**
   Approval must include a valid signature from the trusted device key. Device token alone is not sufficient.

### Audit events

Suggested events:

- `auth.device_login.started`
- `auth.device_login.scanned`
- `auth.device_login.approved`
- `auth.device_login.rejected`
- `auth.device_login.expired`
- `auth.device_login.cancelled`
- `auth.device_login.completed`
- `auth.device_login.wrong_number`
- `identity.device.registered`
- `identity.device.revoked`

## Approval Payload Contract

The current server asks the mobile device to sign this exact payload:

```text
rooiam-device-login/v1
{public_id}
{display_code}
{match_number}
{expires_at_rfc3339}
```

Notes:

- this payload is returned by `GET /v1/identity/device-login/intents/{public_id}` as `approval_payload`
- the signature is verified server-side against the stored `device_public_key`
- changing any field invalidates the signature

## Session Issuance

Do not invent a separate session format for QR login.

After successful browser completion, create the browser session through the existing session service:

- `SessionService::create_opaque_session_with_context(...)`

The context should include:

- `current_org_id`
- login surface
- requester IP / user-agent if that is already passed through the session creation path

This keeps QR login behavior aligned with the rest of the platform.

## Where The Toggle Appears

### `rooiam-app`

Workspace policy / authentication methods:

- `Allow Magic Link`
- `Allow Google`
- `Allow Microsoft`
- `Allow Passkey`
- `Allow QR / Phone Login`

If enabled, `login_method_order` may include `device_login`.

### Hosted login widget / downstream surface

Show `Sign in with phone` only when:

- platform tenant-device-login is enabled
- workspace `allow_device_login` is true
- `device_login` is in the workspace login method order

## Fake Phone Tester

Before building Android, create a dev-only tester page.

Purpose:

- preview/approve flows without QR scanner work
- easier status/debug validation
- easier automated testing

Capabilities:

- paste `public_id` + nonce
- preview request
- simulate correct number approval
- simulate wrong-number approval
- simulate bad-signature approval
- simulate expiry behavior

This should land before the real mobile app.

## Android MVP

Screens:

- login
- register trusted device
- scan QR
- review login request
- approve/reject
- trusted devices list
- recent approvals

First Android milestone:

- QR scan only
- no push notifications
- no background silent approval

## iOS Later

After the Android contract is stable:

- same server API
- same trusted-device model
- same preview / approve flow

No iOS-specific server branch should be required.

## Testing Checklist

### Server

```text
device_login_start_rejects_when_platform_toggle_disabled
device_login_start_rejects_when_workspace_toggle_disabled
device_login_start_creates_pending_intent
device_login_preview_requires_phone_session
device_login_approve_requires_trusted_device
device_login_approve_requires_device_signature
device_login_approve_rejects_invalid_signature
device_login_approve_rejects_revoked_device
device_login_approve_rejects_wrong_number
device_login_approve_rejects_expired_intent
device_login_approve_is_single_use
device_login_complete_requires_browser_binding
device_login_complete_issues_session
device_login_complete_cannot_reuse_consumed_intent
device_register_creates_trusted_device
device_register_requires_device_public_key
device_revoke_blocks_future_approvals
```

### Integration

```text
browser_start -> phone_preview -> phone_sign -> phone_approve -> browser_complete -> session_created
```

### Security

- wrong browser cannot complete
- wrong user cannot approve
- revoked device cannot approve
- unsigned or badly signed approval cannot approve
- disabled workspace cannot start or approve
- expired intent cannot be previewed or completed

## Build Order

```text
0. OpenAPI + SDK foundation
1. Server policy additions
2. Server trusted-device tables + repository
3. Server device-login intent tables + repository
4. Server auth/device-login endpoints
5. Workspace toggle in rooiam-app
6. Hosted widget / downstream QR UI
7. Fake phone tester
8. Android MVP
9. Trusted-device management UX
10. Push approval later
11. iOS later
```

## Recommended Versioning

```text
v0.2   OpenAPI / SDK / self-host polish
v0.3   trusted device + server device-login foundation
v0.4   hosted widget / downstream QR login
v0.5   rooiam-android MVP
v0.6   device management + audit/risk hardening
v0.7   push approval
v0.8   rooiam-ios
v1.0   stable auth platform release
```

## Recommendation

QR login is worth building, but only if it is treated as a **server-first trusted-device approval flow**.

Do not start with Android.
Do not let the QR code act as the credential.
Do not bypass the existing session, policy, audit, and challenge patterns already present in `rooiam-server`.
