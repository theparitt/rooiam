![Rooiam](./art/rooiam-logo-wordmark-horizontal-transparent-small.png)

**Open-source passwordless IAM for multi-tenant SaaS — self-hosted, in Rust.**

[![Apache-2.0 License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Built with Rust](https://img.shields.io/badge/built%20with-Rust%20🦀-orange)](https://www.rust-lang.org/)

---

Rooiam is a self-hosted identity stack you run yourself. It is **passwordless by design** — there is no end-user password field, on purpose.

## Why Rooiam?

- 🔑 **Passwordless login** — magic link, passkeys (WebAuthn), Google, Microsoft
- 🏢 **Multi-tenant** — workspaces, team invitations, tenant administration
- 🌐 **Hosted login + login widget** — drop sign-in into your own apps
- 🔌 **OAuth2 / OIDC provider** — delegate auth for your first- and third-party apps
- 🍪 **Opaque session cookies** — HttpOnly, not stateless-JWT over-reliance
- 🔐 **TOTP MFA** + machine-to-machine **workspace API keys**
- 📟 **Audit logs** and suspicious-auth visibility

If you don't see a password field, that's the feature.

## Quick demo

The demo stack runs the API + seeded demo data with Postgres, Redis, MinIO, and Mailhog in Docker:

```bash
docker compose -f docker-compose.demo.yml --env-file .env.docker.public.demo up -d
```

Then open:

| URL | What it is |
|-----|-----------|
| `http://localhost:5180/health` | Demo API (seeded with `roochoco`, `mintmallow` tenants) |
| `http://localhost:8026` | Mailhog inbox (captures magic-link emails) |
| `http://localhost:19001` | MinIO console |

The admin and login UIs are separate frontends — run them in dev (see the docs) or deploy them to your own hosting. The full local stack, ports, and demo accounts are in the [Quickstart](docs/getting-started/05_quickstart_with_docker.md).

## Run it for real

```bash
git clone https://github.com/theparitt/rooiam
cd rooiam
```

- **[Quickstart with Docker](docs/getting-started/05_quickstart_with_docker.md)** — fastest path to a running instance
- **[First production setup](docs/getting-started/03_first_production_setup.md)** — real deployment, your domains
- **[Local development](docs/development/00_index.md)** — build from source (Rust 1.88+, Node 20+, Postgres 16, Redis 7)

## Architecture

Rooiam is one Rust API server (`rooiam-server`) plus React frontends:

```
rooiam-server/   Rust + Actix-Web API + OIDC provider (port 5170)
rooiam-admin/    Platform admin console
rooiam-app/      Tenant login + portal (hosted login)
rooiam-landing/  Public landing page
rooiam-docs/     Documentation site
rooiam-examples/ Integration examples (widget / account / backend)
```

→ [Architecture guide](docs/architecture.md)

## Docs

- [Docs index](docs/00_docs_index.md)
- [Production & operations](docs/production/00_index.md)
- [OAuth provider setup](docs/oauth_provider_setup.md)
- [Identity data boundary](docs/identity_data_boundary.md)
- [Environment variable reference](docs/reference/08_env_var_catalog.md)

## Status

Early-stage but usable for evaluation, internal use, and early adopters. The core IAM, tenant portal, and workspace API-key flows work; production packaging and operator polish continue after `0.1`.

## Security

Found a vulnerability? Please don't open a public issue — see [SECURITY.md](SECURITY.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache-2.0 — see [LICENSE](LICENSE).

---

<sub>Maintainer planning notes live under `docs/internal/` and are not part of the public user path.</sub>
