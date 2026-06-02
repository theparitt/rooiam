# Rooiam Product Phases

This is the current product-facing roadmap for Rooiam. It is intentionally narrower than a generic IAM backlog.

Strategic lane:

- self-hosted
- passwordless
- multi-tenant SaaS
- hosted login
- tenant/workspace control
- OIDC app integration

Release planning note:

- the version roadmap lives in [release_roadmap.md](./release_roadmap.md)
- `v1` is the active shipping scope now
- `v2` and `v3` are intentionally deferred until after `v1`

The direction is:

- win the self-hosted multi-tenant SaaS niche first
- finish self-host trust and integration clarity before enterprise breadth
- avoid chasing every enterprise protocol too early

## Phase 1: Identity Base

Status: Completed

- [x] Magic link login
- [x] Google OAuth login
- [x] Microsoft OAuth login
- [x] Opaque cookie sessions
- [x] Session revocation
- [x] Current-user identity API
- [x] Organization creation and membership model
- [x] Organization invites and acceptance
- [x] Org switching
- [x] Audit log foundations

Exit criteria:

- a user can sign in without passwords
- a user can belong to multiple organizations
- sessions are server-controlled and revocable
- auth-critical events are stored in audit logs

## Phase 2: Client Ecosystem

Status: Completed

- [x] OAuth client registry backend
- [x] OAuth client creation UI
- [x] Redirect URI storage and validation
- [x] OIDC authorization-code flow
- [x] Token exchange endpoint
- [ ] Refresh token issuance
- [x] Redis-backed rate limiting
- [x] Identity linking across magic-link and external providers by verified email match

Exit criteria:

- Rooiam can act as the shared identity layer for first-party apps
- developers can create OAuth clients from the admin UI
- login and token flows are rate-limited
- users do not get duplicate accounts when social login matches an existing verified email

## Phase 3: Standards + Security

Status: Completed

Detailed implementation tickets: [phase3_implementation.md](/docs/internal/phase3_implementation.md)

- [x] OIDC discovery endpoint
- [x] JWKS endpoint
- [x] `userinfo` endpoint
- [x] stable issuer / audience / base URL configuration
- [x] stable token claims for access token and ID token
- [x] passkey registration
- [x] passkey login
- [x] MFA baseline for TOTP or equivalent second factor
- [x] MFA enrollment and recovery flow
- [x] device/session list polish in admin and identity UI
- [x] revoke-all-sessions flow
- [x] suspicious-login audit events
- [x] better session metadata capture: IP, user-agent, last seen, created at
- [x] remove placeholder security and dashboard data in admin

Exit criteria:

- OIDC clients can integrate without custom wiring
- the security story is credible for production startup use
- admin surfaces reflect real data instead of placeholders
- Rooiam can explain its security model clearly to a technical buyer

Post-phase watchlist:

- keep a short runtime validation watchlist in [phase3_readiness.md](./phase3_readiness.md)
- continue improving hosted-app clarity as tenant-facing flows evolve

## Phase 4: Tenant Portal (rooiam-app)

Status: Completed

Design reference: [tenant_admin_model.md](/docs/internal/tenant_admin_model.md)
UI plan: [tenant_ui_plan.md](/docs/internal/tenant_ui_plan.md)
Implementation tickets: [phase4_implementation.md](/docs/internal/phase4_implementation.md)

Context: `rooiam-admin` is the operator console. `rooiam-app` is the tenant-facing portal where organizations manage their own identity experience.

### Completed
- [x] `rooiam-admin` defined and complete as the operator console
- [x] `rooiam-app` defined as tenant auth and tenant-admin surface
- [x] tenant portal shell with sidebar navigation
- [x] workspace switching
- [x] workspace branding editor (logo, color, display name)
- [x] workspace sign-in method toggles (magic link, Google, Microsoft, passkey)
- [x] workspace member visibility
- [x] workspace invite flow
- [x] workspace-scoped activity (org-scoped audit logs)
- [x] workspace OAuth clients
- [x] workspace API keys
- [x] workspace role switching
- [x] workspace MFA requirement policy
- [x] tenant context propagation through auth flows
- [x] tenant/workspace policy uses instance defaults for provider credentials and email infrastructure

### Follow-On Additions
- [ ] workspace login activity broken down by downstream client/app
- [ ] workspace-managed custom provider credentials UI
- [ ] workspace-managed custom SMTP UI
- [ ] workspace auth email branding slots with preview and send-test flow
- [ ] tenant credential test buttons
- [ ] richer workspace role catalog and permission editor
- [ ] repeated tenant isolation regression checks against the live stack

Constraint note:

- tenant auth email customization should stay slot-based and safe
- do not allow raw HTML, arbitrary CSS, arbitrary links, or remote tracking images in auth email

Exit criteria:

- Rooiam supports multiple organizations with different login branding and policies
- tenant admins manage only their own workspace identity settings and sign-in experience
- tenants can create and manage their own OAuth clients (downstream apps)
- operator-level admin remains fully separate from tenant-level admin
- shared instance OAuth/SMTP credentials power tenant login by default

## Phase 5: Demo App Validation

Status: Completed

Checklist: [phase5_demo_checklist.md](./phase5_demo_checklist.md)

- [x] build `rooiam-demo` as the smallest public example app
- [x] show real Rooiam login in an app
- [x] validate client + workspace context through a real app flow in [client_workspace_context.md](/docs/client_workspace_context.md)
- [x] show real session handling after sign-in
- [x] show redirect and callback logic clearly
- [x] document the example app flow so other developers can copy it
- [x] validate the live end-to-end flow against the running local stack

Post-phase watchlist:

- keep re-running the live local-stack validation when hosted auth flows change
- keep the demo aligned with tenant branding, method toggles, and workspace context behavior

Exit criteria:

- a developer can see exactly how a real app should integrate with Rooiam
- the login, session, and redirect model is validated in a non-admin app
- `rooiam-demo` becomes the smallest public reference implementation

## Phase 6: Self-Host Adoption

Status: Planned

Checklist: [phase6_self_host_checklist.md](./phase6_self_host_checklist.md)

- [x] source-based local install guide
- [x] local development and production env guidance in the README
- [ ] Docker Compose setup
- [ ] production-ready `docker-compose.yml`
- [ ] example `.env` templates for local and production use
- [ ] install guide from a fresh machine
- [ ] migration / upgrade guide
- [ ] backup / restore notes for Postgres and Redis
- [ ] reverse-proxy deployment examples
- [ ] TLS / domain setup example
- [ ] self-host troubleshooting guide
- [ ] one-click setup polish in admin
- [ ] health-check and readiness guidance
- [ ] integration examples for AraiHub, Jotjum, Seavanna, or similar first-party apps
- [ ] versioned release notes for self-host operators

Exit criteria:

- a small team can self-host Rooiam without reading the source code first
- upgrades are documented and predictable
- the first install path feels intentional, not improvised
- your own ecosystem apps demonstrate the product clearly

## Phase 7: First External Integration Win

Status: In progress (OpenAPI + SDK foundation started 2026-06-02)

The technical foundation for fast integration is the **OpenAPI + SDK** track —
a `utoipa`-generated spec the server emits at `/openapi.json`, plus typed TS
SDKs (`@rooiam/sdk-server`, `@rooiam/sdk-browser`) generated from it. Full
execution plan and current status: [42_openapi_sdk_phases.md](./42_openapi_sdk_phases.md).
Design rationale: [41_sdk_plan.md](./41_sdk_plan.md).

- [x] OpenAPI foundation on the server (`utoipa`, `/openapi.json`, Swagger UI) — Phase A done
- [ ] annotate the `/orgs/integrations/*` surface — Phase B
- [ ] `@rooiam/sdk-server` (typed, generated, tested to 100%) — Phase C
- [ ] `@rooiam/sdk-browser` (widget + OIDC) — Phase D
- [ ] refactor candycloud / rooiam-admin / rooiam-app onto the proven SDK — Phase E
- [ ] use `rooiam-demo` as the smallest public reference app for how Rooiam login works in a real product
- [ ] tighten one best-practice hosted-login integration path
- [ ] tighten one best-practice OIDC client integration path
- [ ] publish one “integrate in 1–2 days” guide for a real multi-tenant SaaS app
- [ ] remove naming and redirect confusion from the developer path
- [ ] add one small external proof integration instead of many internal app promises
- [ ] collect setup and integration friction from real users
- [ ] improve examples, snippets, and troubleshooting from that feedback

Exit criteria:

- an outside developer can see exactly how Rooiam should be integrated into a real multi-tenant SaaS app
- first integration friction is low enough that Rooiam can be fairly evaluated by an external team
- examples and docs match the real integration path instead of a future platform vision

## Phase 8: Tenant And Operator Polish

Status: Next

- [ ] finish live verification of hosted-app auth flows
- [ ] email change flow
- [ ] identity merge flow
- [ ] recovery flow and account rescue rules
- [ ] provider unlink safety rules
- [ ] richer session/device visibility in tenant-facing surfaces
- [ ] richer permission-management UX
- [ ] tenant workflow polish for members, invites, apps, and audit views
- [ ] operator workflow polish for setup, production config, and troubleshooting

Exit criteria:

- auth lifecycle gaps are closed for long-lived production identities
- the repo status docs stop depending on “implemented but not yet exercised” ambiguity
- tenant and admin security behavior is easy to verify end to end

## Phase 9: Market-Proof Release Candidate

Status: Later

- [ ] package the strongest self-host path as the default evaluation path
- [ ] package the strongest hosted production guide as the default real deployment path
- [ ] make landing, docs, and product copy all point to the same target customer
- [ ] make setup, integration, and tenant control feel coherent enough for outside evaluation
- [ ] gather real usage feedback from at least a small number of external teams

Exit criteria:

- Rooiam is credible as a real product for self-hosted multi-tenant SaaS
- outside teams can understand who it is for and why they should choose it
- the next roadmap step is based on market pull, not internal imagination

## Phase 10: Enterprise Expansion

Status: Much Later

- [ ] SAML
- [ ] SCIM
- [ ] custom domains
- [ ] stronger compliance packaging
- [ ] advanced enterprise lifecycle controls

Exit criteria:

- enterprise features arrive only after the self-hosted multi-tenant SaaS lane has real proof

- [ ] SAML
- [ ] SCIM
- [ ] IP allowlist controls for admin and sensitive surfaces
- [ ] IP blocklist controls for abuse and incident response
- [ ] advanced organization policies
- [ ] compliance exports
- [ ] audit export tooling
- [ ] stronger tenant admin delegation
- [ ] enterprise branding controls

Exit criteria:

- enterprise features are added because real customers need them
- the core product stays simple for self-hosted startup teams

## Do Not Prioritize Early

- [ ] dozens of social providers
- [ ] complex ABAC policy engine
- [ ] giant enterprise admin matrix
- [ ] custom branding system before self-host polish
- [ ] SAML / SCIM before OIDC basics and MFA are finished

Supported provider scope for now:

- [x] Google
- [x] Microsoft
- [ ] Additional providers deferred until there is clear demand after Phase 4

## Recommended Working Order

1. Keep Phase 5 validated as hosted auth flows change.
2. Make Phase 6 excellent.
3. Use your own apps to validate Phase 7.
4. Close Phase 8 hardening gaps.
5. Only then expand into Phase 9.
