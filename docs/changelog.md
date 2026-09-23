# Changelog

## Current checkout — September 2026 (package version 0.1.0)

The package version remains `0.1.0`; these changes do not imply a new release tag.

- Refresh-token rotation serializes the token family and revokes that family on reuse.
- Browser/server TypeScript SDKs and OpenAPI snapshots are available; widget URL generation uses the shared SDK builder.
- Trusted-device login includes Apple App Attest and Google Play Integrity verification paths.
- Default workspace-count limit is five.
- Documentation now distinguishes the API/infrastructure Compose stacks from separately run frontends and includes fresh-clone env examples.

## v0.1.0 — March 2026

Initial public release of Rooiam.

### Auth & Login
- Magic link login via email
- Google and Microsoft OAuth (social login)
- TOTP MFA (authenticator app, e.g. Authy / Google Authenticator)
- WebAuthn passkeys (hardware key / biometric)
- Opaque session cookies with server-side revocation

### Multi-Tenant Workspaces
- Create and manage workspaces (orgs) with branding
- Invite members with role-based access (owner / admin / member)
- Per-workspace IP allowlist and auth method policy
- Workspace-scoped audit logs and security alert view

### OIDC Provider
- Authorization code flow with PKCE
- JWKS endpoint for token verification
- Client credentials management in admin panel
- Per-client redirect URI and scope configuration

### Identity API
- `GET /v1/identity/me` — current user profile using the Rooiam session cookie
- `GET /v1/identity/token` — bearer-authenticated current identity for downstream applications
- `POST /v1/auth/magic-link/start` — send magic link
- Session management and token revocation endpoints

### Self-Hosting
- Docker API/infrastructure stacks; frontends are deployed separately
- No host Rust toolchain required to run an image or build the production container
- Admin panel setup wizard for first-time configuration
- Environment-based configuration (no hardcoded values)

### Developer Tools
- Demo mode with seeded tenants and fake OAuth for local testing
- Full API reference in docs
- Internal architecture and security model documentation
