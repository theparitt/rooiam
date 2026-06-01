# 🗄️ PostgreSQL Setup

This guide explicitly covers how to stand up PostgreSQL for Rooiam if you are not using a managed database provider (like AWS RDS or Supabase).

Because PostgreSQL is the absolute core **Source of Truth** for all Tenant Policies, Users, Sessions, and API keys, setting it up robustly is critical.

## 1. Basic Docker Compose Definition

If you are hosting Rooiam entirely via Docker on a single VPS, here is the standard PostgreSQL block to include in your `docker-compose.yml`:

```yaml
services:
  rooiam-db:
    image: postgres:15-alpine
    restart: always
    environment:
      POSTGRES_USER: rooiam
      POSTGRES_DB: rooiam
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - rooiam_db_data:/var/lib/postgresql/data
    ports:
      # Only expose this port locally to the host, NOT the public internet.
      # Exposing 5432 publicly without a firewall is a critical security risk.
      - "127.0.0.1:5432:5432"

volumes:
  rooiam_db_data:

### Understanding the Parameters

| Variable | Description | Value used in demo |
| :--- | :--- | :--- |
| `POSTGRES_DB` | The name of the database that will be created on startup. | `rooiam` |
| `POSTGRES_USER` | The administrative user (Owner) for this database. | `rooiam` |
| `POSTGRES_PASSWORD` | **Critical Security**: The master password for the user. | `your_secure_password` |

### Networking: Why `127.0.0.1`?

In the `ports` section (`- "127.0.0.1:5432:5432"`), we explicitly bind to the "Loopback" address. 

* **If you use `127.0.0.1`**: Only apps running on this exact machine can talk to the database. This is **Safe**.
* **If you use `0.0.0.0`**: Anyone on the internet who knows your IP can try to hack your database. This is **Dangerous**.

---

You **must** use a cryptographically strong password for your database user, because Rooiam will constantly hit this database directly via its connection pool.

Generate a password using OpenSSL or any secure tool:
```bash
openssl rand -hex 32
```

Add this to your `.env.docker.prod` file:
```env
POSTGRES_PASSWORD=your_32_character_hex_password
```

## 3. Connecting Rooiam to the Database

Once the database is running, the Rust `rooiam-server` needs the fully formed connection string. 

Inside the Rooiam server `.env`, format your `ROOIAM_DATABASE_URL` like so:
```env
ROOIAM_DATABASE_URL=postgres://rooiam:your_32_character_hex_password@rooiam-db:5432/rooiam
```
*(Note: Use `rooiam-db` instead of `127.0.0.1` if you are using Docker's internal networking resolution).*

## 4. Running Migrations

Rooiam utilizes strict SQL mappings. When you start the Postgres database with an empty volume, the server will not function until the schema migrations are applied.

Before booting the Rooiam server code, run the SQLx migrations:
```bash
cd rooiam-server
cargo install sqlx-cli --no-default-features --features postgres
sqlx migrate run --database-url "$ROOIAM_DATABASE_URL"
```

## 5. Production Checks
- **Automated Backups**: You should periodically run `pg_dump` on the `rooiam_db_data` volume and stream the backups to an external S3 bucket.
- **Connection Limits**: Rooiam's Rust API opens a fast asynchronous connection pool. You may need to tune Postgres's `max_connections` parameter directly in `postgresql.conf` if you scale up beyond hundreds of concurrent active backend requests.
