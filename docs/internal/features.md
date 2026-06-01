# Rooiam Feature Set

This document describes the feature surface currently implemented in the repository, not the long-term vision.

## Core Identity

- **Magic Links**: Passwordless email-based sign-in with hashed token storage and single-use verification.
- **Social Login**: Google and Microsoft OAuth flows support real sign-in, provider testing, and explicit account linking.
- **Opaque Sessions**: Browser sessions use server-backed opaque cookies instead of exposing long-lived client JWT state.
- **Session Revocation**: Active sessions can be listed, individually revoked, or revoked in bulk through the identity API.
- **Linked Accounts**: A signed-in user can explicitly link or unlink Google and Microsoft on the same internal Rooiam account.

## Multi-Tenant Foundations

- **Organizations**: Users can create and belong to multiple workspaces.
- **Invitations**: Organization invite creation and acceptance flows are implemented.
- **Org Switching**: Session context can be switched between organizations.
- **RBAC Foundations**: Roles and permissions exist in the backend, and tenant admins can already switch member roles from the portal. Richer role editing and templates are still evolving.

## OAuth / OIDC

- **OAuth Login**: Provider login start and callback flows are implemented for Google and Microsoft.
- **OAuth Clients**: Backend endpoints exist for creating and listing OAuth clients.
- **OIDC Endpoints**: Discovery, JWKS, authorization, token, and `userinfo` endpoints exist for first-party client integration.

## Security

- **Passkeys**: WebAuthn passkey enrollment and email-assisted passkey login are implemented.
- **TOTP MFA**: Time-based one-time password enrollment, login challenge, and backup-code recovery are implemented.
- **Session Metadata**: Sessions capture IP, user-agent, creation time, and last-seen time.
- **Admin OAuth Guardrails**: Provider tests are kept separate from real admin sign-in, and admin OAuth can be enabled only after verification.
- **Audit Coverage**: Auth, provider-test, link/unlink, and suspicious-login events are written to audit logs.

## End-User Account Center

- **Profile Basics**: Signed-in users can view their account profile and update display name.
- **Email Change Request**: A signed-in user can request an email change, and the backend verification flow exists.
- **Linked Sign-In Methods**: The backend supports linking and unlinking Google and Microsoft to the same Rooiam account; the demo currently exposes linked-method visibility more strongly than full self-service link/unlink UX.
- **Passkey Management**: Signed-in users can add and remove their own passkeys.
- **MFA Management**: Signed-in users can enroll TOTP MFA, disable it, and regenerate backup codes.
- **Self Session Control**: Signed-in users can list their own sessions, revoke one session, or revoke all other sessions.
- **Personal Activity History**: Signed-in users can view their own audit trail for sign-ins, security actions, and account changes.
- **Recovery Surface**: Backup-code generation and recovery guidance now exist in the downstream demo, but the full “lost device / lost authenticator” account-recovery UX is still evolving.

## Media & Storage 📥

- **Pluggable Backends**: Support for both Local File System and MinIO (S3-compatible) storage.
- **Organization Assets**: Storage for workspace logos, icons, and brand assets.
- **Identity Assets**: Storage for user avatars and profile media.
- **Media Serving**: Integrated static file server with configurable public base URL.

- **Audit Logs**: Login and admin-relevant events are written to append-only audit storage and exposed in the admin API.
- **Setup Wizard**: Initial admin creation plus SMTP and OAuth configuration are available from the admin UI.
- **Operator Console**: `rooiam-admin` provides pages for dashboard, users, organizations, audit logs, clients, settings, and linked-account management.

## Tenant Portal (rooiam-app)

- **Auth UI**: Magic link, Google, Microsoft, passkey, MFA challenge — complete. Workspace-branded login using org logo, color, and display name.
- **Workspace Branding**: Workspace admins can set their org's display name, logo, and brand color for their login page.
- **Sign-in Method Toggles**: Workspace admins enable/disable magic link, Google, Microsoft, and passkey per org.
- **Workspace OAuth Clients**: Workspace admins can register downstream OAuth clients, view redirect URIs, and revoke clients from the tenant portal.
- **Workspace API Keys**: Org-scoped API keys can be created and revoked.
- **Member Management**: Workspace admins view and invite members.
- **Role Switching**: Tenant admins with the right permission can move members between the available tenant roles.
- **Workspace Activity**: Org-scoped audit log feed (not platform-wide).
- **Workspace Switching**: Users who belong to multiple orgs can switch context.

## Operator Console (rooiam-admin)

- **Complete**: Setup wizard, users, organizations, audit logs, OAuth clients, settings, linked accounts, OAuth test.
- **SMTP and OAuth config**: Global provider credentials and SMTP managed here as instance defaults.

## Demo App

- **Reference Integration**: `rooiam-demo` shows hosted login, callback, session reading, workspace context, and logout in a real downstream app.
- **Theme Reflection**: The demo reflects tenant branding and enabled login methods from Rooiam.
- **Real OIDC Demo**: The downstream demo now performs a real authorization-code + PKCE flow against Rooiam instead of faking the redirect.
- **Workspace Scenarios**: Seeded demo workspaces intentionally differ in passkey, MFA, and provider setup so the demo can show real policy differences.
- **End-User Self-Service Demo**: The downstream demo includes account, security, sessions, activity, recovery guidance, and workspace-specific “what to test next” guidance after sign-in.

## In Progress

- **Live Verification**: Some hosted-app and admin auth flows still need repeatable end-to-end verification on the current running stack.
- **Custom Auth Credentials per Workspace**: Org-scoped Google, Microsoft, and SMTP config storage exists in the backend, but the full tenant-facing management and testing experience is still being completed.
- **Credential Test Buttons**: Validate custom tenant credentials before saving.
- **Linked Provider UX for End Users**: The backend account-linking capability is real, but the downstream end-user self-service surface for link/unlink is still thinner than the rest of the security/account area.
- **Email Change Verification Landing**: The backend email-change verification flow exists, but the downstream app landing/confirmation experience is still weaker than the rest of the end-user account center.
- **Security Messaging Polish**: Suspicious activity and recovery guidance are present in audit/security data, but the user-facing explanation and escalation UX are still maturing.
- **Self-Host Packaging**: Compose packaging, env templates, and upgrade/operator docs are still missing.

## Not Yet Started

- Advanced security controls: IP allowlists, step-up MFA, enterprise policy controls.
- Rich permission-management UI with role templates and deeper permission editing.
- Full identity-graph merge and richer account recovery flows.
- Dedicated suspicious-activity / security-alert center for end users.
- Passkey rename / device naming polish.
- Ecosystem integrations with first-party apps.
- Managed hosting.
