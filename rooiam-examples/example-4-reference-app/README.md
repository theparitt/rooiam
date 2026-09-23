# Example 4: application-owned OIDC session

This is the Phase D reference relying-party application. It demonstrates the boundary a downstream SaaS should use:

```text
browser → Rooiam hosted login → registered callback
        → backend authorization-code + PKCE exchange
        → Rooiam userinfo verification
        → local user + opaque application session
```

The browser receives only `reference_app_session`, an opaque, random, `HttpOnly`, `SameSite=Lax` cookie. OAuth state, PKCE verifier, web-client secret, access token, local user mapping, CSRF token and session record stay on the example backend. The callback transaction and authorization code are single-use. A lost/ambiguous exchange starts a new login.

The sample stores transactions, users, and sessions in memory so the complete boundary fits in one small example. Restarting it signs everyone out. A real product should put these records in a durable database/Redis, use its normal session library, rotate secrets, and apply its own product/workspace authorization after identity is established.

## Configure Rooiam

Create a workspace application with type `web` and a client secret. Register these exact redirect URLs:

- redirect URI: `http://localhost:5194/callback`
- post-logout redirect URI: `http://localhost:5194/`
- allowed embed origin: `http://localhost:5194`

Enable the intended workspace login methods, including trusted-phone login when testing the 0.2 journey. Copy `.env.example` to `.env` and provide the workspace UUID, client ID, and client secret. Never put the secret in browser code or commit `.env`.

For production, use an HTTPS `APP_BASE_URL`, set `COOKIE_SECURE=true`, and register the exact HTTPS callback/logout/embed values. The application does not derive security-sensitive URLs from the request `Host` header.

## Run

```bash
cd rooiam-examples/example-4-reference-app
npm install
npm test
npm run dev
```

Open `http://localhost:5194`, choose **Sign in with Rooiam**, and complete login in the hosted widget. Phone approval is one Rooiam authentication method; after it succeeds, the same OIDC callback and application-owned session flow applies.

The tests use a fake OIDC issuer to prove state and PKCE handling, confidential-client exchange, exact identity mapping, callback concurrency/replay rejection, code-reuse failure, cookie flags, logout CSRF, and HTTPS enforcement. They do not replace the real Rooiam/phone walkthrough.

The repository runbook also includes `test/reference-app-live.mjs`. It provisions a temporary confidential client in the isolated test database and verifies the real Rooiam authorize, code exchange, userinfo, subject mapping, opaque session, and replay behavior. It removes the temporary client afterward.
