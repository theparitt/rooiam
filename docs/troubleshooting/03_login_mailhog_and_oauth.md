# Login, Mailhog, And OAuth Problems

Use this page when the apps load but login does not behave correctly.

## Problem: Magic link email never arrives

Check Mailhog first:

```bash
curl -I http://localhost:8025
```

Then check demo SMTP values:

```bash
rg '^ROOIAM_DEMO_SMTP_' rooiam-server/.env
```

For demo mode, expected values are:

```text
ROOIAM_DEMO_SMTP_HOST=127.0.0.1
ROOIAM_DEMO_SMTP_PORT=1025
ROOIAM_DEMO_SMTP_FROM=demo@rooiam.local
```

Restart the server after changing `.env`.

## Problem: Magic link verifies, but the browser goes back to login

Typical symptoms:

- `GET /v1/auth/magic-link/verify?token=...` returns `302`
- the response sets `Set-Cookie: rooiam_sid=...`
- the browser lands on `admin.rooiam.com` or `app.rooiam.com`
- `GET /v1/identity/me` then returns `401`
- the login page keeps polling and never reaches the dashboard

How to diagnose it:

1. Open DevTools Network and enable `Preserve log`.
2. Click the magic link in the same browser profile where the app is open.
3. Inspect the `GET /v1/auth/magic-link/verify?...` response.
4. Confirm that it contains:

```text
302 Found
Set-Cookie: rooiam_sid=...
Location: https://admin.rooiam.com/   # or app.rooiam.com
```

5. Then inspect the next `GET /v1/identity/me` request.
6. If the request sends multiple `rooiam_sid` cookies, or keeps sending an old one, the browser session is corrupted by stale cookies.

Example of the bad pattern:

```text
Cookie:
rooiam_sid=old-session-1
rooiam_sid=old-session-2
```

Root cause:

- old `rooiam_sid` cookies are still stored for `rooiam.com` and/or its subdomains
- the magic-link verify step sets a fresh cookie correctly
- the browser then sends multiple session cookies, and `/v1/identity/me` resolves to a stale or invalid session

Fix:

1. Delete all `rooiam_sid` cookies for:
   - `rooiam.com`
   - `api.rooiam.com`
   - `admin.rooiam.com`
   - `app.rooiam.com`
2. Close the affected tabs.
3. Open `admin.rooiam.com` or `app.rooiam.com` again.
4. Request a fresh magic link.
5. Open the new link in the same browser profile.

Important:

- avoid opening the magic link in an email-app webview or a different browser profile
- this problem is not a redirect bug if `verify` already returns `302` and `Set-Cookie`
- it is a cookie-collision problem in the browser

## Problem: Login widget loads but is very slow

First check the health endpoint:

```bash
curl http://localhost:5170/health
```

Then restart the server once after backend changes:

```bash
cd rooiam-server
SQLX_OFFLINE=true cargo run
```

The login widget now uses `/v1/setup/login-bootstrap`, so an old server process can make it fall back to the slower path.

## Problem: OAuth callback mismatch

Check that the provider callback URL exactly matches Rooiam.

For local development:

- Google: `http://localhost:5170/api/v1/auth/google/callback`
- Microsoft: `http://localhost:5170/api/v1/auth/microsoft/callback`

Also check:

- `ROOIAM_SERVER_URL`
- `ROOIAM_APP_URL`
- `ROOIAM_ADMIN_URL`

## Problem: Wrong demo email is being used on the wrong app

Use this rule:

- `admin@rooiam.demo` only on `rooiam-admin`
- `rooroo@sweetfactory.demo` on `rooiam-app`
- `minmin@lovechocolate.user` and `lulu@softmallow.user` on `candycloud-web`
