# Rooiam SDK — Design & Plan

Status: **PLAN** (the `rooiam-sdk/` folder is currently an empty placeholder).
Date: 2026-06-02.

The goal: downstream apps (like `candycloud`) should integrate with Rooiam
through a typed **SDK layer**, not hand-rolled `fetch` calls. Today
`candycloud-server/src/rooiam.js` and `candycloud-web/src/lib/*` hand-code the
OIDC exchange, userinfo, and widget config — that logic should live in an SDK
once and be reused.

---

## Core principle: TWO packages, not one

There are two completely different consumers with different auth and different
trust boundaries. They MUST be separate packages so the server's API-key code
can never ship to a browser.

| Package | Audience | Auth | Where it runs |
|---|---|---|---|
| **`@rooiam/sdk-browser`** | downstream **frontends** (candycloud-web, any web app) | end-user **session / OIDC** (no secrets) | the browser |
| **`@rooiam/sdk-server`** | downstream **backends** (candycloud-server, any service) | **workspace API key** (secret) | the server only |

> 🔴 **Security rule:** the API key for `sdk-server` must NEVER reach the browser.
> Keeping them as two packages makes it physically impossible to import the
> admin/API-key client into a frontend bundle. This is the whole reason for the
> split.

`rooiam-app` (tenant portal) remains the **control plane** — it sets branding,
widget config, and auth policy. The SDKs are **consumers** of that: they read
tenant config and drive login; they do not control tenant settings.

---

## Package 1 — `@rooiam/sdk-browser` (end-user, frontend)

Wraps everything a downstream **frontend** needs to log a user in and read their
own session. Replaces `candycloud-web/src/lib/config.ts` + `api.ts` + the
hand-coded widget/login logic.

What it does:

- **Mount the hosted login widget** (iframe) with the right `workspace_id` /
  `client_id`, handle its postMessage events (resize, navigate, ready).
- **Start OIDC login** (redirect to `/v1/oidc/authorize` with PKCE) and handle
  the callback.
- **Read the current user** (`/v1/identity/me` or userinfo) for the signed-in
  end user.
- **Logout**.
- **Read public tenant branding / auth methods** (`/v1/orgs/public/branding`,
  `/v1/setup/auth-methods`, `/v1/setup/login-bootstrap`) so the app can render a
  branded login entry.

Shape (illustrative):

```ts
import { RooiamBrowser } from '@rooiam/sdk-browser'

const rooiam = new RooiamBrowser({
  apiBase: 'https://demo-api.rooiam.com/v1',
  widgetBase: 'https://demo-api.rooiam.com',   // serves /login-widget
  workspaceId: '...',
  clientId: '...',
})

rooiam.mountLoginWidget('#login')        // embeds the iframe, handles messages
await rooiam.startLogin()                // OIDC + PKCE redirect
const user = await rooiam.getUser()      // current end-user
await rooiam.logout()
```

Constraints:
- No secrets. Ever. Browser-safe only.
- Follows the widget redirect contract: routing/redirect resolved server-side,
  client supplies `workspace_id` + `client_id` only. See
  [[project_rooiam_widget_redirect_contract]].

---

## Package 2 — `@rooiam/sdk-server` (admin / integration, backend)

Wraps the **workspace integration API** (`/v1/orgs/integrations/*`), which is
already implemented on the server and gated by a **workspace API key**. This is
the "fetch tenant-admin view: logs, sessions, members" layer.

The server already exposes these (24 endpoints) — the SDK just types and wraps
them:

```
workspace, branding, auth-config, effective-policy, policy-summary, roles,
permissions, audit/actions, widget-preview-config, api-keys/me
members[, /{id}[ /activity | /sessions | /role | /profile ]]
clients[, /{id}[ /status | /rotate-secret | /secret-metadata ]]
invites[, /{id}]
activity                      ← workspace audit log
```

Shape (illustrative):

```ts
import { RooiamServer } from '@rooiam/sdk-server'

const rooiam = new RooiamServer({
  apiBase: 'https://demo-api.rooiam.com/v1',
  apiKey: process.env.ROOIAM_WORKSPACE_API_KEY,   // SECRET — server only
})

const members  = await rooiam.members.list({ page: 1, page_size: 50 })
const activity = await rooiam.activity.list({ action: 'auth.login.suspicious' })
const sessions = await rooiam.members.sessions(memberId)
const clients  = await rooiam.clients.list()
```

It also covers the **OIDC server-side bits** candycloud-server hand-rolls today
(these use the OIDC client, not the API key, but belong in the server SDK):

```ts
const tokens = await rooiam.oidc.exchangeCode({ code, redirectUri, clientId, codeVerifier })
const info   = await rooiam.oidc.userinfo(tokens.access_token)
```

Constraints:
- Server-only. The `apiKey` is a secret.
- Strict request shapes matching the server DTOs (`deny_unknown_fields`,
  `page_size` ≤ 1000, etc. — see the validation matrix). The SDK should send
  ONLY the params each endpoint accepts (this is exactly the class of bug we hit
  before — the SDK prevents it by construction).

---

## What this replaces in candycloud (the proof it's the right layer)

| Hand-rolled today | Becomes |
|---|---|
| `candycloud-server/src/rooiam.js` `exchangeCode` / `fetchUserinfo` / `proxyToRooiam` | `@rooiam/sdk-server` `rooiam.oidc.*` + typed integration calls |
| `candycloud-web/src/lib/config.ts` + `api.ts` (manual fetch, env wiring) | `@rooiam/sdk-browser` |
| manual `fetch('/orgs/public/branding?...')` in `candycloud-web/src/App.tsx` | `rooiam.getBranding()` (browser SDK) |

If the SDKs can fully replace candycloud's hand-coded integration, they're the
right abstraction.

---

## Repo layout — monorepo, organized by language

Decision: **one monorepo (`rooiam-sdk/`), packages organized by language.** The
browser-vs-server split ONLY exists for JS/TS (the only language that runs in a
browser) — every other language is inherently server/native, so it's a single
package.

```
rooiam-sdk/
  packages/
    js-browser/     @rooiam/sdk-browser     (npm)    — frontend: OIDC + widget, NO secrets
    js-server/      @rooiam/sdk-server      (npm)    — backend: API key, /orgs/integrations/*
    python/         rooiam-sdk              (PyPI)   — server-side    (later)
    go/             .../rooiam-go                    — server-side    (later)
    rust/           rooiam-sdk              (crates) — server-side    (later)
    kotlin/         (auth client for rooiam-android) — native         (later)
    swift/          (auth client for rooiam-ios)     — native         (later)
  spec/
    openapi.yaml    — the API contract (added when generation starts; see below)
  README.md
```

Why monorepo (not separate `rooiam-sdk-python/` sibling folders): one place to
version, one spec, one CI. For a solo project, N separate repos = N release
pipelines to maintain. The monorepo costs nothing extra now and avoids a painful
migration when the 2nd language is added.

**Only JS splits into two packages** (browser + server) — because it's the only
language where the API-key-in-browser danger is real.

## Generation strategy: hand-write TS now, OpenAPI at the 2nd language

| | Hand-written | OpenAPI-generated |
|---|---|---|
| Time to first SDK | ✅ fast | ❌ must author full openapi.yaml first (server has none today) |
| Ergonomics | ✅ full control | ⚠️ generated code is verbose; needs a wrapper anyway |
| Drift from server | ❌ manual sync per SDK | ✅ regenerate from spec |
| Multi-language cost | ❌ scales badly (rewrite per lang) | ✅ scales great (one spec → many clients) |
| Solo-dev maintenance | ❌ high once 2+ languages | ✅ low |

**Decision:**
**Decision (updated): go the OpenAPI route, generating the spec FROM the Rust
code with `utoipa` — not hand-writing the YAML.**

### Why generate from code (utoipa), not hand-write the spec

The server is hand-coded Actix-web 4 with no OpenAPI tooling today. Two options:

- ❌ **Hand-write `openapi.yaml`** — ~80 endpoints by hand, and it DRIFTS: every
  server change must be manually mirrored in the YAML. For a solo dev who also
  maintains the server, it will rot.
- ✅ **`utoipa`** (the OpenAPI crate for Rust/Actix) — annotate handlers with
  `#[utoipa::path(...)]` and add `#[derive(ToSchema)]` to request/response DTOs
  (which already have serde derives, so it's a small addition). The server then
  EMITS `/openapi.json`, generated from the real code, so it **cannot drift**.
  Bonus: a Swagger UI docs page for free.

### The pipeline

```
Rust handlers + DTOs  ──(utoipa annotations)──▶  rooiam-server serves /openapi.json
                                                          │ openapi-generator
                                                          ▼
                          generated SDKs: python / go / rust / kotlin / ...
                          + Swagger UI docs    + Postman import
```

TS: hand-write the ergonomic wrapper (or generate then wrap) so the TS API stays
clean; the other languages can be largely generated.

### Sequencing (utoipa is ~80 endpoints of annotation — do it incrementally)

Adding `utoipa` to 80 existing endpoints is mechanical but real work. Do NOT do
all at once:

1. **Annotate `/orgs/integrations/*` first** (~24 endpoints — the ones the server
   SDK needs). Server emits `/openapi.json` for those.
2. **Generate the first SDKs** from that partial spec; build the TS server SDK +
   refactor candycloud-server onto it.
3. **Annotate the OIDC + auth/login endpoints** next (needed for browser SDK +
   Android login).
4. **Annotate the rest** over time until the whole API is in the spec.

So: hand-writing is NOT used at all — `utoipa` generates the spec from day one,
starting with the integration endpoints.

The server is the single source of truth; the OpenAPI spec is generated from it;
every language SDK is generated/derived from that spec.

---

## Android / device-login tie-in

`rooiam-android` is just another consumer of the same login contract:
- It uses the **OIDC + PKCE (+ device-code grant)** login path — the same one
  `sdk-server` formalizes — to sign in.
- Once signed in, it acts as the **trusted authenticator** for device login
  (see [40_device_login_plan.md](./40_device_login_plan.md)).

So the SDK work and the device-login work share one foundation: a clean,
documented, language-agnostic auth + integration API.

---

## Build order (locked)

**Hard rule: the SDK must be 100% stable and thoroughly tested against the real
server BEFORE any existing frontend is refactored onto it.** Never move a working
app (rooiam-admin, rooiam-app) onto an unproven SDK.

1. **`utoipa` on the server** → emit `/openapi.json`. Start with
   `/orgs/integrations/*` (~24), then OIDC/auth, then the rest. Incremental.
2. **Generate `@rooiam/sdk-server`** (TS) from the spec; hand-write ergonomic
   wrappers on top.
3. **Stabilize + TEST the SDK to 100%** — every method exercised against a live
   rooiam-server, all green. The SDK is "done" only when its test suite proves
   each endpoint round-trips correctly.
4. **`@rooiam/sdk-browser`** — widget + OIDC login; same stabilize-and-test bar.
5. **THEN refactor consumers** onto the proven SDK, one at a time, each verified:
   - candycloud-server / candycloud-web (first — they already hand-roll it)
   - rooiam-admin (replace its hand-rolled `api.ts`)
   - rooiam-app (replace its hand-rolled fetch calls)
6. **Other-language SDKs** (generated from the same spec) + the mobile login
   client (feeds the API-login and Android roadmap items).

### Why refactoring rooiam-admin / rooiam-app onto the SDK is worth it

Their current hand-rolled fetch calls are exactly where the
client/server-contract bugs came from (oversized `page_size`, unknown JSON
fields rejected by `deny_unknown_fields`, wrong redirect params). A typed SDK
generated from the server's own OpenAPI contract makes those bugs
**impossible by construction** — the types ARE the server's contract. That is
the payoff. But it only holds if the SDK is proven first.

> Packaging: **two separate TS packages** (`@rooiam/sdk-browser` and
> `@rooiam/sdk-server`), per the user's choice — not one package with two entry
> points. The browser package never contains API-key code.
