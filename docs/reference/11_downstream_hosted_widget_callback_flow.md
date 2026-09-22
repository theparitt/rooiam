# Downstream hosted widget callback flow

This describes the current CandyCloud example. Its source is [candycloud-web](../../candycloud-web/README.md) and [candycloud-server](../../candycloud-server/README.md). CandyCloud demonstrates an app-owned OIDC session, with deliberate demo features described below.

## Services and sessions

| Service | Responsibility |
| --- | --- |
| `candycloud.rooiam.com` | React frontend, deployed to Cloudflare Pages |
| `candycloud-api.rooiam.com` | Express app backend, Redis sessions, SQLite app profiles |
| `demo-api.rooiam.com` | Rooiam demo IAM, hosted widget, OIDC endpoints |

Rooiam owns the `rooiam_sid` IAM cookie. CandyCloud issues its own opaque `candycloud_session` HttpOnly cookie after exchanging an authorization code. The two cookies represent different sessions. Cookie site and domain rules still apply; cross-origin frontend requests use `credentials: 'include'` and the backend allows configured frontend origins.

CandyCloud's API routes are at the backend root, **without `/v1`**. Rooiam's API routes use `/v1`.

## Login sequence

1. The frontend fetches `/demo/app-catalog` and `/demo/app-config` through CandyCloud's backend. The app config supplies registered client details, callback URL, scopes, and OIDC endpoints. It also loads branding and enabled authentication methods.
2. The frontend generates a random OIDC state and PKCE verifier/challenge and saves the pending request in browser local storage. It embeds Rooiam's `/login-widget` with workspace and client identity. The iframe URL does not choose the app callback.
3. Rooiam owns the widget login transaction, establishes the IAM session, and navigates to the registered app callback for the embedding origin.
4. When `/callback` has no authorization code yet, CandyCloud starts the OIDC authorization request using the stored state, PKCE challenge, client ID, scopes, and exact registered redirect URI. A session-storage marker prevents repeating that handoff indefinitely.
5. Rooiam returns an authorization code and state. CandyCloud verifies the state before calling its own `POST /auth/exchange` with the code, redirect URI, client ID, and PKCE verifier.
6. CandyCloud's backend calls Rooiam's `/v1/oidc/token`, then `/v1/oidc/userinfo`. It stores the resulting tokens and verified user identity in Redis and sets the app cookie.
7. The frontend stores display/session metadata in session storage and opens `/dashboard`. Normal self-service calls use the app cookie; the backend supplies the bearer token to Rooiam.

The browser accepts widget messages only from the configured iframe window and origin. Navigation messages must resolve to an HTTP(S) URL on that widget origin. The current widget's `rooiam-login-widget:size` message updates the iframe height.

## Self-service and lifetime

`GET /identity/me` on CandyCloud is forwarded to Rooiam's bearer-authenticated `GET /v1/identity/token`. Other identity and passkey routes have explicit rewrites in [proxy.js](../../candycloud-server/src/routes/proxy.js). Cookie-authenticated Rooiam routes are not interchangeable with the bearer routes.

The Redis entry and app cookie have a 24-hour maximum lifetime. CandyCloud does not refresh tokens automatically: session loading rejects an entry once `createdAt + expiresIn` is reached. Demo MFA updates cannot extend authenticated access past that deadline. The dashboard also polls the upstream identity endpoint every 30 seconds and returns to sign-in when it receives 401.

Logout calls CandyCloud's `POST /auth/logout`, deletes its Redis session, and clears its cookie. The frontend then navigates to Rooiam's `/v1/oidc/end-session` with the client ID and a post-logout destination. Rooiam validates that destination against the client's registered redirect configuration. Local logout alone does not revoke all Rooiam credentials.

## Deliberate demo boundaries

- `/auth/token` returns the access token to the signed-in browser for the dashboard's curl examples. Token responses use `Cache-Control: no-store`. This is an exception to backend token isolation, not a pattern for keeping all tokens inaccessible to JavaScript.
- CandyCloud's authenticator enrollment and recovery-code controls are simulated. They accept any six-digit code and do not enable real Rooiam MFA.
- Browser-supplied workspace/app labels are display metadata. They must not become authorization claims for application business data.
- `/me` and `/me/profile` operate on CandyCloud's SQLite profile; `/identity/me` and its profile route operate on the Rooiam identity.

For configuration and deployment, see [CandyCloud architecture](12_candycloud_app_architecture.md).
