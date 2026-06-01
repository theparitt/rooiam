# Run the Full Local Development Stack

Use this guide if you want a normal working local environment for development, not just the quickest demo.

## 1. Install Dependencies

You need to install the following core tools on your machine:

- **PostgreSQL 16+**: The database ([Download here](https://www.postgresql.org/download/))
- **Redis 7+**: The in-memory cache ([Download here](https://redis.io/download/))
- **Rust 1.88.0+**: The programming language compiler ([Install via rustup](https://rustup.rs/))
- **Node.js 20+ & npm**: For the frontend apps ([Download here](https://nodejs.org/))

Optional (but recommended for testing emails and uploads locally):

- **Docker Desktop**: ([Download here](https://www.docker.com/products/docker-desktop/))

Recommended tested local baseline:

| Tool | Minimum | Notes |
| :--- | :--- | :--- |
| Rust | `1.88.0` | Pinned in repo via `rust-toolchain.toml` |
| Node.js | `20` | Used by all frontend apps and examples |
| npm | bundled with Node 20 | No separate version policy right now |
| PostgreSQL | `16` | Matches the Docker images shipped in this repo |
| Redis | `7` | Matches the Docker images shipped in this repo |
| MinIO | current Docker image | Easiest local path is Compose |
| Mailhog | `v1.0.1` | Used for local magic-link capture |
| Docker Compose | current Docker Desktop plugin | Recommended full-stack path |

Check that your machine has the tools installed by running:

```bash
psql --version
redis-server --version
cargo --version
node --version
npm --version
docker compose version
```

## 2. Clone The Repo

```bash
git clone https://github.com/theparitt/rooiam
cd rooiam
```

## 3. Create The Server Configuration

Create a new plain text file named `.env` specifically inside the `rooiam-server/` directory, and paste the following into it:

```env
# ── Mode ──────────────────────────────────────────────────────────────────────
ROOIAM_MODE=production
ROOIAM_DEPLOY_TARGET=local

# ── Server ────────────────────────────────────────────────────────────────────
ROOIAM_HOST=0.0.0.0
ROOIAM_PORT=5170

# ── Public URLs (must match browser entrypoints) ──────────────────────────────
ROOIAM_SERVER_URL=http://localhost:5170
ROOIAM_ADMIN_URL=http://localhost:5171
ROOIAM_APP_URL=http://localhost:5172
ROOIAM_LANDING_URL=http://localhost:5173

# ── Browser Security ────────────────────────────────────────────────────────────
ROOIAM_ALLOWED_ORIGINS=http://localhost:5171,http://localhost:5172,http://localhost:5173,http://localhost:5175,http://localhost:5176,http://localhost:5184

# ── Security ────────────────────────────────────────────────────────────────────
ROOIAM_COOKIE_SECURE=false

# ── Database / Cache ────────────────────────────────────────────────────────────
ROOIAM_DATABASE_URL=postgres://rooiam:yourpassword@127.0.0.1:5432/rooiam
ROOIAM_REDIS_URL=redis://127.0.0.1:6379

# ── Storage ─────────────────────────────────────────────────────────────────────
ROOIAM_STORAGE_ROOT=./storage
ROOIAM_PUBLIC_MEDIA_BASE=/media
```

### Environment Variable Reference

| Variable | Description | Scope / Example |
| :--- | :--- | :--- |
| `ROOIAM_MODE` | Runtime mode | `production`, `demo`, or `test` |
| `ROOIAM_DEPLOY_TARGET` | Deployment target | `local` or `public` |
| `ROOIAM_DATABASE_URL` | Tells the server how to talk to PostgreSQL. | `postgres://user:pass@host:port/dbname` |
| `ROOIAM_REDIS_URL` | Connection for the high-speed session cache. | `redis://127.0.0.1:6379` |
| `ROOIAM_ALLOWED_ORIGINS` | **Critical Security**: A list of URLs allowed to talk to the API. | Must include every frontend URL (app, admin, demo). |
| `ROOIAM_SERVER_URL` | Public API / issuer URL | Usually `http://localhost:5170` in dev. |
| `ROOIAM_STORAGE_ROOT` | Where uploaded profile pictures are saved on disk. | A folder path like `./storage`. |
| `ROOIAM_COOKIE_SECURE` | Secure cookies for HTTPS | `false` for local, `true` for production |

---

## 4. Run Migrations

Before you can use Rooiam, you must tell the database to create the "Tables" (the structure) where the users and organizations live.

```bash
cd rooiam-server
cargo install sqlx-cli --locked --no-default-features --features postgres
sqlx migrate run --database-url "$ROOIAM_DATABASE_URL"
```

### Command Flags Explained

| Command | Flag | What it does | Why it's needed |
| :--- | :--- | :--- | :--- |
| `cargo install sqlx-cli` | `--locked` | Uses the tool's locked dependency set. | Avoids accidental dependency drift against your local Rust toolchain. |
| | `--no-default-features` | Disables built-in support for every possible database. | Keeps the tool small; otherwise it tries to install heavy SQLite and MySQL drivers you don't need. |
| | `--features postgres` | Specifically enables only the PostgreSQL driver. | Tells the tool: "I am only using Postgres." |
| `sqlx migrate run` | `--database-url` | Points the tool to your `.env` connection string. | The tool doesn't know where your database is unless you tell it. |

#### Potential Errors Here

- **"Connection Refused"**: This means your PostgreSQL service isn't running. Start it!
- **"Authentication Failed"**: Your password in the URL (`yourpassword`) doesn't match the password you set when installing Postgres.
- **"Command not found: sqlx"**: Make sure your Rust `bin` folder is in your PATH (usually `~/.cargo/bin`).

## 5. Install Dependencies For Every App

```bash
cd rooiam-admin && npm install
cd ../rooiam-app && npm install
cd ../rooiam-landing && npm install
cd ../candycloud-web && npm install
cd ../candycloud-server && npm install
cd ../rooiam-docs && npm install
cd ../rooiam-book && npm install
cd ..
```

## 6. Start The Rust Server

```bash
cd rooiam-server
SQLX_OFFLINE=true cargo run
```

> [!NOTE]
> `SQLX_OFFLINE=true` tells the Rust compiler to use the saved local `.sqlx` cache instead of trying to compile strictly against a live, running database instance. `cargo run` is the standard command that downloads packages, compiles the code, and boots up the web server.

Then verify:

```bash
curl http://localhost:5170/health
```

## 7. Start The Frontends

```bash
bash start_rooiam.sh
```

Then start docs:

```bash
cd rooiam-docs
npm run dev
```

## 8. Open The Local Apps

- `http://localhost:5171` = `rooiam-admin`
- `http://localhost:5172` = `rooiam-app`
- `http://localhost:5173` = `rooiam-landing`
- `http://localhost:5184` = `candycloud-web`
- `http://localhost:5175` = `rooiam-docs` (The guide you are reading now!)
- `http://localhost:5176` = `rooiam-book` (The technical IAM textbook)
- `http://localhost:9001` = `MinIO Console`
- `http://localhost:8025` = `Mailhog inbox` (if running Docker)

## 9. Optional: Start Mailhog and MinIO

If you want local email capture and local S3-compatible storage:

```bash
docker compose up -d
```

Then use:

- Mailhog UI: `http://localhost:8025`
- Mailhog SMTP: `127.0.0.1:1025`
- MinIO Console: `http://localhost:9001` (user: `rooiam`, pass: `rooiam_secret`)

If you use Mailhog in non-demo local development, point your normal `ROOIAM_SMTP_*` settings to it.

## 10. Basic Verification

Run:

```bash
cd rooiam-server && cargo check
cd ../rooiam-admin && npm run build
cd ../rooiam-app && npm run build
cd ../rooiam-landing && npm run build
cd ../candycloud-web && npm run build
cd ../rooiam-docs && npm run build
cd ..
```

Next:

- [Local Setup](../development/01_local_setup.md)
- [Running the Stack](../development/02_running_the_stack.md)
- [Demo Seed vs Normal Mode](../development/03_demo_seed_vs_normal.md)
