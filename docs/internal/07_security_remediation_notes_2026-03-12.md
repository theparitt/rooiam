# Security Remediation Notes — 2026-03-12

This note records the concrete fixes applied after a repo-wide security and data-flow review of the Rooiam codebase.

## Scope

The work focused on the highest-risk user-interaction boundaries:

- first-run bootstrap and operator setup endpoints
- magic-link and cookie session handling
- OAuth account linking and auto-provisioning
- tenant-created OIDC client credentials
- accidental secret disclosure in logs and setup APIs

## Summary of changes

### 1. First-run setup is no longer open to the network

Before this change, an uninitialized instance allowed unauthenticated callers to hit privileged `/v1/setup/*` routes. That meant a network attacker could create the first superuser, change public URLs, or probe outbound infrastructure integrations.

New behaviour:

- once setup is complete, setup routes still require the authenticated superuser
- before setup is complete, setup routes now require one of:
  - a loopback client IP, or
  - a valid `ROOIAM_SETUP_TOKEN` presented in `X-Rooiam-Setup-Token`

For browser-based remote setup, the admin SPA now forwards that token automatically when the page is opened with `?setup_token=...`.

### 2. Setup config no longer returns raw secrets

`/v1/setup/config` no longer returns plaintext SMTP passwords or Google / Microsoft OAuth client secrets. The endpoint now returns blank secret values and companion `*_configured` booleans so the UI can preserve configuration without disclosing the stored secret.

The Redis URL is also returned in redacted form via `redis_url_masked`.

### 3. Sensitive values removed from logs

Two credential leaks were closed:

- startup connection logs now redact DB / Redis passwords
- missing-SMTP warning no longer logs the raw magic-link URL

### 4. Safer cookie default

Session cookies now default to `Secure` based on the public issuer URL scheme instead of the bind host. This avoids insecure cookies on normal TLS deployments that bind the server to `0.0.0.0`.

### 5. OAuth auto-linking tightened

Rooiam previously linked provider logins to an existing local account whenever the provider-reported email matched a stored email. That was too trusting because not every returned email is necessarily verified or strongly bound.

New rule:

- auto-link by email only when the provider explicitly supplies a verified email signal

Current provider behaviour:

- Google: uses `email_verified`
- Microsoft: does not auto-link by email from `userPrincipalName`

### 6. Tenant confidential clients fixed

Tenant-created `web` OIDC clients were stored with a SHA-256 secret hash even though the token endpoint only validated Argon2 PHC hashes. Those clients are now created with Argon2id, matching the existing global client behaviour and the OIDC verifier.

### 7. Demo OAuth HTML escaped

The demo OAuth page was built with string interpolation into raw HTML. User-controlled values are now HTML-escaped before rendering.

## Remaining recommendations

- move secret-at-rest handling out of plaintext `system_settings`
- add automated regression coverage for setup access and OAuth linking

## Follow-up completed after the initial note

### 8. Trusted proxy handling is now explicit

Rooiam now resolves client IPs from the socket peer by default. Forwarded headers are only considered when the immediate peer IP matches `ROOIAM_TRUSTED_PROXY_CIDRS`.

This applies to:

- rate limiting
- session touch metadata
- OAuth state browser binding
- audit logging across auth, MFA, WebAuthn, setup, client, and workspace flows

### 9. Basic regression coverage added

Unit coverage now exists for:

- trusted-proxy and forwarded-header client IP resolution
- secure-cookie default behaviour for HTTPS vs localhost HTTP issuers
