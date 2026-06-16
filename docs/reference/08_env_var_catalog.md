# Environment Variable Catalog

This page is the compact environment-variable catalog for Rooiam `0.1`.

It focuses on the names that operators actually need to recognize.

## Deployment Mode

Rooiam has four deployment modes — controlled entirely by env vars, not by the binary:

| | Local (localhost) | Public (your domain) |
|---|---|---|
| **Production** | `ROOIAM_MODE=production`, `ROOIAM_DEPLOY_TARGET=local`, `ROOIAM_COOKIE_SECURE=false` | `ROOIAM_MODE=production`, `ROOIAM_DEPLOY_TARGET=public`, `ROOIAM_COOKIE_SECURE=true` |
| **Demo** | `ROOIAM_MODE=demo`, `ROOIAM_DEPLOY_TARGET=local` | `ROOIAM_MODE=demo`, `ROOIAM_DEPLOY_TARGET=public`, `ROOIAM_DEMO_MAILBOX_URL=https://...` |

Local vs public is explicit via `ROOIAM_DEPLOY_TARGET`.

| Variable | Purpose | Notes |
|---|---|---|
| `ROOIAM_MODE` | runtime mode | `production` or `demo` |
| `ROOIAM_DEPLOY_TARGET` | deployment target | `local` or `public` |
| `ROOIAM_RESET_DEMO_DATA` | reset demo data | development-only |

## Core Runtime

| Variable | Purpose | Notes |
|---|---|---|
| `ROOIAM_DATABASE_URL` | PostgreSQL connection | required |
| `ROOIAM_REDIS_URL` | Redis connection | required |
| `ROOIAM_HOST` | bind host | defaults to server local bind behavior |
| `ROOIAM_PORT` | bind port | defaults to `5170` locally |
| `ROOIAM_SERVICE_ENVIRONMENT` | MKS-1 environment label | `development`, `staging`, `production`, `test`, or `local` |
| `ROOIAM_ALLOWED_ORIGINS` | CORS allowlist | frontend origins that may call the API |
| `ROOIAM_DB_POOL_SIZE` | database pool size | optional tuning |

## Meerkateer / MKS-1

`rooiam-server` exposes the Meerkateer MKS-1 pull interface:

- `GET /health`
- `GET /ready`
- `GET /metrics`
- `GET /.well-known/meerkateer.json`
- `GET /server-info`

It can also push heartbeat, event, and deploy telemetry to Meerkateer when enabled.

| Variable | Purpose | Notes |
|---|---|---|
| `ROOIAM_MEERKATEER_ENABLED` | enable Meerkateer push delivery | `true` or `false` |
| `ROOIAM_MEERKATEER_INGEST_URL` | Meerkateer ingest base URL | use `https://www.meerkateer.com` |
| `ROOIAM_MEERKATEER_SERVICE_KEY` | Bearer token for Meerkateer ingest | secret |
| `ROOIAM_MEERKATEER_TIMEOUT_MS` | push timeout in milliseconds | defaults to `3000` |
| `ROOIAM_MEERKATEER_HEARTBEAT_INTERVAL_SECONDS` | heartbeat cadence | defaults to `60` |
| `ROOIAM_METRICS_ENABLED` | enable `/metrics` endpoint | defaults to `true` |
| `ROOIAM_METRICS_TOKEN` | optional Bearer token for `/metrics` | if set, clients must send `Authorization: Bearer <token>` |

`ROOIAM_MEERKATEER_INGEST_URL` is a base URL only. Rooiam appends:

- `/v1/ingest/heartbeat`
- `/v1/ingest/event`
- `/v1/ingest/deploy`

For live fault-injection testing only:

| Variable | Purpose | Notes |
|---|---|---|
| `ROOIAM_MKS1_FORCE_CHECK_FAILURES` | force `/health` and `/ready` failures | example: `database=unavailable`, `redis=timeout`, or `all=unavailable` |

## Public URLs

| Variable | Purpose | Notes |
|---|---|---|
| `ROOIAM_SERVER_URL` | public API / issuer URL | used for OIDC and callback generation |
| `ROOIAM_APP_URL` | tenant-admin portal URL | tenant/workspace admin UI |
| `ROOIAM_ENDUSER_URL` | demo end-user app URL | used by demo seed to build redirect URIs for demo OAuth clients — not needed in production |
| `ROOIAM_ADMIN_URL` | platform-admin URL | platform operator UI |
| `ROOIAM_OAUTH_REDIRECT` | legacy OAuth redirect helper | avoid treating this as the main app callback contract |

## Cookies And Sessions

| Variable | Purpose | Notes |
|---|---|---|
| `ROOIAM_SESSION_COOKIE` | session cookie name | defaults if not set |
| `ROOIAM_COOKIE_DOMAIN` | cookie domain override | production should match your real domain |
| `ROOIAM_COOKIE_SECURE` | secure-cookie override | production should use secure cookies |

## SMTP And Email

| Variable | Purpose | Notes |
|---|---|---|
| `ROOIAM_SMTP_HOST` | SMTP host | real delivery |
| `ROOIAM_SMTP_PORT` | SMTP port | real delivery |
| `ROOIAM_SMTP_USER` | SMTP username | optional depending on provider |
| `ROOIAM_SMTP_PASS` | SMTP password / API key | secret |
| `ROOIAM_SMTP_FROM` | sender address | visible to end users |
| `ROOIAM_SMTP_SECURITY` | SMTP security mode | `none`, `starttls`, or `tls` |
| `ROOIAM_SMTP_INSECURE_TLS` | allow insecure TLS | only for special cases |
| `ROOIAM_DEMO_SMTP_HOST` | demo SMTP host | local/demo only |
| `ROOIAM_DEMO_SMTP_PORT` | demo SMTP port | local/demo only |
| `ROOIAM_DEMO_SMTP_FROM` | demo sender address | local/demo only |
| `ROOIAM_DEMO_SMTP_SECURITY` | demo SMTP security | local/demo only |
| `ROOIAM_DEMO_MAILBOX_URL` | Mailhog inbox URL shown after magic link is sent | local demo: leave unset (defaults to `http://localhost:8025`); public demo: set to your public Mailhog domain |
| `ROOIAM_FROM_EMAIL` | fallback sender alias | legacy/fallback alias |

## OAuth Providers

| Variable | Purpose | Notes |
|---|---|---|
| `ROOIAM_GOOGLE_CLIENT_ID` | Google OAuth client ID | optional |
| `ROOIAM_GOOGLE_CLIENT_SECRET` | Google OAuth client secret | optional |
| `ROOIAM_MICROSOFT_CLIENT_ID` | Microsoft OAuth client ID | optional |
| `ROOIAM_MICROSOFT_CLIENT_SECRET` | Microsoft OAuth client secret | optional |
| `ROOIAM_MICROSOFT_TENANT_ID` | Microsoft tenant selector | defaults to `common` in many setups |

Google and Microsoft callback URLs are derived from `ROOIAM_SERVER_URL`:

- Google: `{ROOIAM_SERVER_URL}/api/v1/auth/google/callback`
- Microsoft: `{ROOIAM_SERVER_URL}/api/v1/auth/microsoft/callback`

Normal setups should change `ROOIAM_SERVER_URL`, not try to manage separate provider callback env vars.

## OIDC Signing

| Variable | Purpose | Notes |
|---|---|---|
| `ROOIAM_OIDC_SIGNING_SECRET` | symmetric token-signing secret | simple deployments |
| `ROOIAM_JWT_SECRET` | legacy/fallback secret | do not confuse with app callbacks |
| `ROOIAM_OIDC_PRIVATE_KEY_PEM` | RSA private key PEM | advanced deployments |
| `ROOIAM_OIDC_PUBLIC_KEY_PEM` | RSA public key PEM | advanced deployments |
| `ROOIAM_OIDC_PRIVATE_KEY_PATH` | RSA private key path | advanced deployments |
| `ROOIAM_OIDC_PUBLIC_KEY_PATH` | RSA public key path | advanced deployments |
| `ROOIAM_OIDC_KEY_ID` | JWKS key ID | published in token headers |

## WebAuthn / Passkeys

| Variable | Purpose | Notes |
|---|---|---|
| `ROOIAM_WEBAUTHN_RP_ID` | passkey RP ID | production should match your real domain |
| `ROOIAM_WEBAUTHN_RP_NAME` | passkey RP name | display label |
| `ROOIAM_WEBAUTHN_ORIGIN` | primary WebAuthn origin | required for stable production setups |
| `ROOIAM_WEBAUTHN_EXTRA_ORIGINS` | additional WebAuthn origins | use carefully |
| `ROOIAM_WEBAUTHN_ALLOW_ANY_PORT` | localhost/dev helper | development convenience only |

## Storage And Media

| Variable | Purpose | Notes |
|---|---|---|
| `ROOIAM_STORAGE_ROOT` | local media storage root | local/file-based storage |
| `ROOIAM_PUBLIC_MEDIA_BASE` | public media base URL | media delivery path |
| `ROOIAM_MINIO_ENDPOINT` | MinIO/S3 endpoint | object storage |
| `ROOIAM_MINIO_BUCKET` | MinIO/S3 bucket | object storage |
| `ROOIAM_MINIO_USER` | storage access key | secret |
| `ROOIAM_MINIO_PASSWORD` | storage secret key | secret |

## Rate Limits And Abuse Control

All rate limits use a fixed 60-second sliding window. Each limit is a request count ceiling.

### Generic overrides (apply to both production and demo mode)

| Variable | Purpose | Scope |
|---|---|---|
| `ROOIAM_RATE_AUTH_PER_ENDPOINT` | auth endpoint rate limit | login and auth-start surfaces |
| `ROOIAM_RATE_AUTH_PER_IP` | auth IP-group rate limit | login and auth-start surfaces |
| `ROOIAM_RATE_IDENTITY_PER_ENDPOINT` | identity endpoint rate limit | account/self-service surfaces |
| `ROOIAM_RATE_IDENTITY_PER_IP` | identity IP-group rate limit | account/self-service surfaces |
| `ROOIAM_RATE_ORGS_PER_ENDPOINT` | org endpoint rate limit | workspace-management surfaces |
| `ROOIAM_RATE_ORGS_PER_IP` | org IP-group rate limit | workspace-management surfaces |
| `ROOIAM_RATE_OAUTH_PER_ENDPOINT` | OAuth endpoint rate limit | OAuth authorize / token surfaces |
| `ROOIAM_RATE_OAUTH_PER_IP` | OAuth IP-group rate limit | OAuth authorize / token surfaces |
| `ROOIAM_RATE_WEBAUTHN_PER_ENDPOINT` | WebAuthn endpoint rate limit | passkey register/login surfaces |
| `ROOIAM_RATE_WEBAUTHN_PER_IP` | WebAuthn IP-group rate limit | passkey register/login surfaces |

### Mode-specific overrides (take priority over generic overrides)

Variables follow the pattern `ROOIAM_RATE_{MODE}_{SUFFIX}` where `{MODE}` is `PRODUCTION` or `DEMO`.

| Variable | Purpose |
|---|---|
| `ROOIAM_RATE_PRODUCTION_AUTH_PER_ENDPOINT` | auth limit in production mode |
| `ROOIAM_RATE_PRODUCTION_AUTH_PER_IP` | auth IP limit in production mode |
| `ROOIAM_RATE_DEMO_AUTH_PER_ENDPOINT` | auth limit in demo mode |
| `ROOIAM_RATE_DEMO_AUTH_PER_IP` | auth IP limit in demo mode |
| `ROOIAM_RATE_DEMO_OAUTH_PER_ENDPOINT` | OAuth limit in demo mode |
| `ROOIAM_RATE_DEMO_OAUTH_PER_IP` | OAuth IP limit in demo mode |
| `ROOIAM_RATE_DEMO_WEBAUTHN_PER_ENDPOINT` | WebAuthn limit in demo mode |
| `ROOIAM_RATE_DEMO_WEBAUTHN_PER_IP` | WebAuthn IP limit in demo mode |

Resolution order (highest to lowest priority):

1. `ROOIAM_RATE_{MODE}_{SUFFIX}` — mode-specific override
2. `ROOIAM_RATE_{SUFFIX}` — generic override
3. hardcoded default (differs by mode — demo defaults are more generous)

### Default values

| Scope | Production (ep / ip) | Demo (ep / ip) |
|---|---|---|
| Auth | 10 / 40 | 30 / 60 |
| Identity | 400 / 1200 | 400 / 1200 |
| Orgs | 60 / 200 | 600 / 2000 |
| OAuth | 20 / 60 | 60 / 200 |
| WebAuthn | 10 / 60 | 30 / 200 |

Current active limits are always readable at `GET /v1/setup/config` (no auth required).

## Widget And Proxy Safety

| Variable | Purpose | Notes |
|---|---|---|
| `ROOIAM_REQUIRE_EXPLICIT_EMBED_ORIGINS` | disable fallback behavior | production should prefer explicit embed origins |
| `ROOIAM_TRUSTED_PROXY_CIDRS` | trusted proxy IP ranges | only if you are behind real proxies/load balancers |

## Misc

| Variable | Purpose | Notes |
|---|---|---|
| `ROOIAM_MAX_LOGO_BYTES` | upload size limit for logos | branding safety |
| `ROOIAM_TIMING_LOGS` | timing diagnostics | debugging/ops |
| `ROOIAM_SETUP_TOKEN` | setup bootstrap token | protect initial setup |
| `ROOIAM_MASCOT_SVG` | mascot asset override | presentation only |

## Practical `0.1` Rule

For a normal production deployment, understand these first:
- `ROOIAM_DATABASE_URL`
- `ROOIAM_REDIS_URL`
- `ROOIAM_SERVER_URL`
- `ROOIAM_APP_URL`
- `ROOIAM_ADMIN_URL`
- `ROOIAM_ALLOWED_ORIGINS`
- `ROOIAM_COOKIE_SECURE`
- `ROOIAM_SMTP_*`
- `ROOIAM_GOOGLE_*` / `ROOIAM_MICROSOFT_*`
- `ROOIAM_RATE_*`
