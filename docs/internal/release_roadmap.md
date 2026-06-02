# Rooiam Release Roadmap

This is the current release roadmap for Rooiam after the `0.1.0` codebase review.

The product lane is now explicit:

**Rooiam is the self-hosted passwordless IAM for multi-tenant SaaS.**

This roadmap exists to stop drift.
It is not a list of every interesting IAM feature.

## Roadmap rules

- do not compete on enterprise feature count yet
- do not broaden the audience yet
- finish the self-host + multi-tenant SaaS lane first
- favor clarity, operability, and integration speed over breadth

## Version positioning

- `v0.1` = foundation release
- `v0.2` = self-host trust + integration clarity
- `v0.3` = tenant/operator polish + first real production confidence
- `v1.0` = credible product for small and mid-size multi-tenant SaaS teams
- `v2+` = optional enterprise expansion only after market pull

### Concrete version map (the build sequence)

This is the agreed sequence that turns the positioning above into shippable work.
The OpenAPI/SDK foundation must land before the device-login lane begins.

| Version | Theme | Notes |
|---|---|---|
| `v0.2` | **OpenAPI + SDK + self-host polish** | [42_openapi_sdk_phases.md](./42_openapi_sdk_phases.md) — utoipa spec, TS SDKs, refactor consumers; plus self-host config clarity |
| `v0.3` | **Device login — server foundation** | [40_device_login_plan.md](./40_device_login_plan.md) Phases 1–4: DB, Redis challenge, `/auth/device/*` API, security model + fake-phone tester |
| `v0.4` | **Hosted widget QR login** | the "Sign in with phone" web UI + admin policy toggle |
| `v0.5` | **`rooiam-android` MVP** | QR scan + number-match approve (no push yet) |
| `v0.6` | **Trusted device management + audit/risk polish** | account-center device list, recent approvals, risk signals |
| `v0.7` | **Push notification approval** | FCM-based approve prompt |
| `v0.8` | **`rooiam-ios`** | reuse the same API; no iOS-specific server logic |
| `v1.0` | **Stable auth platform release** | the credible product milestone above |

Device login can become Rooiam's standout feature — built **server-first, then
widget, then Android**, never Android-first.

## `v0.1` — foundation release

Status:

- shipped

What it proves:

- passwordless auth core exists
- multi-tenant workspace model exists
- hosted login exists
- tenant and operator surfaces exist
- OIDC and workspace integration direction exists

What it does not prove yet:

- easy self-host adoption
- low-friction first integration
- tenant/operator polish under real usage
- market fit outside the repo owner

## `v0.2` — OpenAPI + SDK + self-host polish

Goal:

- make Rooiam easy to **integrate** (typed SDK over a generated API contract) and
  easy to **run** (clear self-host config)

This is the foundation everything later depends on — especially the device-login
lane, which needs a clean, stable API contract first.

### Track 1 — OpenAPI + SDK (the integration foundation)

Full plan: [42_openapi_sdk_phases.md](./42_openapi_sdk_phases.md).

- [x] OpenAPI foundation on the server (`utoipa`, `/openapi.json`, Swagger UI) — Phase A
- [ ] annotate the `/orgs/integrations/*` surface (~24 endpoints) — Phase B
- [ ] `@rooiam/sdk-server` (TS, generated + ergonomic wrapper, tested to 100%) — Phase C
- [ ] `@rooiam/sdk-browser` (TS, widget + OIDC login) — Phase D
- [ ] refactor candycloud / rooiam-admin / rooiam-app onto the proven SDK — Phase E

Hard rule: the SDK must be 100% stable + tested against the live server before
any working frontend is refactored onto it.

### Track 2 — self-host trust + integration clarity

- [ ] deployment doctrine clarity (see [DOCKER.md](../../DOCKER.md))
- [ ] explicit public URL and mode behavior
- [ ] operator install flow
- [ ] production setup docs
- [ ] backup / restore guidance
- [ ] upgrade guidance
- [ ] one gold-standard hosted login path
- [ ] one gold-standard OIDC app path

Success test:

- a technical team can self-host Rooiam and complete a first integration using
  the SDK + docs without reading much source code

## `v0.3` — tenant/operator polish + production confidence

Goal:

- make the product feel safe and understandable in daily use

Priority areas:

- tenant workflow polish
- operator setup polish
- session and audit visibility polish
- repeated live-flow verification
- identity lifecycle cleanup
- clearer error states and recovery paths
- stronger product wording across UI and docs

Success test:

- a small SaaS team can run Rooiam in production and explain its behavior clearly to both operators and tenant admins

## `v1.0` — credible market-fit candidate

Goal:

- be a serious option for self-hosted multi-tenant SaaS identity

Priority areas:

- stable self-host installation path
- stable upgrade story
- clear integration docs and examples
- polished hosted login and tenant controls
- clear operator/tenant boundaries
- proven passwordless auth quality

Success test:

- an outside team can evaluate Rooiam as a real auth product, not just an interesting open-source project

## What stays out of scope until after `v1.0`

- SAML
- SCIM
- multi-region architecture
- reseller / franchise topology
- broad marketplace / connector work
- heavy cloud-hosted product breadth
- deep enterprise compliance packaging
- arbitrary customization engines

These may matter later.
They should not drive the next release sequence.

## `v2+` — only after market pull

Only consider this after:

- self-host adoption is real
- at least a few real integrations exist
- the core audience is clear

Then evaluate:

- SAML
- SCIM
- custom domains
- stronger enterprise lifecycle controls
- compliance packaging

## Planned auth-method expansion (post-0.1, sequencing TBD)

These are auth-surface additions the repo owner wants on the roadmap. They are
**method/channel additions** — they extend HOW a user proves identity and HOW
apps authenticate — without leaving the multi-tenant SaaS lane.

### 1. Device login (cross-device, phone-as-authenticator)

Full design: [40_device_login_plan.md](./40_device_login_plan.md).

- Log in on a web surface by approving on a trusted phone (`rooiam-android`,
  later `rooiam-ios`).
- Three methods over one server challenge: **QR scan-approve**, **number
  matching**, **type a 6-digit code**.
- Enabled per workspace via a "Allow device login" policy toggle in rooiam-app.
- Fits the passwordless lane (it IS passwordless). Build order: server endpoints
  → rooiam-app toggle → hosted-widget UI → rooiam-android app.

### 2. Username + password login (optional, policy-gated)

- Add classic username/password as an **opt-in** auth method a workspace can
  enable, alongside magic link / passkey / OAuth / device login.
- Passwords hashed with Argon2id (same as API keys today). Account lockout,
  rate-limit, and breach-check (HIBP k-anonymity) recommended.

> ⚠️ **Strategic note:** the current positioning is "self-hosted **passwordless**
> IAM." Username/password directly contradicts that headline. Treat it as an
> **opt-in tenant choice**, off by default, never the recommended path — so the
> passwordless story stays the default while teams that *require* passwords
> (legacy migration, compliance) can still adopt Rooiam. Decide whether this
> belongs before or after `v1.0`; it widens the audience and should be a
> deliberate product call, not drift.

### 3. API / SDK login for native & multi-language apps

- A first-class **programmatic auth path** so apps in any language (mobile
  native, backend services, CLIs) authenticate against Rooiam without driving
  the hosted web widget.
- Likely shape: the existing OIDC + PKCE flow exposed cleanly, plus thin SDKs
  (start with the languages the examples use), a **device-code grant** for
  input-constrained clients, and clear token/refresh handling.
- `rooiam-android` / `rooiam-ios` are the first consumers; the same surface
  serves third-party native apps.
- This is the "login with the API" lane: one documented contract, many language
  clients. Aligns with the `v0.2` "one gold-standard integration path" goal.

## Current strategic priority

If a roadmap item does not clearly improve one of these, it should probably wait:

1. self-host trust
2. passwordless auth quality
3. multi-tenant SaaS fit
4. tenant/operator control
5. integration speed
