# Phase 3 Implementation Plan

This document turns `Phase 3: Standards + Security` into concrete repo tickets.

The goal of Phase 3 is:

- make OIDC usable without custom client-side workarounds
- make the security story credible for production startup use
- remove placeholder admin surfaces that weaken trust

## Ticket 1: OIDC Discovery Endpoint

Goal:

- add OpenID discovery metadata at `/.well-known/openid-configuration`

API:

- `GET /.well-known/openid-configuration`

Backend files:

- update [router.rs](/home/theparitt/work/rooiam/rooiam-server/src/bootstrap/router.rs)
- extend [oidc/handlers.rs](/home/theparitt/work/rooiam/rooiam-server/src/modules/oidc/handlers.rs)
- extend [config.rs](/home/theparitt/work/rooiam/rooiam-server/src/bootstrap/config.rs)

Implementation notes:

- add a stable issuer URL config value
- publish `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, and `jwks_uri`
- stop using `"rooiam"` as the issuer in production-facing metadata

Done when:

- a client can discover Rooiam from discovery metadata alone

## Ticket 2: JWKS Endpoint

Goal:

- expose `/.well-known/jwks.json`

API:

- `GET /.well-known/jwks.json`

Backend files:

- extend [oidc/handlers.rs](/home/theparitt/work/rooiam/rooiam-server/src/modules/oidc/handlers.rs)
- extend [oidc/service.rs](/home/theparitt/work/rooiam/rooiam-server/src/modules/oidc/service.rs)
- extend [config.rs](/home/theparitt/work/rooiam/rooiam-server/src/bootstrap/config.rs)

Implementation notes:

- either keep HS-based signing as a short-term internal mode and add a documented non-public limitation
- or move to asymmetric signing for OIDC-compliant verification
- if asymmetric signing is adopted, add key ID support and a rotation story

Done when:

- an OIDC client can validate ID tokens using published keys

## Ticket 3: `userinfo` Endpoint

Goal:

- add claims lookup for OIDC access tokens

API:

- `GET /v1/oidc/userinfo`

Backend files:

- extend [oidc/handlers.rs](/home/theparitt/work/rooiam/rooiam-server/src/modules/oidc/handlers.rs)
- extend [oidc/service.rs](/home/theparitt/work/rooiam/rooiam-server/src/modules/oidc/service.rs)
- possibly add bearer-token middleware under [http/middleware](/home/theparitt/work/rooiam/rooiam-server/src/http/middleware)
- reuse [identity/repository.rs](/home/theparitt/work/rooiam/rooiam-server/src/modules/identity/repository.rs)

Implementation notes:

- return `sub` at minimum
- add `email`, `email_verified`, `name`, and `picture` where available
- scope claims by requested scopes, especially `openid`, `email`, and `profile`

Done when:

- a standard OIDC relying party can fetch user claims from Rooiam

## Ticket 4: Stable Issuer / Audience / Token Claims

Goal:

- remove MVP token shortcuts and make token content consistent

Backend files:

- update [oidc/service.rs](/home/theparitt/work/rooiam/rooiam-server/src/modules/oidc/service.rs)
- update [config.rs](/home/theparitt/work/rooiam/rooiam-server/src/bootstrap/config.rs)
- update docs in [DocsPage.tsx](/home/theparitt/work/rooiam/rooiam-landing/src/pages/DocsPage.tsx)

Implementation notes:

- add a dedicated issuer/base URL env var
- make `iss`, `aud`, `sub`, `iat`, and `exp` predictable
- include `sid` only where it is intentional
- document the token model in landing docs and technical docs

Done when:

- token claims no longer depend on local-only placeholders

## Ticket 5: Passkey Data Model

Goal:

- add persistent storage for WebAuthn credentials

Migration:

- add a new migration after [0004_system_settings.sql](/home/theparitt/work/rooiam/rooiam-server/migrations/0004_system_settings.sql)

Suggested tables:

- `user_passkeys`
  - `id`
  - `user_id`
  - `credential_id`
  - `public_key`
  - `sign_count`
  - `transports`
  - `aaguid`
  - `name`
  - `last_used_at`
  - `created_at`

- `webauthn_challenges`
  - `id`
  - `user_id nullable`
  - `purpose`
  - `challenge_hash`
  - `expires_at`
  - `used_at`
  - `created_at`

Backend files:

- new module under [modules](/home/theparitt/work/rooiam/rooiam-server/src/modules)
- likely `modules/webauthn/handlers.rs`
- likely `modules/webauthn/service.rs`
- likely `modules/webauthn/repository.rs`
- update [modules/mod.rs](/home/theparitt/work/rooiam/rooiam-server/src/modules/mod.rs)
- update [router.rs](/home/theparitt/work/rooiam/rooiam-server/src/bootstrap/router.rs)

Done when:

- the server can persist registered passkeys safely

## Ticket 6: Passkey Registration Flow

Goal:

- let an authenticated user add a passkey

API:

- `POST /v1/webauthn/register/start`
- `POST /v1/webauthn/register/finish`

Backend files:

- new WebAuthn module
- reuse [auth.rs](/home/theparitt/work/rooiam/rooiam-server/src/http/middleware/auth.rs) for authenticated registration

UI files:

- add passkey enrollment UI to [PlatformSettings.tsx](/home/theparitt/work/rooiam/rooiam-admin/src/pages/PlatformSettings.tsx)
- optionally expose it later in [rooiam-app](/home/theparitt/work/rooiam/rooiam-app)

Done when:

- a logged-in user can enroll and name a passkey

## Ticket 7: Passkey Login Flow

Goal:

- let a user authenticate with a passkey

API:

- `POST /v1/webauthn/login/start`
- `POST /v1/webauthn/login/finish`

Backend files:

- new WebAuthn module
- reuse [session/service.rs](/home/theparitt/work/rooiam/rooiam-server/src/modules/session/service.rs)
- reuse [cookie.rs](/home/theparitt/work/rooiam/rooiam-server/src/modules/session/cookie.rs)

UI files:

- add passkey login button to [MagicLink.tsx](/home/theparitt/work/rooiam/rooiam-app/src/pages/MagicLink.tsx)
- update hosted login flow in [rooiam-app](/home/theparitt/work/rooiam/rooiam-app)

Done when:

- a returning user can sign in without email if a passkey exists

## Ticket 8: MFA Baseline

Goal:

- add a second-factor path before enterprise work

Recommended first step:

- TOTP

Migration:

- add `user_mfa_methods`
  - `id`
  - `user_id`
  - `method_type`
  - `secret_encrypted`
  - `is_primary`
  - `verified_at`
  - `created_at`

- add `mfa_challenges`
  - `id`
  - `user_id`
  - `session_id nullable`
  - `method_type`
  - `code_hash or challenge payload`
  - `expires_at`
  - `used_at`
  - `created_at`

Backend files:

- new module under [modules](/home/theparitt/work/rooiam/rooiam-server/src/modules)

UI files:

- extend [PlatformSettings.tsx](/home/theparitt/work/rooiam/rooiam-admin/src/pages/PlatformSettings.tsx)
- possibly add step-up prompts in [rooiam-app](/home/theparitt/work/rooiam/rooiam-app)

Done when:

- a user can enroll MFA and be challenged during login or sensitive actions

## Ticket 9: Session / Device Management Polish

Goal:

- make sessions a visible product strength

Backend:

- improve session metadata capture during login and request flow
- consider updating `last_seen_at` on authenticated activity
- add revoke-all-sessions endpoint

API:

- existing:
  - `GET /v1/identity/me/sessions`
  - `DELETE /v1/identity/me/sessions/{id}`
- new:
  - `POST /v1/identity/me/sessions/revoke-all`

Backend files:

- [identity/handlers.rs](/home/theparitt/work/rooiam/rooiam-server/src/modules/identity/handlers.rs)
- [session/repository.rs](/home/theparitt/work/rooiam/rooiam-server/src/modules/session/repository.rs)
- [session/service.rs](/home/theparitt/work/rooiam/rooiam-server/src/modules/session/service.rs)

UI files:

- add a real sessions page or card to [rooiam-admin](/home/theparitt/work/rooiam/rooiam-admin)
- remove placeholder dashboard session stats in [PlatformOverview.tsx](/home/theparitt/work/rooiam/rooiam-admin/src/pages/PlatformOverview.tsx)

Done when:

- users can see active devices and revoke them with confidence

## Ticket 10: Suspicious Login And Security Audit Events

Goal:

- make security events more useful than basic success/failure logs

Suggested events:

- `auth.login.suspicious`
- `auth.mfa.enrolled`
- `auth.mfa.challenge.failed`
- `auth.passkey.registered`
- `auth.passkey.login.success`
- `auth.sessions.revoked_all`

Backend files:

- [audit/service.rs](/home/theparitt/work/rooiam/rooiam-server/src/modules/audit/service.rs)
- [auth/handlers.rs](/home/theparitt/work/rooiam/rooiam-server/src/modules/auth/handlers.rs)
- new MFA/WebAuthn modules

Done when:

- admin audit logs show meaningful security posture events

## Ticket 11: Remove Placeholder Admin Security Data

Goal:

- stop showing fake or empty trust-damaging UI in admin

Current weak spots:

- [PlatformOverview.tsx](/home/theparitt/work/rooiam/rooiam-admin/src/pages/PlatformOverview.tsx)
- [PlatformSettings.tsx](/home/theparitt/work/rooiam/rooiam-admin/src/pages/PlatformSettings.tsx)

Implementation notes:

- replace fake “Recent Activity” with audit-backed data
- replace placeholder stats with real counts or hide the card
- replace “future release” copy where features are actually implemented

Done when:

- admin pages no longer imply features that are not real

## Suggested Build Order

1. Ticket 1: OIDC Discovery Endpoint
2. Ticket 2: JWKS Endpoint
3. Ticket 3: `userinfo` Endpoint
4. Ticket 4: Stable Issuer / Audience / Token Claims
5. Ticket 9: Session / Device Management Polish
6. Ticket 10: Suspicious Login And Security Audit Events
7. Ticket 11: Remove Placeholder Admin Security Data
8. Ticket 5: Passkey Data Model
9. Ticket 6: Passkey Registration Flow
10. Ticket 7: Passkey Login Flow
11. Ticket 8: MFA Baseline

## Phase 3 Completion Rule

Phase 3 is complete when:

- OIDC is usable from discovery through user claims
- passkeys or MFA are real, not just roadmap text
- session/device controls are visible and trustworthy
- admin security pages reflect the actual backend state
