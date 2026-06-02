# Device Login (QR / Phone) — Full Plan & Flow

Status: **PLAN** (not implemented). Foundation (OpenAPI + SDK) must land first.
Date: 2026-06-02.

## Goal

User opens a Rooiam web login surface → sees a **QR code + a number**.
User scans with `rooiam-android` → phone shows **3 numbers** → user taps the one
matching the web → web logs in.

**Build order: server → web widget → fake phone tester → Android → iOS.**
(Not Android first.)

Surfaces:
- `rooiam-app` (tenant portal) = where a workspace owner toggles the policy ON.
- Hosted login widget / candycloud (web) = where the end user clicks "Sign in
  with phone" and sees the QR + number.
- `rooiam-android` (mobile, to build) = the trusted authenticator.
- `rooiam-server` = the broker.

---

## Phase 0 — Keep current foundation first

Finish before device login, because QR login needs clean APIs:

1. OpenAPI ([42_openapi_sdk_phases.md](./42_openapi_sdk_phases.md))
2. SDK ([41_sdk_plan.md](./41_sdk_plan.md))
3. stable auth endpoints
4. hosted widget stability
5. self-host config clarity

Reason: if the API contract is messy, Android becomes painful.

---

## Phase 1 — Database

```sql
ALTER TABLE organizations ADD COLUMN allow_device_login boolean NOT NULL DEFAULT false;

CREATE TABLE trusted_devices (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id    UUID,                       -- workspace scope
  device_name        TEXT NOT NULL,              -- "Pixel 8 Pro"
  platform           TEXT NOT NULL,              -- 'android' | 'ios'
  device_public_key  TEXT,                       -- device-bound keypair (later)
  device_token_hash  TEXT NOT NULL,              -- hashed device credential
  push_token         TEXT,                       -- FCM, for push approval (later)
  last_seen_at       TIMESTAMPTZ,
  revoked_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Device-bound keypair is an improvement to add later.

---

## Phase 2 — Redis challenge

Key: `device_login:{challenge_id}`  ·  TTL **120s**

```json
{
  "status": "pending",
  "workspace_id": "...",
  "client_id": "...",
  "surface": "hosted_widget",
  "web_number": 47,
  "decoy_numbers": [12, 91],
  "code": "284913",
  "web_channel": "secret-random-binding",
  "approved_user_id": null,
  "created_at": "...", "ip": "...", "user_agent": "..."
}
```

Rules: short TTL · single use · cannot approve twice · cannot reuse after the web
session is issued · wrong number = reject · expired = explicit error.

---

## Phase 3 — Server API

```
POST   /v1/auth/device/start          web creates QR challenge
GET    /v1/auth/device/status         web polls pending/approved/denied/expired
POST   /v1/auth/device/approve        phone approves with chosen number
POST   /v1/auth/device/deny           phone rejects login
POST   /v1/auth/device/code/verify    fallback code flow
POST   /v1/auth/device/register       phone becomes a trusted device
GET    /v1/identity/me/devices        user lists trusted devices
DELETE /v1/identity/me/devices/{id}   user revokes a device
```

All DTOs use `#[serde(deny_unknown_fields)]`. Reuse the `challenge_id` pattern
from `modules/mfa`. Annotate every endpoint for OpenAPI (`#[utoipa::path]`).

---

## Phase 4 — Security requirements (mandatory)

1. **Number matching** — web shows `47`; phone shows `12 / 47 / 91`.
2. **Phone must already be logged in** — random install can't approve.
3. **Phone must be trusted** — must register the device first.
4. **Workspace policy** — `allow_device_login` must be ON (re-checked on approve).
5. **Channel binding** — only the browser that started the challenge can finish it.
6. **Rate limits** — on start, approve, code-verify, and wrong-number attempts.
7. **Audit logs** —
   `auth.device.challenge_started`, `auth.device.approved`,
   `auth.device.denied`, `auth.device.expired`, `auth.device.wrong_number`,
   `auth.device.revoked`.
8. **No silent fallback** — never auto-fallback to magic link / passkey if QR
   fails. See [[feedback_no_fallback]].

---

## Phase 5 — Web widget

Hosted widget adds a "Sign in with phone" option:

```
QR code
Confirm this number on your phone:
   47
Waiting for approval...
No camera? Open Rooiam app and enter the code.
```

Web behavior: call `/device/start` → render QR → poll `/device/status` → on
approved, server issues the session → redirect via the existing widget redirect
contract ([[project_rooiam_widget_redirect_contract]]).

---

## Phase 6 — Fake phone tester (before Android)

Dev-only page (e.g. `/dev/device-login-tester`) that can: paste a challenge id,
show the numbers, approve, deny, simulate wrong number, simulate expired. Saves
a lot of Android debugging time. Build this BEFORE the app.

---

## Phase 7 — Android MVP (`rooiam-android`)

1. Log in once with an existing method.
2. Register trusted device.
3. Scan QR.
4. Show login request: workspace name, browser/device info, rough location/IP,
   3 numbers.
5. User taps the matching number → app calls `/device/approve`.
6. Success.

Screens: login · trusted-device setup · QR scanner · approve-login · success ·
trusted-devices list. **QR scan only first — no push notifications yet.**

---

## Phase 8 — Admin control (rooiam-app)

Authentication Methods adds: `[x] Phone QR Login`, with a note:
"Phone QR Login requires users to register a trusted Rooiam mobile device."

---

## Phase 9 — Account security page

User account center: "My Trusted Devices" (device, platform, last used, revoke)
+ "Recent login approvals". Important for user trust.

---

## Phase 10 — iOS later

After Android is stable: reuse the same API, add `rooiam-ios`, same registration
/ QR / number matching. No iOS-specific server logic.

---

## Testing checklist

Server:
```
device_start_creates_pending_challenge
device_start_rejects_when_policy_disabled
device_approve_requires_phone_session
device_approve_requires_trusted_device
device_approve_rejects_wrong_number
device_approve_rejects_expired_challenge
device_approve_single_use_only
device_status_requires_web_channel
device_code_verify_works
device_deny_sets_denied
device_revoke_blocks_future_approval
```
Integration: web start → phone approve → web status approved → web receives
session → challenge cannot be reused.
Security: wrong browser can't consume challenge · wrong user can't approve ·
disabled workspace blocks approval · revoked device blocks approval.

---

## Build order

```
0. OpenAPI + SDK foundation
1. Server device-login API
2. Redis challenge
3. trusted_devices table
4. admin allow_device_login toggle
5. hosted widget QR UI
6. fake phone tester
7. Android MVP
8. account security device management
9. push notification login
10. iOS
```

---

## Version plan (where it lands)

```
v0.2   OpenAPI / SDK / self-host polish
v0.3   device login server foundation
v0.4   hosted widget QR login
v0.5   rooiam-android MVP
v0.6   trusted device management + audit/risk polish
v0.7   push notification approval
v0.8   rooiam-ios
v1.0   stable auth platform release
```

**Recommendation: do QR phone login — it can become Rooiam's standout feature.
But build it server-first, then widget, then Android.**
