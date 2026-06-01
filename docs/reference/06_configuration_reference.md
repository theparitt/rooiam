# Configuration Reference

This page is the short configuration map for the most important `0.1` settings.

## Core Required

### `ROOIAM_DATABASE_URL`
- PostgreSQL connection string

### `ROOIAM_REDIS_URL`
- Redis URL for auth/session-related state

## Network And URLs

### `ROOIAM_HOST`
- API bind host

### `ROOIAM_PORT`
- API bind port

### `ROOIAM_ALLOWED_ORIGINS`
- CORS allowlist for frontend apps that call the API

Production example:

```env
ROOIAM_ALLOWED_ORIGINS=https://admin.rooiam.com,https://app.rooiam.com,https://demo.rooiam.com,https://examples.rooiam.com,https://rooiam.com,https://www.rooiam.com
```

Rule:
- include every browser origin that makes `fetch` / XHR requests to the Rooiam API
- do not add docs/book origins unless those sites actually call the API from browser JavaScript

Common symptom when this is wrong:
- browser shows a CORS error like:
  - `No 'Access-Control-Allow-Origin' header is present on the requested resource`
- network tab may still show `200`

That means:
- the API is reachable
- but the current frontend origin is not allowed by the server CORS policy

Important:
- this is not the same as app-level `Allowed Embed Origins`
- `ROOIAM_ALLOWED_ORIGINS` is global API CORS
- `Allowed Embed Origins` is per-app hosted-widget policy

### `ROOIAM_SERVER_URL`
- public Rooiam API / issuer URL

## Cookie Settings

### `ROOIAM_COOKIE_DOMAIN`
- cookie domain override

### `ROOIAM_COOKIE_SECURE`
- force secure cookies on or off

Production rule:
- use secure cookies

## Demo Mode

### `ROOIAM_ENABLE_DEMO_SEED`
- local demo seed mode

Rule:
- do not use in production

## SMTP Settings

- `ROOIAM_SMTP_HOST`
- `ROOIAM_SMTP_PORT`
- `ROOIAM_SMTP_USER`
- `ROOIAM_SMTP_PASS`
- `ROOIAM_SMTP_FROM`

For demo/local:
- `ROOIAM_DEMO_SMTP_*`

## OAuth Provider Settings

Google:
- `ROOIAM_GOOGLE_CLIENT_ID`
- `ROOIAM_GOOGLE_CLIENT_SECRET`

Microsoft:
- `ROOIAM_MICROSOFT_CLIENT_ID`
- `ROOIAM_MICROSOFT_CLIENT_SECRET`
- `ROOIAM_MICROSOFT_TENANT_ID`

## OIDC Signing

- `ROOIAM_OIDC_SIGNING_SECRET`
- `ROOIAM_OIDC_PRIVATE_KEY_PEM`
- `ROOIAM_OIDC_PUBLIC_KEY_PEM`
- `ROOIAM_OIDC_PRIVATE_KEY_PATH`
- `ROOIAM_OIDC_PUBLIC_KEY_PATH`
- `ROOIAM_OIDC_KEY_ID`

## Rate Limits

Rooiam has per-endpoint and per-IP rate limiting on five surfaces: auth, identity, orgs, oauth, and webauthn. All windows are 60 seconds.

### Reading active limits

```
GET /v1/setup/config
```

No authentication required. Returns the currently active limits alongside mode, feature flags, and other runtime config.

### Overriding limits

Three-level resolution — highest priority first:

1. **Mode-specific** env var: `ROOIAM_RATE_{MODE}_{SUFFIX}` (e.g. `ROOIAM_RATE_DEMO_AUTH_PER_ENDPOINT`)
2. **Generic** env var: `ROOIAM_RATE_{SUFFIX}` (e.g. `ROOIAM_RATE_AUTH_PER_ENDPOINT`)
3. **Hardcoded default** — differs by mode (demo defaults are more generous than production)

Demo mode ships with relaxed defaults by design — it is a public-facing demo environment where real users explore flows.

### Example: tighten auth limits in demo mode only

```env
ROOIAM_RATE_DEMO_AUTH_PER_ENDPOINT=20
ROOIAM_RATE_DEMO_AUTH_PER_IP=50
```

This leaves production defaults unchanged.

### Example: raise limits globally for a high-traffic environment

```env
ROOIAM_RATE_AUTH_PER_ENDPOINT=50
ROOIAM_RATE_AUTH_PER_IP=200
```

These apply to both modes unless a mode-specific override is also set.

See [Environment Variable Catalog → Rate Limits](08_env_var_catalog.md#rate-limits-and-abuse-control) for the full variable list and default values.

## Localhost Exceptions

- plain `http://` is allowed for localhost or loopback development
- production-facing sites should use `https://`

## Operator Rule

Use env vars for:
- runtime basics
- deployment automation

Use the admin UI for:
- operator-managed SMTP and provider settings after bootstrap
