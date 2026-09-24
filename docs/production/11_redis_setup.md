# Redis for Rooiam

Rooiam uses Redis for short-lived verification state and rate limiting. PostgreSQL remains the durable source of truth. The repository's example `docker-compose.prod.yml` runs `redis:7-alpine` on an internal Compose network with a persistent `redis_data` volume and a readiness check. It does **not** expose port 6379 to the public network.

Set `ROOIAM_REDIS_URL` in the server's protected environment. If your Redis deployment uses a password, configure it in Redis and in this URL; do not assume the example Compose service already enables authentication. Restrict access at the network layer in either case. Use TLS when a provider or remote network requires it.

If Redis restarts or its data is lost, outstanding magic links, OAuth tickets and rate-limit counters may become unusable or reset. Users should request a fresh sign-in link or start a new OAuth flow. Do not restore old transient tickets into a newer production state. `/ready` returns 503 while Redis is unavailable, so investigate the Redis service and network before routing traffic to Rooiam again.

For upgrade and incident steps, see [Backup, Restore and Upgrade](./25_backup_restore_and_upgrade.md). Redis persistence is an operator choice; it does not replace PostgreSQL, MinIO or configuration backups.
