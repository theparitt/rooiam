# Local Setup

## Prerequisites

- PostgreSQL 14+
- Redis
- Rust toolchain
- Node.js 18+
- optional Mailhog

## Clone the Repo

```bash
git clone https://github.com/theparitt/rooiam
cd rooiam
```

## Server Environment

Example local `.env`:

```env
# ── Mode ──────────────────────────────────────────────────────────────────────
ROOIAM_MODE=demo
ROOIAM_DEPLOY_TARGET=local

# ── Server ────────────────────────────────────────────────────────────────────
ROOIAM_HOST=0.0.0.0
ROOIAM_PORT=5170

# ── Public URLs ────────────────────────────────────────────────────────────────
ROOIAM_SERVER_URL=http://localhost:5170
ROOIAM_ADMIN_URL=http://localhost:5171
ROOIAM_APP_URL=http://localhost:5172

# ── Browser Security ────────────────────────────────────────────────────────────
ROOIAM_ALLOWED_ORIGINS=http://localhost:5171,http://localhost:5172,http://localhost:5173,http://localhost:5175,http://localhost:5176
ROOIAM_COOKIE_SECURE=false

# ── Database / Cache ────────────────────────────────────────────────────────────
ROOIAM_DATABASE_URL=postgres://rooiam:yourpassword@127.0.0.1:5432/rooiam
ROOIAM_REDIS_URL=redis://127.0.0.1:6379

# ── Demo SMTP ────────────────────────────────────────────────────────────────────
ROOIAM_DEMO_SMTP_HOST=127.0.0.1
ROOIAM_DEMO_SMTP_PORT=1025
ROOIAM_DEMO_SMTP_FROM=demo@rooiam.local
```

## Frontend Environment Files

Each frontend app reads its config from a `.env.local` file in its own directory. Vite loads `.env.local` automatically — it overrides `.env` and is gitignored.

### Normal (Linux / Mac — localhost works)

Create `.env.local` in each app directory:

**`rooiam-admin/.env.local`**
```env
VITE_API_URL=http://localhost:5170/v1
VITE_DOCS_URL=https://docs.rooiam.com
```

**`rooiam-app/.env.local`**
```env
VITE_API_URL=http://localhost:5170/v1
VITE_DOCS_URL=https://docs.rooiam.com
```

**`candycloud-web/.env.local`**
```env
VITE_API_URL=http://localhost:5185/v1
VITE_LOGIN_WIDGET_URL=http://localhost:5180
```

**`candycloud-server`** — copy `.env.example` to `.env`:
```env
CANDYCLOUD_PORT=5185
ROOIAM_API_URL=http://localhost:5180/v1
CANDYCLOUD_REDIS_URL=redis://localhost:6379
CANDYCLOUD_COOKIE_SECURE=false
CANDYCLOUD_ALLOWED_ORIGINS=http://localhost:5184
```

**`rooiam-landing/.env.local`** (optional — uses hardcoded fallbacks)
```env
VITE_DOCS_URL=http://localhost:5175
```

**`rooiam-docs/.env.local`** (optional — uses hardcoded fallbacks)
```env
VITE_BOOK_URL=http://localhost:5176
```

---

### WSL2 on Windows — localhost forwarding broken

WSL2 randomly breaks `localhost` forwarding from Windows browsers to WSL services. Symptom: the page loads but all API calls hang forever (CORS errors or no response).

**Diagnosis:** run `hostname -I` in WSL to get your WSL IP (e.g. `172.31.88.196`), then test `http://<WSL-IP>:5170/v1/identity/me` — if that returns JSON but `localhost:5170` hangs, WSL forwarding is broken.

**Fix option 1 — use WSL IP directly in `.env.local`** (replace `172.31.88.196` with your actual WSL IP):

```env
VITE_API_URL=http://<WSL-IP>:5170/v1
VITE_DOCS_URL=https://docs.rooiam.com
```

Also add the WSL IP origins to `ROOIAM_ALLOWED_ORIGINS` in `rooiam-server/.env`:
```env
ROOIAM_ALLOWED_ORIGINS=http://localhost:5171,http://localhost:5172,http://localhost:5173,http://localhost:5175,http://localhost:5176,http://<WSL-IP>:5171,http://<WSL-IP>:5172,http://<WSL-IP>:5173
```

Then open the app at `http://<WSL-IP>:5172` in your Windows browser.

**Fix option 2 — restore localhost forwarding** (run in Windows PowerShell as Administrator):

```powershell
$ip = (wsl hostname -I).Trim().Split(" ")[0]
netsh interface portproxy add v4tov4 listenport=5170 listenaddress=127.0.0.1 connectport=5170 connectaddress=$ip
netsh interface portproxy add v4tov4 listenport=5171 listenaddress=127.0.0.1 connectport=5171 connectaddress=$ip
netsh interface portproxy add v4tov4 listenport=5172 listenaddress=127.0.0.1 connectport=5172 connectaddress=$ip
netsh interface portproxy add v4tov4 listenport=5173 listenaddress=127.0.0.1 connectport=5173 connectaddress=$ip
netsh interface portproxy add v4tov4 listenport=5175 listenaddress=127.0.0.1 connectport=5175 connectaddress=$ip
netsh interface portproxy add v4tov4 listenport=5176 listenaddress=127.0.0.1 connectport=5176 connectaddress=$ip
```

Re-run this script after every WSL restart (the WSL IP changes each time).

> **Note:** The `.env.local` files are gitignored. Never commit them — they contain machine-specific URLs and may contain secrets.

---

## Migrations

```bash
cd /home/theparitt/work/rooiam/rooiam-server
cargo install sqlx-cli --no-default-features --features postgres
sqlx migrate run --database-url "$ROOIAM_DATABASE_URL"
```
