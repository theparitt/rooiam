# Documentation audit — 2026-09-22

Reviewed against checkout `c20b9edfa8ce23649fd9107b35f9f20e1251b39b`, whose server and SDK package versions remain `0.1.0`. The REST prefix `/v1` is not a release number.

## Scope and corrections

- Reviewed public documentation consumed by `rooiam-docs`, the book, root/component READMEs, deployment instructions, and maintained internal references against local source, migrations, package scripts, and Compose definitions.
- Corrected obsolete `docker-compose.yml` commands, the API/infrastructure versus frontend split, demo image build instructions, host ports, missing env-file prerequisites, and unavailable runtime `sqlx` commands.
- Added complete local demo and production Compose env examples. They were written from the Compose contract, not copied from private deployment files.
- Corrected unsupported server environment settings, explicit runtime mode selection, cookie attributes, Vite env precedence, provider paths, and hosted-widget query parameters.
- Reworked book Chapters 1–12 into shorter source-guided walkthroughs because their purported implementation excerpts included nonexistent tables, columns, functions, and guarantees. Retained the chapter topics, educational explanations, exercises, and relevant diagrams; source links pin the reviewed checkout. Added Chapter 13 to navigation.
- Corrected session format and hashing, role assignments and removed roles, API-key format/presets/revocation, current MFA/passkey tables, audit persistence/retention, and refresh-family concurrency behavior.
- Added a public SDK/device-login reference and updated the SDK README and changelog without inventing a new release.
- Restored the public docs index and fixed repository-root/internal Markdown link resolution. Added `npm --prefix rooiam-docs run check:docs` to check public links, unique routes, and complete book navigation.
- Marked historical planning/status notes as historical through the internal index. Dated reports and roadmaps are not rewritten as claims about today's implementation.

## Implementation limitations found

These are documented findings, not server changes:

1. **Magic-link concurrent redemption:** `AuthService::verify_magic_link` calls `get_valid_magic_link` and then `mark_magic_link_used` separately. The update has no unused-token predicate or checked affected-row count. Sequential replay is rejected, but the current code does not establish an atomic single-consumer guarantee for simultaneous requests. A future server fix should claim the token transactionally and include a concurrent-redemption regression test.
2. **Audit durability:** `AuditService::log` logs database insertion failures and returns without propagating them. There is no audit immutability trigger/hash chain in current migrations. Retention deliberately deletes old rows; webhook delivery is asynchronous without a durable outbox.
3. **Compose feature mappings:** optional server settings such as RSA signing keys and WebAuthn settings require explicit Compose environment/volume mappings. Adding them only to an interpolation env file is insufficient.
4. **Refresh clients:** server family locking and reuse detection mean clients must serialize refresh requests. A second request with an already-consumed refresh token can invalidate the successor family.

## Validation

- `rooiam-docs`: TypeScript and Vite production build passed.
- `rooiam-book`: Next.js production build and static export passed, with 13 chapter routes.
- `npm --prefix rooiam-docs run check:docs`: 74 public pages and 13 chapters passed link, route, and navigation checks.
- `npm --prefix rooiam-app run test:integration`: actual portal TypeScript snippet compiled and generated iframe matched the server widget contract.
- Both documented local env blocks passed `docker compose config`, resolving six API/infrastructure services and required runtime variables.
- Public/repository Markdown local link targets and pinned book source references were checked against the filesystem.
- `git diff --check` passed.

Builds report existing Browserslist freshness notices; the docs bundle also exceeds Vite's advisory chunk-size threshold. These are not build failures.

This was a source-based documentation audit, not a live authentication or production deployment certification. No containers were started, no production data was changed, and the unrelated pre-existing change to `cleanup_stale_media_urls.sh` was preserved. External provider accounts, native clients, deployed URLs, and full live API behavior were not exercised.
