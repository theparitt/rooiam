# First Production-Style Setup

Use this guide if you want the cleanest first production path.

This is not the full production reference. This is the operator checklist to get your first real instance running.

## 1. Prepare Infrastructure

You need:

- PostgreSQL 14+
- Redis
- one SMTP provider
- one public HTTPS domain for `rooiam-server`
- one public HTTPS domain for `rooiam-admin`
- one public HTTPS domain for `rooiam-app`

You also need:

- a machine or VM to run `rooiam-server`
- a reverse proxy or web server in front of your built frontends
- a writable storage path such as `/data/rooiam`

Recommended split:

- `https://auth.example.com` -> `rooiam-server`
- `https://admin.example.com` -> `rooiam-admin`
- `https://login.example.com` -> `rooiam-app`
- `https://docs.example.com` -> `rooiam-docs`

## 1.1 Public DNS And Domain Mapping

Before you test a public deployment, create DNS records for every public surface you plan to expose.

Typical public mapping:

- `rooiam.com` -> `rooiam-landing`
- `www.rooiam.com` -> redirect to `rooiam.com`
- `api.rooiam.com` -> `rooiam-server`
- `admin.rooiam.com` -> `rooiam-admin`
- `app.rooiam.com` -> `rooiam-app`
- `docs.rooiam.com` -> `rooiam-docs`
- `book.rooiam.com` -> `rooiam-book`
- `demo.rooiam.com` -> `candycloud-web`
- `examples.rooiam.com` -> example frontend host

If you use Cloudflare Pages for static frontends:

- bind the custom domain inside the Pages project
- for example:
  - `admin.rooiam.com` -> `rooiam-admin`
  - `rooiam.com` -> `rooiam-landing`

### Cloudflare Pages Frontend Deploy

Cloudflare Pages is a good deployment path for the static frontends:

- `rooiam-admin`
- `rooiam-app`
- `rooiam-landing`
- `rooiam-docs`
- `rooiam-book`

It is not where `rooiam-server` runs. Keep the API on your own machine or VM behind Caddy or another reverse proxy.

Recommended public mapping:

- `rooiam.com` -> `rooiam-landing`
- `admin.rooiam.com` -> `rooiam-admin`
- `app.rooiam.com` -> `rooiam-app`
- `docs.rooiam.com` -> `rooiam-docs`
- `book.rooiam.com` -> `rooiam-book`
- `api.rooiam.com` -> `rooiam-server`

Example Wrangler deploys:

```bash
cd rooiam-admin
VITE_API_URL=https://api.rooiam.com/v1 \
VITE_DOCS_URL=https://docs.rooiam.com \
npm run build
npm run pages:deploy -- dist --project-name rooiam-admin
```

```bash
cd rooiam-app
VITE_API_URL=https://api.rooiam.com/v1 \
npm run build
npm run pages:deploy -- dist --project-name rooiam-app
```

```bash
cd rooiam-landing
npm run build
npx wrangler pages deploy dist --project-name rooiam-landing
```

Simple rule:

- static UI -> Pages is fine
- API / issuer -> stays on your own server

If you use Caddy or another reverse proxy for the API:

- point `api.rooiam.com` DNS to the server machine
- terminate TLS there
- reverse proxy to the local Rooiam server process or container

Simple rule:

- every public browser frontend that makes API calls must appear in `ROOIAM_ALLOWED_ORIGINS`
- every public hosted-widget site must also be configured in the app's `Allowed Embed Origins`

## 2. Clone The Repo

```bash
git clone https://github.com/theparitt/rooiam
cd rooiam
```

## 3. Create The Production Server Env File

Create:

- `rooiam-server/.env`

Best starting point:

- copy [rooiam-server/.env.template](/rooiam-server/.env.template)
- keep `.env.template` unchanged
- put your real values in `rooiam-server/.env`

Recommended command:

```bash
cp rooiam-server/.env.template rooiam-server/.env
nano rooiam-server/.env
```

Then edit `rooiam-server/.env` and start with:

```env
# ── Mode ──────────────────────────────────────────────────────────────────────
ROOIAM_MODE=production
ROOIAM_DEPLOY_TARGET=public

# ── Server ────────────────────────────────────────────────────────────────────
ROOIAM_HOST=0.0.0.0
ROOIAM_PORT=5170

# ── Public URLs ────────────────────────────────────────────────────────────────
ROOIAM_SERVER_URL=https://auth.example.com
ROOIAM_APP_URL=https://login.example.com
ROOIAM_ADMIN_URL=https://admin.example.com

# ── Browser Security ────────────────────────────────────────────────────────────
ROOIAM_ALLOWED_ORIGINS=https://admin.example.com,https://login.example.com
ROOIAM_COOKIE_SECURE=true

# ── Database / Cache ────────────────────────────────────────────────────────────
ROOIAM_DATABASE_URL=postgres://USER:PASSWORD@DBHOST:5432/rooiam
ROOIAM_REDIS_URL=redis://REDISHOST:6379

# ── Storage ─────────────────────────────────────────────────────────────────────
ROOIAM_STORAGE_ROOT=/data/rooiam
ROOIAM_PUBLIC_MEDIA_BASE=/media

# ── Setup ──────────────────────────────────────────────────────────────────────
ROOIAM_SETUP_TOKEN=replace-with-a-long-random-secret
```

Important:

- `ROOIAM_MODE=production` and `ROOIAM_DEPLOY_TARGET=public` for production servers
- `ROOIAM_SERVER_URL` must match the real public server URL
- `ROOIAM_APP_URL` must match the real public `rooiam-app` tenant portal URL
- `ROOIAM_ADMIN_URL` must match the real admin URL
- `ROOIAM_ENDUSER_URL` is not used for normal production mode; it is only for demo downstream end-user apps such as CandyCloud
- `ROOIAM_SETUP_TOKEN` is strongly recommended for first-time setup from a public domain

### Remote First-Time Setup Token

If you open the setup wizard from a public browser, Rooiam will reject first-time setup unless the request is:

- from loopback / localhost
- or carries a valid `ROOIAM_SETUP_TOKEN`

Recommended pattern:

1. set a strong random value in `rooiam-server/.env`
2. restart `rooiam-server`
3. redeploy `rooiam-admin` so the setup wizard includes the `Setup Token` field
4. open `https://admin.example.com/setup`
5. paste the same token into `Setup Token`
6. finish setup

Example token generation:

```bash
openssl rand -hex 32
```

This token is only for remote bootstrap protection. It is not a normal end-user login secret.

### Public-Origin Rule

`ROOIAM_ALLOWED_ORIGINS` is the server-side CORS allowlist.

This must contain every browser frontend origin that will call `api.rooiam.com` directly.

Typical public example:

```env
ROOIAM_ALLOWED_ORIGINS=https://admin.rooiam.com,https://app.rooiam.com,https://demo.rooiam.com,https://examples.rooiam.com,https://rooiam.com,https://www.rooiam.com
```

Usually include:

- `https://admin.rooiam.com`
- `https://app.rooiam.com`
- `https://demo.rooiam.com`
- `https://examples.rooiam.com`
- `https://rooiam.com` if the landing page makes browser API calls
- `https://www.rooiam.com` if it is not only a redirect

Usually do not include unless they really call the API from browser JavaScript:

- `https://docs.rooiam.com`
- `https://book.rooiam.com`

Common self-host symptom:

- the API responds `200`
- but the browser still shows:
  - `No 'Access-Control-Allow-Origin' header is present on the requested resource`

That means the API is reachable, but the current frontend origin is missing from `ROOIAM_ALLOWED_ORIGINS`.

Important distinction:

- `ROOIAM_ALLOWED_ORIGINS`
  - global server CORS allowlist for browser frontends
- `Allowed Embed Origins`
  - per-app hosted-widget site allowlist inside Rooiam app settings

These are different controls. A hosted widget can still fail even when CORS is correct if the app's `Allowed Embed Origins` or callback origins are wrong.

Optional before first boot:

- add `ROOIAM_SMTP_*` now if you already know your SMTP settings
- add `ROOIAM_GOOGLE_*` now if you already know your Google OAuth values
- add `ROOIAM_MICROSOFT_*` now if you already know your Microsoft OAuth values

If you do not add those yet, you can enter them later in the setup wizard instead.

Operator choice:

- advanced users can edit `rooiam-server/.env` directly and place more runtime configuration there from the beginning
- non-advanced users should put only the required basics in `rooiam-server/.env`, start the server, and finish optional setup in the wizard

Simple rule:

- use `.env` for required runtime boot values
- use the wizard for optional SMTP and Google / Microsoft values if you do not want to manage those by hand in env files

Setup wizard note:

- the connection step will use `ROOIAM_SERVER_URL`, `ROOIAM_APP_URL`, and `ROOIAM_ADMIN_URL` as default values
- if `ROOIAM_SETUP_TOKEN` is set, paste the same value into the `Setup Token` field during remote first-time setup
- SMTP and OAuth env vars are runtime fallback values, but they do not currently appear prefilled in the wizard fields
- once SMTP or OAuth values are saved through the wizard or admin UI, those saved values will appear again later in setup/settings

Zero-to-first-start recommendation:

1. copy `.env.template` to `.env`
2. fill the required runtime values and public URLs
3. optionally fill SMTP / Google / Microsoft in `.env`
4. start the server
5. open the setup wizard
6. if SMTP / OAuth were left out of `.env`, fill them in the wizard

## 4. Run Migrations

```bash
cd rooiam-server
sqlx migrate run --database-url "$ROOIAM_DATABASE_URL"
```

## 5. Build And Start The Server

```bash
cd rooiam-server
SQLX_OFFLINE=true cargo run
```

In real deployment, replace `cargo run` with your proper service/process manager.

Before moving on, verify:

```bash
curl https://auth.example.com/health
```

Expected result:

```json
{"status":"ok","version":"v1"}
```

## 6. Build The Frontends

```bash
cd rooiam-admin && npm install && npm run build
cd ../rooiam-app && npm install && npm run build
cd ../rooiam-landing && npm install && npm run build
cd ../rooiam-docs && npm install && npm run build
cd ..
```

## 7. Open The Admin UI

Go to:

- `https://admin.example.com`

## 8. Complete First Admin Setup

Do these in order:

1. create the first platform admin
2. confirm public URLs
3. configure SMTP
4. configure Google OAuth if you want Google login
5. configure Microsoft OAuth if you want Microsoft login
6. mark setup complete

Expected result:

- you can sign back in as the platform admin
- setup pages are now restricted to the signed-in platform superuser

## 9. Create The First Tenant

After platform setup:

1. sign in to `rooiam-admin`
2. review instance settings
3. create the first organization if that is part of your flow
4. sign in to `rooiam-app`
5. configure tenant branding and login policy

## 10. What To Read Next

Continue with:

1. [Production Guide](../production/00_index.md)
2. [SMTP with Mailcow](../production/02_smtp_mailcow.md)
3. [OAuth Setup](../production/03_oauth_setup.md)
4. [First Tenant](../production/04_first_tenant.md)
