# PostgreSQL for Rooiam

PostgreSQL is Rooiam's source of truth for identities, workspaces, policies, sessions and keys. Choose a maintained PostgreSQL major version and pin it for each environment. The repository's example `docker-compose.prod.yml` currently uses `postgres:16-alpine`; an externally managed production database may run a different version. Use the **running server's** version when selecting backup/restore tools.

For a single-host Compose installation, the `postgres` service uses a persistent `postgres_data` volume and the `POSTGRES_DB`, `POSTGRES_USER` and `POSTGRES_PASSWORD` variables. It is reachable from the Rooiam server on the internal Compose network. Do not publish port 5432 to the internet. An external database must similarly be reachable only through a protected network and use TLS where required by the provider.

Configure `ROOIAM_DATABASE_URL` for the running server. Keep its password in a protected environment or secret file, never in Git. The server checks the connection and applies bundled SQLx migrations **on startup**; do not separately run `sqlx migrate run` against production unless a specific release runbook calls for it. Applied migration checksums are verified, so never edit old migrations or `_sqlx_migrations` to make startup pass.

Before changing the server image, make a custom-format dump, verify its checksum and perform a **full restore** in an isolated database. Follow [Backup, Restore and Upgrade](./25_backup_restore_and_upgrade.md) for commands, secret handling and rollback rules. Back up MinIO objects and operator secrets separately; the database dump cannot recover those.

Watch PostgreSQL connections, available disk space and backup/restore verification. `/ready` returns 503 if PostgreSQL or Redis is unavailable. If the database is down, fix the underlying service before retrying login or changing policy; repeated browser retries do not repair the database.
