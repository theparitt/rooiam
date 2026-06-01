# Rooiam Architecture

Rooiam is the self-hosted passwordless IAM for multi-tenant SaaS.

Simple meaning:

- one identity system
- many customer workspaces
- hosted login
- tenant admin
- app integration
- self-hosted control

Current product truth:

- Rooiam already has the main product surfaces in code
- it already supports passwordless login, workspace management, admin control, and OIDC
- it is still `v0.1`, so the product direction is clearer than the maturity level
- it should be described honestly as early-stage but real

## Thesis

Rooiam should be built as an identity platform for multi-tenant SaaS, not a login microservice.

The platform model is not just:

- user
- login
- session

It is:

- identity
- authentication method
- session
- organization
- membership
- role / permission
- client
- consent / grant
- audit event

If those boundaries are delayed, the system becomes expensive to evolve once multiple products rely on it.

## Product Boundary

Rooiam owns:

- user identity
- email and external login methods
- session lifecycle
- organization membership
- OAuth/OIDC clients for first-party and third-party apps
- security and admin audit trails

Downstream apps own:

- app-specific profile data
- business objects
- workflow permissions that are local to that app
- product preferences and domain logic

Short version:

- Rooiam answers: "who are you?"
- downstream apps answer: "what can you do here?"

## Current Runtime Shape

### `rooiam-server`

Rust modular monolith built with:

- `actix-web`
- `sqlx`
- PostgreSQL as source of truth
- Redis for short-lived state and future rate limiting
- Lettre + Askama for email delivery

Current modules:

- `auth`
- `identity`
- `session`
- `organization`
- `oauth`
- `oidc`
- `webauthn`
- `mfa`
- `clients`
- `admin`
- `audit`
- `setup`
- `rbac`

### `rooiam-admin`

Operator control-plane SPA — **complete**.

For the Rooiam operator (you) to manage:

- instance setup (SMTP, OAuth providers, public URLs)
- system-wide users and organizations
- global provider credentials (Google, Microsoft)
- platform-wide audit logs
- OAuth client registry (global view)

### `rooiam-app`

Tenant portal — the combined auth UI and tenant-admin surface.

**Auth UI (complete):**
- magic link entry
- social login start (Google, Microsoft)
- passkey login
- MFA challenge
- magic-link verification and post-login redirect
- tenant-branded login (logo, color, display name per org)

**Tenant admin portal (completed initial Phase 4 slice):**
- company branding management
- sign-in method toggles (magic link, Google, Microsoft, passkey on/off)
- company OAuth clients (downstream apps that use Rooiam for login)
- company member management and invitations
- company-scoped login activity

This is intentionally separate from `rooiam-admin`. Tenant admins see only their own org.

### Auth Provider Ownership

Phase 4 uses a simpler model on purpose:

1. Operator default  (system_settings table)
   — shared Google/Microsoft credentials configured in rooiam-admin
   — shared SMTP for magic links

2. Disabled
   — if the operator has not configured a method, tenant policy cannot enable it

Tenants control policy and presentation:
- whether Google is allowed for their company
- whether Microsoft is allowed for their company
- whether magic link and passkey are allowed
- how the login widget looks

Tenants do not manage raw OAuth or SMTP credentials in Phase 4. That stays platform-level.

### `candycloud-web` + `candycloud-server`

The canonical downstream app example that demonstrates how a real app integrates with Rooiam.

**`candycloud-web`** is the end-user SPA. It:
- embeds the Rooiam login widget in an iframe
- handles the OIDC callback
- calls `candycloud-server` for all session and app data

**`candycloud-server`** is the app's own backend. It:
- exchanges the OIDC code with Rooiam server-side (no browser CORS)
- creates its own `candycloud_session` cookie independent of `rooiam_sid`
- proxies all Rooiam API calls using the stored access token
- owns the app session boundary

This separation is the canonical pattern: the IAM session (`rooiam_sid`) belongs to Rooiam. The app session (`candycloud_session`) belongs to the downstream app.

See [reference/12_candycloud_app_architecture.md](reference/12_candycloud_app_architecture.md) for the full architecture and flow.

### `rooiam-landing`

Public marketing site.

### `rooiam-docs`

Standalone documentation site for:

- demo setup and walkthroughs
- development guides
- production/operator guides
- tenant-admin guidance
- integration and reference docs

## Architectural Principles

### 1. Identity Core is separate from App Core

Do not use IAM as a dumping ground for application profile data.

Rooiam should keep:

- stable internal user ID
- verified emails
- linked identities
- auth methods
- MFA methods
- session state

Applications should keep:

- display preferences specific to that app
- billing state
- business entities
- product-level authorization rules

### 2. Multi-tenant design is first-class

Rooiam is for an ecosystem, not one screen of login.

From the start, the model must support:

- one user in many organizations
- different roles in different orgs
- invite and accept flows
- org switching
- suspended membership

Authorization decisions should always be evaluated in context:

- global system context
- org membership context
- client / app context

### 3. Authentication and Authorization stay distinct

Authentication answers:

- who the principal is
- how they authenticated
- whether the session is valid

Authorization answers:

- what they are allowed to do
- in which org
- in which client / app

Rooiam should issue stable identity facts and narrow claims. It should not try to stuff every app-level permission into a token.

### 4. Sessions are stateful

Browser-facing auth should continue using opaque cookie sessions.

The current model is the correct direction:

- random session secret
- hashed secret in Postgres
- HttpOnly cookie in browser
- revocable server-side session record

For OAuth/OIDC clients, short-lived tokens are useful, but they are still a view over server-side identity and grant state, not the full source of truth.

### 5. Clients are first-class entities

Every product in the ecosystem should be modeled as a client.

That means Rooiam needs durable support for:

- `oauth_clients`
- redirect URIs
- secrets and rotation
- consent / trust model
- scopes
- authorization codes
- refresh tokens

Hardcoded callback behavior does not scale beyond one app.

### 5.1 Client And Workspace Context should travel together

Rooiam should not stop at "which user signed in?"

The next level is:

- which `client` the user is entering
- which `workspace` or organization context is intended

Current org switching already exists through `current_org_id`, but app-aware tenant context is still a gap. The design for closing that gap is tracked in [client_workspace_context.md](/docs/client_workspace_context.md).

### 6. Identity graph matters early

The same user may:

- start with email magic link
- add Google
- add Microsoft
- change primary email
- get invited through a different email

The internal user ID must remain the stable anchor. Emails and external providers are attachments to the identity, not the identity itself.

### 7. Audit is append-only infrastructure

Audit is not a late feature.

From v1, Rooiam should log:

- sign-in success and failure
- invite creation and acceptance
- role changes
- session revocation
- setup and admin actions

## Recommended Domain Layers

### Identity Core

Responsible for:

- `users`
- `user_emails`
- `external_identities` or equivalent linked-auth table
- recovery and verification state

### Session Core

Responsible for:

- browser sessions
- device metadata
- logout and revocation
- session age / risk checks
- login attempts and cooldown hooks

### WebAuthn / MFA Core

Responsible for:

- passkey enrollment
- passkey login
- TOTP enrollment
- login-time second-factor challenge handling
- future recovery and backup-code flows

### Organization Core

Responsible for:

- organizations
- memberships
- invitations
- org-scoped role bindings
- active org switching

### OAuth / OIDC Core

Responsible for:

- client registration
- redirect URI validation
- authorization codes
- token exchange
- discovery and JWKS
- first-party vs third-party trust model

### Authorization Core

Keep this modest in v1.

Rooiam needs:

- roles
- permissions
- member-role bindings

Avoid building a heavy policy engine too early. Start with explicit RBAC and expand only when product pressure is real.

### Audit / Event Core

Responsible for:

- append-only audit logs
- outbound events for future webhooks
- async fanout later through Postgres outbox or a queue

## Database Direction

The current schema direction is good, but the long-term shape should stay close to this:

- `users`
- `user_emails`
- `external_identities` or `user_auth_identities`
- `sessions`
- `login_attempts`
- `organizations`
- `organization_members`
- `organization_invites`
- `roles`
- `permissions`
- `member_roles`
- `oauth_clients`
- `oauth_client_redirect_uris`
- `oauth_client_secrets`
- `oauth_authorization_codes`
- `oauth_refresh_tokens`
- `oauth_consents`
- `audit_logs`
- `outbox_events`

Rules:

- internal UUID/ULID is the real identity key
- email is never the primary identity key
- org membership is many-to-many
- client configuration must be normalized, not hardcoded

## Current Request Flows

### Magic Link

1. Frontend sends `POST /v1/auth/magic-link/start`
2. Server creates random token and stores only its hash
3. Email contains frontend verify URL
4. Verify page posts token to `POST /v1/auth/magic-link/verify`
5. Server marks link used, resolves user identity, creates opaque session, sets cookie

### Browser Session

1. Browser receives `rooiam_sid`
2. Middleware parses `<session_id>.<raw_secret>`
3. Server fetches session row from Postgres
4. Secret hash is compared
5. Active session is injected into request context

### OAuth Login

1. Frontend redirects to `GET /v1/oauth/login`
2. Server stores OAuth state in Redis
3. Provider redirects back to callback
4. Server resolves external identity, creates session, redirects to validated target URL

### OIDC for Clients

1. Client sends user to `/v1/oidc/authorize`
2. Rooiam validates session and redirect URI
3. Server creates authorization code
4. Client exchanges code at `/v1/oidc/token`

## Folder Structure Direction

The current modular monolith is the right shape:

```text
rooiam-server/src/
  bootstrap/
  http/
  infra/
  modules/
    admin/
    audit/
    auth/
    clients/
    identity/
    oauth/
    oidc/
    organization/
    rbac/
    session/
    setup/
  shared/
```

Guideline:

- keep handlers thin
- keep service layer as workflow / policy orchestration
- keep repository layer focused on persistence
- put reusable guards, error types, and redirect validation in `shared/`

## What Not To Overbuild Yet

Do not prioritize:

- full SAML
- SCIM
- complex ABAC engine
- dozens of social providers
- enterprise branding matrix

Prioritize:

- stable identity graph
- revocable sessions
- org membership model
- first-party OAuth/OIDC support
- admin visibility
- audit quality
- self-hosting simplicity

## Build Order (Actual)

### Phase 1 — Complete

- users, email magic link, Google and Microsoft login
- opaque sessions, session revocation
- organizations and memberships, audit events

### Phase 2 — Complete

- OAuth/OIDC for first-party apps
- admin dashboard, invite flow, role bindings, client management UI

### Phase 3 — Complete

- OIDC standards (discovery, JWKS, userinfo)
- MFA (TOTP + backup codes), passkeys (WebAuthn)
- session/device metadata polish

### Phase 4 — In Progress

- `rooiam-app` tenant portal (branding, member mgmt, activity) — mostly done
- tenant OAuth clients (tenant registers their own downstream apps)
- custom auth credentials per tenant (optional Google/Microsoft/SMTP override)
- three-level auth provider inheritance (tenant → operator → disabled)

### Phase 5 — Complete

- `candycloud-web` + `candycloud-server` as the canonical downstream app example
- demonstrates login widget embedding, OIDC code exchange, and app-owned session
- validates login, session, redirect, and client/workspace context end-to-end

### Phase 6 — Planned

- Docker Compose, install guides, self-host operational docs
- upgrade and backup guides

### Phase 7 — Planned

- ecosystem SSO across your own apps (AraiHub, Jotjum, Seavanna)
- webhook / outbox delivery
- hosted cloud operational model

### Phase 8 — Later

- SAML / SCIM
- IP allowlist / blocklist, enterprise controls, compliance exports

## Final Position

Rooiam should optimize for:

- clean multi-tenant identity design
- strong self-host story
- first-party ecosystem SSO
- secure, understandable session model
- practical developer ergonomics

The moat is not login. The moat is a clean identity platform that multiple products can share without rewriting their auth model every six months.

## Downstream App Integration Pattern

The `candycloud` example shows the correct pattern for any app integrating with Rooiam:

- Rooiam owns identity: login, OIDC, `rooiam_sid`
- The downstream app owns its session: `candycloud_session`, user data, business logic
- The app backend exchanges the OIDC code server-side — never in the browser
- The app cookie is first-party on the app's own domain — no cross-origin cookie issues

This pattern scales to any app regardless of domain setup.
