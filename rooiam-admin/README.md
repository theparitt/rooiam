# rooiam-admin

The **platform operator console** for Rooiam — this is the surface **you** (the
platform owner) use to run the whole instance.

Use it for:

- platform setup wizard (first-boot configuration)
- SMTP, Google OAuth, Microsoft OAuth configuration
- system-wide review of every organization, user, and client
- risk policy, session policy, IP policy, storage config
- platform-level audit logs and security alerts

It is **not** the tenant portal (that's `rooiam-app`, port 5172/5182) and **not**
the end-user app (that's `candycloud-web`, port 5184).

Stack: **React 18 + Vite 5 + TypeScript + Tailwind**, talking to the
`rooiam-server` REST API.

---

## Quick start

```bash
npm install
npm run dev:prod-local      # → http://localhost:5171  (talks to server on 5170)
```

For demo mode:

```bash
npm run dev:demo-local      # → http://localhost:5181  (talks to server on 5180)
```

---

## Environments (the 4 modes)

The app is configured entirely through `VITE_API_URL` (the `rooiam-server` base
URL). There is one env file per mode, selected with Vite's `--mode` flag.

| Mode | Env file | `VITE_API_URL` | Ports |
|------|----------|----------------|-------|
| **prod-local** | `.env.prod-local` | `http://localhost:5170/v1` | admin 5171 |
| **demo-local** | `.env.demo-local` | `http://localhost:5180/v1` | admin 5181 |
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

---

## Scripts

| Script | What it does |
|--------|--------------|
| `npm run dev` | dev server, prod-local mode (default) |
| `npm run dev:prod-local` | dev on **:5171**, prod-local env |
| `npm run dev:demo-local` | dev on **:5181**, demo-local env |
| `npm run build` | typecheck + build, prod-online (default) |
| `npm run build:prod-online` | build for the production domain |
| `npm run build:demo-online` | build for the demo domain |
| `npm run preview` | serve the built `dist/` locally |
| `npm run lint` | ESLint (TS/TSX), zero warnings allowed |
| `npm run pages:deploy` | deploy `dist/` to Cloudflare Pages |

### Changing the port

Dev ports are set in the `dev:*` scripts (`--port 5171 --strictPort`). The
defaults also live in `vite.config.ts` (`server.port`). To override per run:

```bash
npm run dev:demo-local -- --port 5199
```

---

## Environment variables

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | `rooiam-server` API base (must include `/v1`) | `http://localhost:5170/v1` |
| `VITE_DOCS_URL` | Documentation site URL (links in the UI) | `http://localhost:5175` |

`.env.local` (gitignored) overrides any of these locally without editing the
committed mode files.

---

## Project layout

```
src/
  App.tsx            route table
  main.tsx           entry
  pages/             one file per screen (Platform*, Tenant*, My*, Setup, Login…)
  components/        shared UI
  lib/               api client, stores, helpers
  hooks/
```

Pages are grouped by scope:

- `Platform*` / `SetupWizard` / `RiskSettings` / `PlatformSettings` — operator-wide
- `Tenant*` — viewing/managing a specific tenant organization
- `My*` — the operator's own account (profile, security, sessions)

---

## Notes

- This app needs a running `rooiam-server` at `VITE_API_URL`. Start the backend
  first (`cd ../rooiam-server && cargo run`).
- For demo mode the server runs on **5180** and seeds demo data; sign in with the
  seeded operator account (`owner@rooiam.demo` / `admin@rooiam.demo`). Magic-link
  emails land in Mailhog at `http://localhost:8025`.
