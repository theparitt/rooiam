# Phase 3 Readiness

This document is the runtime validation checklist for `Phase 3: Standards + Security`.

Phase 3 is already implemented in code. This checklist tracks what has been manually verified in a running Rooiam instance and what still needs end-to-end signoff before calling the phase fully closed.

## Scope

Phase 3 covers:

- OIDC basics: discovery, JWKS, `userinfo`, stable issuer/audience
- stronger authentication: passkeys, TOTP MFA, backup codes
- session/device visibility and revocation
- admin security surfaces without placeholder data
- provider login support scoped to:
  - Google
  - Microsoft

Explicitly deferred:

- GitHub
- Discord
- LINE
- SAML / SCIM
- enterprise policy engine work

## Implemented In Code

- [x] OIDC discovery endpoint
- [x] JWKS endpoint
- [x] `userinfo` endpoint
- [x] stable issuer/base URL configuration
- [x] stable token claims
- [x] passkey registration
- [x] passkey login
- [x] TOTP MFA enrollment
- [x] backup-code recovery
- [x] session/device listing
- [x] revoke-all-sessions flow
- [x] suspicious-login audit events
- [x] admin OAuth provider verification state
- [x] explicit linked-accounts flow for Google and Microsoft

## Admin Flows Manually Verified

- [x] magic-link login reaches the dashboard
- [x] logout clears session and returns to login
- [x] expired magic link shows a clear error
- [x] reused magic link is rejected
- [x] setup wizard reopens with saved values prefilled
- [x] SMTP test succeeds from the admin setup/settings flow
- [x] real email delivery works for magic-link send
- [x] Google provider test loop works from `Settings > OAuth`
- [x] Microsoft provider test loop works from `Settings > OAuth`
- [x] Google admin login works when enabled and linked to the superuser account

## Admin Flows Still Requiring Live Verification

- [ ] Microsoft admin login after explicit linking onto the same internal superuser account
- [ ] passkey enrollment and admin login on the current live instance
- [ ] TOTP MFA enrollment and admin login challenge on the current live instance
- [ ] backup-code login challenge on the current live instance
- [ ] revoke-other-sessions flow on the current live instance
- [ ] auth-event visibility in audit logs after real passkey/MFA/admin OAuth usage

## Hosted App Flows Still Requiring Live Verification

- [ ] app magic-link send and verify loop
- [ ] app Google login end to end
- [ ] app Microsoft login end to end
- [ ] app passkey login end to end
- [ ] app MFA challenge end to end
- [ ] app logout and session re-entry flow

## Release Notes For Phase 3

- Admin and hosted app login are now split intentionally:
  - admin magic-link verification happens in `rooiam-admin`
  - hosted end-user/client login stays in `rooiam-app`
- Provider setup testing is intentionally separate from real login:
  - `Settings > OAuth` test buttons validate configuration only
  - they do not replace the current admin session
  - they do not link accounts automatically
- Provider linking is explicit:
  - `Settings > Linked Accounts` is where Google/Microsoft are attached to the current identity
  - linking and unlinking are separate from provider tests
- Passkey failure visibility has a practical browser boundary:
  - server-side WebAuthn failures are written to audit logs
  - Rooiam also attempts to record browser-reported passkey failures from the login UI
  - but some device-local failures or cancellations can still occur entirely inside the browser or OS prompt and may not be fully observable from the server
  - this is a platform limitation, not a Rooiam-only limitation

## Phase 3 Completion Rule

Phase 3 can be called complete when:

- all items under `Admin Flows Still Requiring Live Verification` are checked
- all items under `Hosted App Flows Still Requiring Live Verification` are checked
- no Phase 3 auth flow requires placeholder UI, workaround routing, or silent fallback configuration

## Next Phase

After Phase 3, move to `Phase 4: Tenant Branding And Tenant Admin`:

- separate operator admin from tenant admin more explicitly
- make `rooiam-app` the tenant-facing auth and tenant-admin surface
- add tenant/company branding and auth policy
- document the model in [tenant_admin_model.md](/home/theparitt/work/rooiam/docs/tenant_admin_model.md)
