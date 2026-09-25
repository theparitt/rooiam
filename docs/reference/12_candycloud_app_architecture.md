# CandyCloud app architecture

CandyCloud is a downstream demo app with a React frontend and an Express backend. It shows hosted login followed by an OIDC code exchange and an app-owned session. It also includes intentional demo shortcuts; it is not a complete production application authorization layer.

**Building your own backend?** Start with the [BFF user-token integration guide](./20_bff_user_token_integration.md). In particular, CandyCloud's `candycloud_session` cookie authenticates CandyCloud's own API; its backend uses the stored OIDC `access_token` as Bearer auth on Rooiam's `/v1/identity/token/*` routes. Rooiam's `/v1/identity/me/*` routes require Rooiam's own `rooiam_sid` cookie and are not interchangeable.

## Source layout

| Path | Role |
| --- | --- |
| `candycloud-web/src/App.tsx` | Login, callback, dashboard, API examples |
| `candycloud-web/src/lib/api.ts` | Cookie-authenticated CandyCloud API calls |
| `candycloud-web/src/lib/widget-message.ts` | Iframe message and navigation validation |
| `candycloud-server/src/routes/auth.js` | Code exchange, app session, token preview, logout |
| `candycloud-server/src/routes/proxy.js` | Explicit Rooiam proxy routes and simulated MFA |
| `candycloud-server/src/routes/me.js` | App-local profile routes |
| `candycloud-server/src/session.js` | Redis session storage and cookie options |
| `candycloud-server/src/db.js` | SQLite app profile storage |

`rooiam-candycloud` currently contains no tracked application code. The active projects are `candycloud-web` and `candycloud-server`.

## API boundary

CandyCloud routes do **not** have a `/v1` prefix. `VITE_API_URL` identifies the CandyCloud backend origin, while `ROOIAM_API_URL` identifies Rooiam's API base including `/v1`.

| CandyCloud route | Behavior |
| --- | --- |
| `POST /auth/exchange` | Exchange OIDC code server-side, fetch userinfo, create app session |
| `GET /auth/session` | Read current app session metadata |
| `GET /auth/token` | Return the bearer token for signed-in demo curl examples |
| `POST /auth/logout` | Delete app session and clear app cookie |
| `GET /demo/app-catalog` | Public Rooiam demo catalog proxy |
| `GET /demo/app-config` | Public app config proxy; requires app ID, origin, and one workspace selector |
| `GET /orgs/public/branding` | Public workspace branding proxy |
| `GET /setup/auth-methods` | Public workspace authentication-method proxy |
| `GET /me` | Read CandyCloud's SQLite profile and signed-in email |
| `PATCH /me/profile` | Set the app-local display name |
| `GET /identity/me` | Forward to Rooiam `/v1/identity/token` |
| `PATCH /identity/me/profile` | Forward the display name to `/v1/identity/token/profile` |
| `/identity/me/linked-accounts...` | Explicit bearer-authenticated linked-account proxies |
| `POST /identity/me/email-change/request` | Request an identity email change through Rooiam |
| `/identity/me/sessions...` | List/revoke Rooiam sessions through bearer routes |
| `GET /identity/me/audit-logs` | Forward paginated identity audit query |
| `/webauthn/passkeys...`, `/webauthn/register/...` | Rewrite to Rooiam `/v1/identity/token/passkeys...` |
| `GET /orgs/current/portal` | Forward this specific portal request; upstream permissions still apply |
| `/mfa/status`, `/mfa/totp...`, `/mfa/recovery-codes/regenerate` | Simulate MFA state and fake recovery codes within the app session |

There is no general-purpose organization proxy. Dynamic route parameters are URL-encoded before forwarding. Empty JSON objects are preserved when forwarding mutating requests. The proxy does not grant permissions: Rooiam authenticates and authorizes bearer requests independently.

## Session and data ownership

See the [callback flow](11_downstream_hosted_widget_callback_flow.md) for the login sequence.

The app session stores access/refresh/ID tokens, verified userinfo, display metadata, token lifetime, and creation time in Redis. Its cookie is HttpOnly. HTTPS deployments use Secure and SameSite=None; local HTTP uses SameSite=Lax. Ports do not change the cookie site, so localhost cross-port requests can use Lax with the appropriate CORS and credentials settings.

Redis and cookie lifetime are capped at 24 hours. Session loading also checks the access-token deadline. There is no automatic refresh implementation: users sign in again after expiry. Dashboard polling detects a 401 from the identity proxy and returns to sign-in.

The demo intentionally returns the access token from `/auth/token` for curl previews. Do not copy this endpoint into an app that promises to keep bearer tokens entirely on the backend. Auth responses are marked `no-store`.

MFA controls are simulations, clearly labeled in the frontend. They do not secure the Rooiam account, consume real TOTP challenges, or generate real recovery credentials. Real MFA is available through Rooiam's own account surfaces.

SQLite owns only CandyCloud's app-local profile. Rooiam owns the shared identity profile. Browser-provided workspace/app labels are display hints; application business authorization needs trusted membership and permission checks.

## Configuration

| Variable | Purpose | Local example |
| --- | --- | --- |
| `CANDYCLOUD_PORT` | Express listener; defaults to 4000 if unset | `5185` |
| `ROOIAM_API_URL` | Rooiam API base including `/v1` | `http://localhost:5180/v1` |
| `CANDYCLOUD_REDIS_URL` | App session store | `redis://localhost:6379` |
| `CANDYCLOUD_DB_PATH` | SQLite database file | `/data/candycloud.db` in Docker |
| `CANDYCLOUD_ALLOWED_ORIGINS` | Comma-separated permitted frontend origins | `http://localhost:5184` |
| `CANDYCLOUD_COOKIE_SECURE` | Enable Secure cookies for HTTPS | `false` locally, `true` for HTTPS |
| `CANDYCLOUD_COOKIE_DOMAIN` | Optional cookie domain | Omit for a host-only cookie |
| `VITE_API_URL` | CandyCloud backend origin, without `/v1` | `http://localhost:5185` |
| `VITE_LOGIN_WIDGET_URL` | Rooiam origin serving `/login-widget` | `http://localhost:5180` |

The frontend development proxy can alternatively use `VITE_API_URL=/api`; Vite removes `/api` before forwarding to port 5185.

Production frontend configuration uses `VITE_API_URL=https://candycloud-api.rooiam.com` and `VITE_LOGIN_WIDGET_URL=https://demo-api.rooiam.com`. Register the exact app callback and allowed embed origin in Rooiam. Do not delete OAuth clients to repair a redirect configuration mismatch.

## Running and checking

Use Node.js 22.12 or newer for the frontend toolchain. Install each project's dependencies with `npm ci`.

- Backend: configure `.env`, then run `npm run dev` in `candycloud-server`.
- Frontend: configure Vite environment values, then run `npm run dev` in `candycloud-web`.
- Backend tests: `npm test` in `candycloud-server`.
- Frontend tests/build: `npm test` and `npm run build` in `candycloud-web`.
- Backend health: `/health` checks Redis and the configured Rooiam server; it returns 503 if a dependency is unavailable.

## Deployment

Run `npm run deploy` in `candycloud-web` to build and publish the `main` production branch of the `candycloud-web` Cloudflare Pages project. It uses the pinned local Wrangler CLI and requires Cloudflare authentication.

The backend is a separate Docker deployment using [docker-compose.candycloud.yml](../../docker-compose.candycloud.yml) and [Dockerfile.candycloud](../../Dockerfile.candycloud). Cloudflare Pages publication does not update that backend. Rebuild/restart it on the actual API host with its existing environment and persistent Redis/SQLite volumes.
