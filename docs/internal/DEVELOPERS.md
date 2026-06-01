# Rooiam Developer Manual

Welcome to the internal engineering guide. Our mission is building the fastest, tightest, easily self-hosted Rust identity platform on the market.

## The Mental Concept
When interacting with the repository, observe our boundaries strictly:
1. **Actix-Web Handlers** sit above **Application Services**. Services rely on **Repositories**.
2. **PostgreSQL** is the source of truth entirely. There is no business logic locked strictly in Redis. Redis is solely used to TTL state locks and provide rate limiting speed loops.

## Development Workflow
If adding a new product component:
1. Create a migration in `rooiam-server/migrations`. Run `sqlx migrate run`.
2. Construct the data struct reflecting the SQL row in the new module.
3. Keep handlers purely for pulling in paths/body payload parsing, then immediately pass off to a Service (e.g. `EmailService::send(...)`).

## Config Discipline
System and developer config are strict-contract inputs.

- No silent fallback for deployment wiring.
- No extra `ROOIAM_*` env vars.
- No wrong-mode env vars.
- Startup must fail clearly when config is wrong.

See `docs/internal/39_strict_config_contract.md`.

## Security Guarantees We Never Concede
1. We NEVER log plaintext tokens. Only hashes.
2. We NEVER write user JWTs broadly out to the client DOM unless explicitly requested by an Authorization Code exchange for a 3rd party. Within a browser, we lean aggressively into `HttpOnly; Secure; SameSite=Lax` cookies holding Opaque String handles pointing to our PG `sessions` table.
3. Every mutating effect *MUST* issue an Audit table log with an actor, target_id, and json payload of what was shifted. The `AuditService` is mandatory.

## The Stack
We rely very heavily on the Rust ecosystem's best concurrent pillars:
- `tokio` to handle connection blocking.
- `sqlx` driving postgres arrays efficiently.
- `lettre` & `askama` for formatting magic HTML notifications offline.
- Sub-components are strictly broken down.

We welcome PRs that align with this philosophy!
