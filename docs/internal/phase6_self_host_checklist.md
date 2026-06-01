# Phase 6 Self-Host Checklist

This checklist tracks the work required to move Rooiam from a source-first project to a deliberate self-hostable product.

Current state:

- local source setup is documented and usable
- PostgreSQL, Redis, SMTP, runtime URLs, and demo seed setup are documented
- the checked-in `docker-compose.yml` is only a Mailhog helper, not a full deployment stack

## Packaging

- [ ] production `docker-compose.yml` for:
  - `rooiam-server`
  - PostgreSQL
  - Redis
  - SMTP or documented SMTP dependency
  - reverse proxy / TLS entrypoint example
- [ ] versioned `.env` template for local development
- [ ] versioned `.env` template for production
- [ ] container image build instructions
- [ ] healthcheck and readiness probes
- [ ] persistent volume layout documented

## Operator Docs

- [ ] fresh-machine install guide
- [ ] upgrade / migration guide between releases
- [ ] backup / restore guide for PostgreSQL and Redis
- [ ] reverse proxy examples for Caddy, nginx, or Traefik
- [ ] TLS / domain setup guide
- [ ] troubleshooting guide for SMTP, OAuth callbacks, cookies, and CORS
- [ ] operator security checklist

## Productization

- [ ] one-command local install bootstrap
- [ ] release checklist for self-host operators
- [ ] seed/demo mode separation from production defaults
- [ ] sample production config for cookie domain, secure cookies, issuer URL, and hosted login URL
- [ ] runtime verification checklist for a newly deployed instance

## Exit Criteria

- a small team can deploy Rooiam without reading the Rust source first
- production upgrades are documented and predictable
- backups and rollback paths are explicit
- deployment defaults feel intentional rather than improvised
