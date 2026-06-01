# Demo Mode

Demo mode allows Rooiam to run as a fully interactive product demonstration without real email addresses, real OAuth provider credentials, or real user accounts. It is designed for local development, product walkthroughs, and sandbox environments.

---

## Enabling Demo Mode

Set these environment variables before starting the server:

```bash
ROOIAM_MODE=demo
ROOIAM_DEPLOY_TARGET=local
```

`ROOIAM_MODE=demo` activates demo seed, demo routes, and demo rate limits.

> **Legacy note:** `ROOIAM_ENABLE_DEMO_SEED=true` is still supported as a backwards-compatible alias for `ROOIAM_MODE=demo`.

Demo mode is checked at runtime via `shared/demo_seed.rs` — `demo_seed_enabled()`, which reads the env var on every call (no caching). The server logs a prominent banner at startup:

```
!!!!!!!!!!!!!!!!!!!!!!!!!!!!
!!! DEMO MODE ENABLED !!!
!!!!!!!!!!!!!!!!!!!!!!!!!!!!
```

---

## Required Environment Variables

Set these **before** starting the server for the first time. They control what gets written into the database during the seed — changing them after the seed has run requires a reseed.

| Variable | Local demo | Public demo | Purpose |
|---|---|---|---|
| `ROOIAM_MODE` | `demo` | `demo` | Activates demo seed, demo routes, demo rate limits |
| `ROOIAM_DEPLOY_TARGET` | `local` | `public` | Local uses HTTP, public uses HTTPS |
| `ROOIAM_DEPLOY_TARGET` | `local` | `public` | Local uses HTTP, public uses HTTPS |
| `ROOIAM_SERVER_URL` | `http://localhost:5180` | `https://demo-api.yourdomain.com` | Used in OIDC tokens and JWKS |
| `ROOIAM_APP_URL` | `http://localhost:5182` | `https://demo-app.yourdomain.com` | Rooiam tenant portal (`rooiam-app`) URL |
| `ROOIAM_ENDUSER_URL` | `http://localhost:5184` | `https://demo.yourdomain.com` | Demo downstream end-user app URL (`candycloud-web` locally); determines customer-facing demo OAuth redirect targets |
| `ROOIAM_ADMIN_URL` | `http://localhost:5181` | `https://demo-admin.yourdomain.com` | Determines admin redirect URIs seeded into demo OAuth clients |
| `ROOIAM_DATABASE_URL` | `postgres://user:pass@localhost:5432/rooiam` | `postgres://rooiam:rooiam@postgres:5432/rooiam_demo` | Server auto-switches to `rooiam_demo` when `ROOIAM_MODE=demo` |
| `ROOIAM_ALLOWED_ORIGINS` | all localhost ports | all public demo domains | CORS — every frontend domain that calls this server |
| `ROOIAM_COOKIE_SECURE` | `false` | `true` | Must be true in production (HTTPS required) |

### Reseeding After URL Change

The demo seed replaces redirect URIs for existing demo clients on startup. The important mapping is:

- `ROOIAM_APP_URL` = Rooiam tenant portal (`rooiam-app`, `5182` locally)
- `ROOIAM_ENDUSER_URL` = downstream customer/end-user demo app (`candycloud-web`, `5184` locally)

If older seed data is still present, the demo OAuth clients may return the wrong `redirect_uri` from `/v1/demo/app-config`.

To fix, delete the demo OAuth clients and restart the server:

```bash
# Local
psql YOUR_DATABASE_URL -c "DELETE FROM oauth_clients WHERE client_id LIKE 'demo-%';"

# Docker (production machine)
docker compose -f docker-compose.demo.yml exec postgres \
  psql -U rooiam -d rooiam_demo -c "DELETE FROM oauth_clients WHERE client_id LIKE 'demo-%';"
```

The server will reseed on next startup with the correct URLs from `ROOIAM_ENDUSER_URL` and `ROOIAM_ADMIN_URL`.

---

## What Happens at Startup

When `demo_seed_enabled()` is true, `seed_demo_data` runs during server startup (`main.rs` calls it before binding). The function is idempotent — it uses `ON CONFLICT DO NOTHING` or `get_or_create` patterns so re-seeding is safe.

**Users created:**

| Email | Display Name | Role in demo |
|-------|-------------|--------------|
| `admin@rooiam.demo` | Roo Admin | Platform superuser (`superuser_email` system setting) |
| `rooroo@sweetfactory.demo` | rooroo | Tenant owner of both demo companies |
| `minmin@lovechocolate.user` | Minmin Customer | End user/member of RooChoco workspace |
| `lulu@softmallow.user` | Lulu Customer | End user/member of MintMallow workspace |

**Organizations created:**

| Slug | Name | Owner | Auth methods | MFA required |
|------|------|-------|-------------|-------------|
| `roochoco` | RooChoco | rooroo | magic\_link, google, passkey | No |
| `mintmallow` | MintMallow | rooroo | magic\_link, google, microsoft | Yes |

Each organization is re-upserted with its full branding config on every startup. This means branding changes made via the portal are overwritten on restart in demo mode.

---

## Demo Auth Method Overrides

When `demo_seed_enabled()` is true, `GET /v1/setup/auth-methods` and `GET /v1/setup/login-bootstrap` bypass the normal SMTP and OAuth config checks:

| Method | Normal check | Demo override |
|--------|-------------|--------------|
| Magic link | `smtp_host` + `smtp_from_email` configured | `infra::email::demo_smtp_present()` — true if Mailhog is running |
| Google | `google_client_id` + `google_client_secret` set | Always `true` |
| Microsoft | `microsoft_client_id` + `microsoft_client_secret` set | Always `true` |
| Passkey | `webauthn.rp_id` + `webauthn.origin` set | No override — same check |

### Admin console OAuth login

The admin console has a separate check: `google_admin_login_enabled` / `microsoft_admin_login_enabled` system settings must be `true` before Google/Microsoft can be used on the admin login page.

In demo mode this check is also bypassed (`oauth/handlers.rs` — `demo_seed_enabled()` short-circuits the setting lookup). **Do not remove this bypass** — without it, clicking "Continue with Google" on the admin demo login returns "This provider is not enabled for admin sign-in yet."

---

## Demo OAuth Pages

In demo mode, the real OAuth provider redirect is replaced with a locally rendered HTML page.

### GET `/v1/oauth/demo`

Query params: `provider`, plus either `redirect_uri` for direct app flow or `widget_login_context` for hosted-widget flow.

Returns a styled HTML page (no external assets) that:
- Badges as "Demo only"
- Shows the pre-selected demo email, workspace name, and target app
- Has a "Continue with simulated {Provider}" button (POST form)
- Has a "Back to login" cancel link

The page appearance is provider-branded:
- Google: red accent (`#db4437`)
- Microsoft: blue accent (`#2563eb`)

### POST `/v1/oauth/demo/{provider}/continue`

Query param: `redirect_uri`

Completes the demo login:

1. Guard: `demo_seed_enabled()` or 404.
2. Validates provider and redirect URI.
3. Calls `ensure_auth_method_allowed` — workspace auth policy applies.
4. Determines the demo email from the workspace/end-user context:
   - RooChoco downstream app → `minmin@lovechocolate.user`
   - MintMallow downstream app → `lulu@softmallow.user`
   - Tenant portal fallback → `rooroo@sweetfactory.demo`
5. Looks up user by email (must exist; created by seed).
6. Applies MFA enrollment and login gates (workspace `require_mfa` applies).
7. Creates a real opaque session and sets the cookie.
8. Redirects to `redirect_uri`.

### Demo account selection per workspace

The email chosen depends on two factors:
- The `app_name` query parameter on the `redirect_uri` (or derived from the OIDC client context)
- The `workspace` slug on the `redirect_uri`

If the login is coming from the demo downstream app, the workspace-specific customer account is selected. For all other contexts (tenant portal, root login, etc.), the tenant user `rooroo@sweetfactory.demo` is used.

This mapping is defined in `shared/demo_seed.rs` — `demo_customer_email_for_org`:

```rust
"roochoco" → minmin@lovechocolate.user
"mintmallow" → lulu@softmallow.user
_ → None  (falls back to rooroo@sweetfactory.demo)
```

---

## Demo Login Shortcut

The setup endpoint `POST /v1/setup/demo-login` provides a direct session creation without any credential:

```json
{ "org_slug": "roochoco", "app_name": "Rooiam Demo" }
```

This:
1. Guards on `demo_seed_enabled()`.
2. Selects the demo user for the workspace.
3. Verifies the user is a member of the organization.
4. Creates a real opaque session with `current_org_id` set.
5. Emits an audit log event with `method: demo_shortcut, demo_mode: true`.
6. Returns the cookie + `{ ok, workspace_slug, app_name }`.

This endpoint is used by the demo app's automatic login shortcut. It does not require any auth.

---

## Audit Event Tagging

All demo-originated authentication events include `"demo_mode": true` in the metadata JSON. This applies to:

- `demo.oauth.login.success` (from demo OAuth continue)
- `auth.mfa.enrollment.required` (triggered by demo OAuth)
- `auth.mfa.required` (triggered by demo OAuth)
- `auth.login.success` with `method: demo_shortcut` (from demo-login endpoint)

Events created by normal magic link / passkey / OIDC flows in demo mode do **not** automatically carry the demo tag — only the demo OAuth and shortcut paths add it explicitly.

---

## What Demo Mode Does NOT Cover

| Feature | Status |
|---------|--------|
| Real email delivery | Not provided. Magic links go to Mailhog if configured (SMTP on `localhost:1025`), otherwise may silently fail |
| Real Google/Microsoft tokens | Not used. The demo page simulates consent without contacting the provider |
| Real WebAuthn hardware | Not simulated. Passkey registration and login work normally but require actual WebAuthn-capable hardware or a browser with virtual authenticator |
| Real OIDC client registration | Works normally. Demo mode does not create demo OIDC clients |
| Data isolation | All demo users are in the same PostgreSQL database as any other users. Demo and non-demo data coexist |
| TOTP bypass | Not bypassed. If `mintmallow.require_mfa = true`, demo users logging in to mintmallow must enroll TOTP (enrollment challenge issued) |
| Superuser protection | In demo mode, `admin@rooiam.demo` is the platform superuser. Admin console is accessible only to that email |
