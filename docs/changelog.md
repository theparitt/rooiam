# Changelog

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
- `GET /v1/identity/me` — current user + workspace context
- `POST /v1/auth/magic-link/start` — send magic link
- Session management and token revocation endpoints

### Self-Hosting
- Single `docker compose up` starts everything (API, frontends, Postgres, Redis)
- No Rust toolchain required to run
- Admin panel setup wizard for first-time configuration
- Environment-based configuration (no hardcoded values)

### Developer Tools
- Demo mode with seeded tenants and fake OAuth for local testing
- Full API reference in docs
- Internal architecture and security model documentation
