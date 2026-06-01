# Phase 5 Demo App Checklist

This checklist tracks `rooiam-demo` as the smallest real downstream app that consumes Rooiam.

## Demo App Foundation

- [x] dedicated `rooiam-demo` frontend on port `5174`
- [x] alternate demo-only UI launcher for parallel demo ports:
  - `5181` admin demo
  - `5182` tenant demo
  - `5184` downstream demo
- [x] explicit env for API base and hosted login base
- [x] local assets and metadata wired correctly
- [x] strict Vite port setup
- [x] default demo seed with:
  - one platform admin record: `admin@rooiam.demo`
  - one tenant owner: `rooroo@sweetfactory.demo`
  - two tenant companies:
    - `roochoco`
    - `mintmallow`

## Real App Login Flow

- [x] landing page that starts hosted Rooiam login
- [x] workspace slug is included in the hosted login URL
- [x] app/client name is included in the hosted login URL
- [x] redirect URI returns to `rooiam-demo`
- [x] callback page polls for the session and routes into the app
- [x] signed-in dashboard loads current user and workspace context
- [x] logout returns to the demo landing page

## Validation Goals

- [x] downstream app can read the cookie-backed Rooiam session
- [x] downstream app can read current workspace context
- [x] downstream app proves callback and redirect behavior clearly
- [x] demo app can show two different tenant login widget styles:
  - `http://localhost:5174/?org=roochoco`
  - `http://localhost:5174/?org=mintmallow`
- [x] live validation against the running local stack — 2026-03-10
  - `GET /health` → `{"status":"ok","version":"v1"}`
  - `POST /setup/demo-login` → session created for `rooroo@sweetfactory.demo`
  - `GET /identity/me` → user + email confirmed
  - `GET /orgs/current/portal` → active org `roochoco`, 2 orgs, 9 permissions
  - `GET /orgs/current/api-keys`, `/clients`, `/activity`, `/members` → all 200
  - `POST /orgs/current/api-keys` → raw key `rooiam_...` returned
  - `GET /orgs/public/branding?slug=roochoco` and `mintmallow` → branding served
  - `GET /.well-known/openid-configuration` → OIDC discovery working
  - Audit log `oauth.token.issued` now carries `organization_id` (fixed 2026-03-10)
- [x] developer-facing walkthrough docs for copying the integration

## Completion Rule

Phase 5 is complete when:

- `rooiam-demo` works as a real downstream client app
- the login, callback, session, and logout flow are validated end to end
- a developer can copy the integration pattern without reading the source code first

## Follow-On Watchlist

- [ ] re-run the live validation checklist after major auth-flow changes
- [ ] validate Google login end to end through the demo app on the current local stack
- [ ] validate Microsoft login end to end through the demo app on the current local stack
- [ ] validate passkey login end to end through the demo app on the current local stack
- [ ] validate MFA challenge end to end through the demo app on the current local stack
