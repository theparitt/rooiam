# rooiam-app

The **tenant customer portal** and **hosted login widget** for Rooiam — this is
the surface **your customers** (the businesses using your Rooiam instance) sign
in to and manage.

It serves two things:

1. **Hosted login** (`/`) — the sign-in screen end users hit (magic link, passkey,
   Google, Microsoft), including the **embeddable login widget** that downstream
   apps frame on their own pages.
2. **Tenant portal** (`/workspace/...`, `/tenant/...`, `/my/...`) — where workspace
   owners and admins manage branding, members, API keys, OAuth clients, login
   policy, audit logs, and their own account.

It is **not** the operator console (that's `rooiam-admin`, port 5171/5181) and
**not** the downstream demo app (that's `candycloud-web`, port 5184).

Stack: **React 18 + Vite 5 + TypeScript + Tailwind + React Router**, talking to
the `rooiam-server` REST API.

---

## Quick start

```bash
npm install
npm run dev:prod-local      # → http://localhost:5172  (talks to server on 5170)
```

For demo mode:

```bash
npm run dev:demo-local      # → http://localhost:5182  (talks to server on 5180)
```

---

## Environments (the 4 modes)

The app is configured through `VITE_API_URL` (the `rooiam-server` base URL).
There is one env file per mode, selected with Vite's `--mode` flag.

| Mode | Env file | `VITE_API_URL` | Port |
|------|----------|----------------|------|
| **prod-local** | `.env.prod-local` | `http://localhost:5170/v1` | 5172 |
| **demo-local** | `.env.demo-local` | `http://localhost:5180/v1` | 5182 |
| **prod-online** | `.env.prod-online` | `https://api.rooiam.com/v1` | build only |
| **demo-online** | `.env.demo-online` | `https://demo-api.rooiam.com/v1` | build only |

Two axes:

- **prod vs demo** — which `rooiam-server` instance to hit (real vs seeded demo).
- **local vs online** — localhost dev vs deployed domain.

### How Vite picks the file

The `--mode <name>` flag loads `.env.<name>` (plus the always-loaded `.env` and
the gitignored `.env.local`). The mode string **must** match the file suffix:
`--mode demo-local` → `.env.demo-local`.

Only `VITE_`-prefixed variables are exposed to the browser.

### Ports

The dev port is derived from the mode in `vite.config.ts`:

- `demo-local` → **5182**
- everything else → **5172**

The `dev:*` scripts also pass `--port` explicitly. To override per run:

```bash
npm run dev:demo-local -- --port 5199
```

---

## Scripts

| Script | What it does |
|--------|--------------|
| `npm run dev` | dev server, prod-local mode (default) |
| `npm run dev:prod-local` | dev on **:5172**, prod-local env |
| `npm run dev:demo-local` | dev on **:5182**, demo-local env |
| `npm run build` | typecheck + build, prod-online (default) |
| `npm run build:prod-online` | build for the production domain |
| `npm run build:demo-online` | build for the demo domain |
| `npm run start` | serve the built `dist/` locally (`vite preview`) |
| `npm run pages:deploy` | deploy `dist/` to Cloudflare Pages |

---

## Environment variables

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | `rooiam-server` API base (must include `/v1`) | `http://localhost:5170/v1` |
| `VITE_DOCS_URL` | Documentation site URL (links in the UI) | `http://localhost:5175` |

`.env.local` (gitignored) overrides these locally without editing the committed
mode files.

---

## Project layout

```
src/
  App.tsx                route table (login + portal routes)
  main.tsx               entry
  pages/
    MagicLink.tsx        the hosted login screen + embeddable widget
    Verify.tsx           magic-link / MFA verify
    OAuthCallback.tsx    OAuth return landing
    AcceptInvite.tsx     workspace invite acceptance
    PortalHome.tsx       tenant portal shell + data loading
    portal/              one file per portal section (workspace / tenant / my)
  components/portal/     shared portal UI (cards, fields, tables, login widget)
  lib/                   api client, tenant context, routes, helpers
  hooks/
```

Route scopes:

- `/` — hosted login (also embedded as the login widget)
- `/workspace/:slug/...` — a workspace's settings (branding, members, apps, …)
- `/tenant/...` — tenant-wide (workspaces list, access, audit logs, settings)
- `/my/...` — the signed-in user's own account

---

## Notes

- This app needs a running `rooiam-server` at `VITE_API_URL`. Start the backend
  first (`cd ../rooiam-server && cargo run`).
- The **login widget** is rendered by the server (`/login-widget`) and embedded
  here as an iframe for preview. Routing/redirect values come from the server and
  the registered app config, not from the client.
- For demo mode the server runs on **5180** and seeds demo workspaces; sign in
  with a seeded tenant account (e.g. `rooroo@sweetfactory.demo`). Magic-link
  emails land in Mailhog at `http://localhost:8025`.
