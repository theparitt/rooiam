# 🏗️ Platform Setup 🏰

This chapter is the first-time operator path for a production-style Rooiam install.

## 🧱 Prepare Infrastructure

Minimum dependencies:

- PostgreSQL 14+
- Redis
- one SMTP service
- one public HTTPS domain for `rooiam-server`
- one public HTTPS domain for `rooiam-admin`
- one public HTTPS domain for `rooiam-app`

Recommended public host split:

- `https://auth.example.com` -> `rooiam-server`
- `https://admin.example.com` -> `rooiam-admin`
- `https://login.example.com` -> `rooiam-app`

## ⚙️ Create the Server Environment

Do this first:

1. copy the template file
2. create the real runtime env file
3. fill the required production values before the first server start

Recommended command:

```bash
cd rooiam
cp rooiam-server/.env.template rooiam-server/.env
```

Keep `.env.template` unchanged in the repo. Put your real instance values in `rooiam-server/.env`.

Important naming rule:

- use `ROOIAM_DATABASE_URL`
- do not use plain `DATABASE_URL` as the main Rooiam server setting

Start the new `.env` with:

```env
# ── Mode ──────────────────────────────────────────────────────────────────────
ROOIAM_MODE=production
ROOIAM_DEPLOY_TARGET=public

# ── Server ────────────────────────────────────────────────────────────────────
ROOIAM_HOST=0.0.0.0
ROOIAM_PORT=5170

# ── Public URLs ────────────────────────────────────────────────────────────────
ROOIAM_SERVER_URL=https://auth.example.com
ROOIAM_ADMIN_URL=https://admin.example.com
ROOIAM_APP_URL=https://login.example.com

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

Then add SMTP and OAuth values in the next chapters.

Recommended workflow:

- copy [rooiam-server/.env.template](/rooiam-server/.env.template)
- create `rooiam-server/.env`
- fill in the real production values for database, redis, allowed origins, and public URLs
- optionally fill SMTP and Google / Microsoft OAuth here too
- then start the server and use the setup wizard for first-run save/verify steps

### What must be in `.env` before first boot

These should be set in `rooiam-server/.env` before you start from zero:

- `ROOIAM_MODE` (required: `production`, `demo`, or `test`)
- `ROOIAM_DEPLOY_TARGET` (required: `local` or `public`)
- `ROOIAM_DATABASE_URL`
- `ROOIAM_REDIS_URL`
- `ROOIAM_SERVER_URL`
- `ROOIAM_APP_URL`
- `ROOIAM_ADMIN_URL`
- `ROOIAM_ALLOWED_ORIGINS`
- `ROOIAM_COOKIE_SECURE`
- `ROOIAM_HOST`
- `ROOIAM_PORT`

These are the minimum values that make the runtime and first setup pass coherent.

### SMTP and Google / Microsoft OAuth: env or wizard

You have two valid operator paths:

- put SMTP / Google / Microsoft values directly in `rooiam-server/.env`
- leave them out of `.env` and enter them in the setup wizard

Use `.env` if:

- you want everything declared in server config from the beginning
- you prefer file-based runtime config
- you are provisioning through infrastructure automation

Use the setup wizard if:

- you want to test the connection interactively
- you want to save the values through the admin UI
- you prefer to enter provider credentials after the server is already reachable

Both approaches work. The important distinction is:

- env values work immediately at runtime
- only saved DB values reappear later in the setup/settings forms

### What shows up in the setup wizard by default

Current behavior is split into two groups:

- env-backed setup defaults
- DB-backed saved setup values

These env vars can appear as default values in the setup wizard connection step:

- `ROOIAM_SERVER_URL`
- `ROOIAM_APP_URL`
- `ROOIAM_ADMIN_URL`

Those map to:

- API Base URL
- Auth App URL
- Admin App URL

These values are loaded through the server runtime public URL fallback and then shown by `/v1/setup/public-urls`.

### What does not prefill from env today

These runtime env vars do not currently prefill the SMTP and OAuth form fields in the setup wizard:

- `ROOIAM_SMTP_HOST`
- `ROOIAM_SMTP_PORT`
- `ROOIAM_SMTP_USER`
- `ROOIAM_SMTP_PASS`
- `ROOIAM_SMTP_FROM`
- `ROOIAM_GOOGLE_CLIENT_ID`
- `ROOIAM_GOOGLE_CLIENT_SECRET`
- `ROOIAM_MICROSOFT_CLIENT_ID`
- `ROOIAM_MICROSOFT_CLIENT_SECRET`
- `ROOIAM_MICROSOFT_TENANT_ID`

Today, those setup wizard fields are only prefilled after values have been saved into Rooiam's database through the setup flow or later admin settings.

That means:

- env values still work as runtime fallback for login behavior
- but they do not show as prefilled text in the wizard yet
- so if you put SMTP or Google / Microsoft in `.env`, they still work even if the wizard fields look empty on first boot

If you want a value to visibly reappear in the setup/settings forms, save it through the wizard or admin UI at least once.

Important:

- `ROOIAM_MODE=production` for production servers
- `ROOIAM_DEPLOY_TARGET=public` for public domains
- `ROOIAM_SERVER_URL` must match the real public URL of `rooiam-server`
- `ROOIAM_APP_URL` must match the real public URL of `rooiam-app`
- `ROOIAM_ADMIN_URL` must match the real public URL of `rooiam-admin`
- `ROOIAM_COOKIE_SECURE=true` for public deployments

## 🗄️ Run Database Migrations

```bash
cd rooiam/rooiam-server
sqlx migrate run --database-url "$ROOIAM_DATABASE_URL"
```

## 🚀 Start the Server

```bash
cd rooiam/rooiam-server
SQLX_OFFLINE=true cargo run
```

On startup, the server prints a configuration summary including whether it is running in demo or normal mode.

## 🖥️ Start `rooiam-admin`

```bash
cd rooiam/rooiam-admin
npm install
npm run dev
```

In production, serve the built app behind your reverse proxy:

```bash
npm run build
```

## 🧙 Open the Setup Wizard

Go to your admin surface:

- `https://admin.example.com`

First-time operator tasks:

1. Create the first platform admin user
2. Confirm public URLs
3. Configure SMTP
4. Configure Google OAuth
5. Configure Microsoft OAuth
6. Mark setup complete

## 👤 First Admin Account

The first admin created in the setup wizard is the platform operator account.

This account belongs to:

- `rooiam-admin`

This account is not the same as:

- tenant owner/admin in `rooiam-app`
- customer/client users in downstream apps

## ✅ After Setup

Once setup is complete, use `rooiam-admin` for:

- user review
- organization review
- audit logs
- OAuth provider configuration
- instance settings

Use `rooiam-app` only for tenant/company operations.
