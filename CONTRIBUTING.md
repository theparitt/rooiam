# Contributing to Rooiam

Thanks for your interest in contributing! Rooiam is licensed under the Apache License 2.0 (Apache-2.0) and we welcome PRs, bug reports, and suggestions.

## Ways to Contribute

- **Report bugs** — Open a GitHub issue with steps to reproduce
- **Suggest features** — Open an issue with the `enhancement` label
- **Submit a PR** — See below for guidelines
- **Improve docs** — Edit files in `docs/` and the `rooiam-docs/` site

## Development Setup

The fastest path is Docker:

```bash
git clone https://github.com/theparitt/rooiam
cd rooiam
docker compose --profile demo up --build -d
```

This starts the demo stack with seeded accounts, Mailhog, and all frontends. No Rust toolchain required.

For local source-based development, see [docs/getting-started/02_run_local_development.md](docs/getting-started/02_run_local_development.md).

## Port Reference

| URL | Purpose |
|-----|---------|
| `http://localhost:5170` | API server (prod) |
| `http://localhost:5171` | Admin (prod) |
| `http://localhost:5172` | Portal / login (prod) |
| `http://localhost:5173` | Landing page |
| `http://localhost:5175` | Docs |
| `http://localhost:5176` | Book |
| `http://localhost:5180` | API server (demo) |
| `http://localhost:5181` | Admin (demo) |
| `http://localhost:5182` | Portal / login (demo) |
| `http://localhost:5183` | Demo downstream app |
| `http://localhost:5191` | Example 1 — widget |
| `http://localhost:5192` | Example 2 — account |
| `http://localhost:5193` | Example 3 — backend |
| `http://localhost:8025` | Mailhog inbox |

These ports are fixed. If a service starts on a different port, treat it as a config issue and fix it.

## PR Guidelines

1. **Fork** the repo and create your branch from `main`
2. **Test** your changes locally
3. **Keep PRs focused** — one feature or fix per PR
4. **Update docs** if you change API endpoints or behavior
5. **Don't commit** `.env` files or secrets

## Project Structure

| Directory | Language | Purpose |
|---|---|---|
| `rooiam-server/` | Rust | API server — core business logic |
| `rooiam-server/migrations/` | SQL | PostgreSQL schema |
| `rooiam-admin/` | React + TypeScript | Admin dashboard |
| `rooiam-app/` | React + TypeScript | Login / auth UI and tenant portal |
| `rooiam-landing/` | React + TypeScript | Public landing page |
| `rooiam-docs/` | React + TypeScript | Documentation site |
| `rooiam-book/` | mdBook | IAM architecture textbook |
| `rooiam-demo/` | React + TypeScript | Downstream demo app |
| `rooiam-examples/` | Node.js | Integration examples (widget, account, backend) |
| `docs/` | Markdown | Source documentation files |

## Code Style

- **Rust**: follow `rustfmt` defaults. Run `cargo fmt` before committing.
- **TypeScript**: Prettier defaults. Components use functional style.
- **Commits**: use conventional commits — `feat:`, `fix:`, `docs:`, etc.

## License

By contributing, you agree your contributions are licensed under the Apache License 2.0 (Apache-2.0).
