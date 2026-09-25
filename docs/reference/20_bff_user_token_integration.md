# Integrate Rooiam with your backend (BFF)

This guide is for a website with its **own server**. Rooiam authenticates the person; your backend-for-frontend (BFF) receives the OIDC callback, creates **your application's session**, and makes any later Rooiam self-service calls for that person. If you only need server-to-server workspace administration, use a [workspace API key](./02_api_key_cookbook.md) instead.

The term **“BFF login token” is not a separate Rooiam credential**. In this flow the BFF holds the **OIDC `access_token`** returned by `POST /v1/oidc/token`. The browser holds only an opaque cookie for *your* app. CandyCloud demonstrates this pattern, but has demo-only shortcuts noted below.

```text
Browser                    Your BFF                         Rooiam
   |  sign in / callback      |                                |
   | -----------------------> | -- authorize + S256 PKCE ----> |
   |                          | <--- code at app callback ----- |
   |                          | -- code + verifier to /token -> |
   |                          | <--- access_token ------------ |
   | <--- your app cookie ---- |                                |
   | -- cookie /api/me ------> | -- Bearer access_token ------> | /v1/identity/token
   | <--- user data ---------- | <--- user data --------------- |
```

## Four credentials, four jobs

| Credential | Who owns it? | Used for | Never use it for |
| --- | --- | --- | --- |
| `rooiam_sid` | Rooiam's browser | Rooiam's own cookie-authenticated `/v1/identity/me/*` routes | Authenticating your BFF's API |
| OIDC `access_token` | Your BFF, after code exchange | `Authorization: Bearer ...` on Rooiam `/v1/identity/token/*` and `/v1/oidc/userinfo` | A browser-visible app session or workspace API key |
| Your app's opaque session cookie | Your BFF and browser | Browser → your BFF requests | Calling Rooiam directly |
| Workspace API key | Your backend operator | `/v1/orgs/integrations/*` machine operations | Acting as the signed-in person |

An `id_token` is an identity assertion for the client, **not** the Bearer token for `/v1/identity/token/*`. A phone QR approval or hosted-widget success is also **not** an application session: finish the OIDC callback first.

## Set up the app once

1. In Rooiam, register a **web/confidential OIDC client** for your app. Record its `client_id` and keep its `client_secret` on your server. Register the exact HTTPS callback, for example `https://app.example.com/callback`. If you embed `/login-widget`, also register your site's origin as an allowed embed origin. Those are separate settings.
2. Set your backend's Rooiam API base to the actual issuer's `/v1` base, for example `https://api.example.com/v1`. Do not append a second `/v1`. Prefer the issuer's discovery document (`/.well-known/openid-configuration`) for endpoint URLs where your OIDC library supports it.
3. Configure a shared server-side session store and a secure, `HttpOnly` app cookie. For a same-site web app, `SameSite=Lax` is usually appropriate; choose cross-site cookie/CORS settings based on your actual deployment. Never share your app cookie name with `rooiam_sid`.
4. Keep the `client_secret`, token store, and session store out of browser code. Use HTTPS outside localhost.

The [complete reference app](../../rooiam-examples/example-4-reference-app/README.md) is the safer starting point for callback state, S256 PKCE, one-time code handling, local user mapping, and app session creation. Use a maintained OIDC client library where practical. CandyCloud is useful for understanding the BFF proxy boundary, but its login transaction lives partly in browser storage and its `/auth/token` demo route **returns** the access token to JavaScript. Do not copy those shortcuts into a production BFF.

## Login: create your own session

1. Your backend starts a login transaction. Generate unpredictable `state` and a PKCE verifier; store them server-side with a short lifetime. Send only the S256 challenge in the authorization request. Rooiam's default policy requires S256, including confidential clients.
2. Rooiam signs in the person by an enabled method (phone, magic link, passkey, Google, or Microsoft) and returns `code` and `state` to your **registered** callback.
3. Your backend checks `state` against the pending transaction and consumes it **once**. Exchange the code from the backend. The `redirect_uri` must exactly match the authorization request and registered callback.
4. Obtain the person's subject from validated OIDC identity or Rooiam `/v1/oidc/userinfo`. Map `sub` to your own user record; do not use email as the immutable key. Apply your product's own workspace/role checks.
5. Store the access token server-side only if the app needs to call Rooiam on behalf of that person. Set an opaque app session cookie and redirect to your app. If no Rooiam API calls are needed after login, an app-owned session is enough and you need not retain the access token.

For the exact callback implementation, see [`/login` and `/callback` in Example 4](../../rooiam-examples/example-4-reference-app/app.mjs). Its in-memory stores are illustrative; replace them with durable shared storage before deploying multiple instances. If you retain a refresh token, keep it server-side, serialize refresh operations, and replace it with its successor after each refresh. Do not retry a used code or refresh token.

The code exchange is `application/x-www-form-urlencoded`, not JSON:

```js
const form = new URLSearchParams({
  grant_type: 'authorization_code',
  code,                    // from your registered callback
  redirect_uri: callbackUri,
  client_id: clientId,
  client_secret: clientSecret, // confidential web client; server only
  code_verifier: pending.verifier,
})

const response = await fetch(`${rooiamApiBase}/oidc/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: form,
})
if (!response.ok) throw new Error('Code exchange failed; start a new login')
const tokens = await response.json()
// Save tokens on the server, tied to your new opaque app session.
```

`rooiamApiBase` in this example **already ends in `/v1`**. Do not log `code`, `client_secret`, access/refresh/ID tokens, or the app session ID.

## Later: call a Rooiam user endpoint from your BFF

Here is the step developers often miss. Rooiam's `/v1/identity/me/*` routes read **Rooiam's** `rooiam_sid` cookie. Your app's cookie cannot authenticate those routes. Your BFF must load the Rooiam **access token associated with its own app session** and call the matching `/v1/identity/token/*` route.

```js
// Your session middleware has already validated the opaque app cookie and
// loaded its server-side record. Do not accept a token or Rooiam path from
// the browser for this endpoint.
app.get('/api/identity/me', requireAppSession, async (req, res) => {
  const accessToken = req.appSession.rooiamAccessToken
  if (!accessToken) return res.status(401).json({ error: 'Sign in again' })

  const upstream = await fetch(`${rooiamApiBase}/identity/token`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  res.set('Cache-Control', 'no-store')
  if (upstream.status === 401) return res.status(401).json({ error: 'Sign in again' })
  if (!upstream.ok) return res.status(502).json({ error: 'Rooiam request failed' })
  return res.json(await upstream.json())
})
```

The browser calls **your** API with its app cookie:

```js
const response = await fetch('/api/identity/me', { credentials: 'include' })
if (response.status === 401) location.assign('/login')
else if (!response.ok) throw new Error('Could not load identity')
else console.log(await response.json())
```

For a frontend and BFF on different origins, use your actual BFF URL and configure exact CORS origins plus credentialed requests. Do not use wildcard CORS with credentials. Protect mutating app endpoints against CSRF as well as authenticating the cookie.

### Route translation cheat sheet

These are **Rooiam** routes at the API origin, each with the `/v1` prefix. CandyCloud exposes similar-looking frontend routes **without** `/v1` and translates them inside [`proxy.js`](../../candycloud-server/src/routes/proxy.js).

| Task | Rooiam browser-cookie route | Rooiam BFF Bearer route |
| --- | --- | --- |
| Current identity | `GET /v1/identity/me` | `GET /v1/identity/token` |
| Update identity profile | `PATCH /v1/identity/me/profile` | `PATCH /v1/identity/token/profile` |
| Linked accounts | `GET /v1/identity/me/linked-accounts` | `GET /v1/identity/token/linked-accounts` |
| Sessions | `GET /v1/identity/me/sessions` | `GET /v1/identity/token/sessions` |
| Passkeys | `GET /v1/webauthn/passkeys` | `GET /v1/identity/token/passkeys` |
| MFA status | Rooiam's cookie-authenticated MFA route | `GET /v1/identity/token/mfa` |

Use the exact method and payload for each operation. Do **not** blindly rewrite every `/me` path or build an unrestricted user-controlled proxy. The available Bearer routes are registered together in [`identity/handlers.rs`](../../rooiam-server/src/modules/identity/handlers.rs); not every cookie route has a Bearer equivalent. Rooiam validates the access token and checks its underlying session, so an expired or revoked session can fail even when your app cookie still exists.

## Common failures

| Symptom | Check |
| --- | --- |
| Callback arrives, but your app is still signed out | Did your backend verify `state`, exchange `code` with the stored PKCE verifier, map the subject, save an app session, and set **your** cookie? Phone approval alone does none of these. |
| `401` calling `/v1/identity/me` from your BFF | That is a Rooiam-cookie route. Send the OIDC `access_token` to `/v1/identity/token` instead. |
| `401` calling `/v1/identity/token` | Check Bearer header, token expiry, and whether the underlying Rooiam session was revoked. An app cookie, `id_token`, or workspace API key is the wrong credential. |
| `invalid_grant` at `/v1/oidc/token` | Check single-use code, exact callback URI, correct client/secret, and matching S256 verifier. Start a new login after failure. |
| Browser has a cookie but the BFF sees no session | Check cookie domain, `Secure`, `SameSite`, `credentials: 'include'`, CORS, reverse-proxy HTTPS headers, and shared session storage. |
| `404` from `/identity/token/...` | Confirm the request goes to the Rooiam API (not your frontend), has one `/v1` prefix, and that the specific Bearer route exists. |
| User can read another workspace's app data | Your application must enforce its own tenant membership and business permissions. A Rooiam identity or display label alone is not authorization for your data. |

## Before calling the integration complete

- Sign in once with a normal method and once with phone sign-in; both must reach the **same** app callback/session code.
- From the browser, call your BFF `/api/identity/me`; verify that your BFF calls Rooiam `/v1/identity/token` with the stored access token.
- Try the BFF endpoint without your app cookie: it must return 401. Verify no Rooiam token appears in browser storage, responses, logs, or frontend source.
- Expire or revoke the Rooiam session; the BFF must stop using that token or refresh it under its documented policy.
- Confirm the app's local user is keyed by issuer + `sub` and that application/workspace permissions are checked independently.

The working source references are [CandyCloud's exchange/session code](../../candycloud-server/src/routes/auth.js), [CandyCloud's explicit Bearer proxy](../../candycloud-server/src/routes/proxy.js), and the [production-shaped Example 4 callback](../../rooiam-examples/example-4-reference-app/app.mjs). Keep CandyCloud's demo-only token preview and simulated MFA out of your production design.
