# Production Guide

> [!WARNING]
> **Undergrad Preface: Welcome to Production!**
> This folder contains guides for actually hosting Rooiam on the public internet. If you are new to backend architecture, here is a quick "cheat sheet" for the advanced terms you will see in these guides:
> - **Multi-Tenancy**: Think of Slack or Discord. One single server hosts thousands of different isolated companies ("Tenants"). Rooiam is built to let you host thousands of different companies securely.
> - **OAuth / OIDC**: This is the universal technology behind buttons that say "Sign in with Google" or "Sign in with Apple".
> - **DKIM / SPF**: When you send emails from your own server (like "magic login links"), Gmail and Outlook will throw them in the Spam folder unless you cryptographically prove you own the domain. DKIM and SPF are just standard DNS text records you add to your website to prove you aren't a spammer.
> - **Trust Boundary**: A fancy way of saying "Who is allowed to configure what?". In Rooiam, **Platform Admins** (you) configure global things like Google API keys and Database URLs, while **Tenant Admins** (your customers) just configure their own logo and company users.
> 
> *If you're just trying to learn how to code, you do NOT need to do any of this—stick to the Local Development guides!*

This guide is the operator and tenant-admin path for running Rooiam in a real environment.

If you want the quickest Docker-based operator path first, start with:

- [Quickstart With Docker](../getting-started/05_quickstart_with_docker.md)

Use it in this order:

1. [Platform Setup](./01_platform_setup.md)
2. [SMTP & Email Delivery](./02_smtp_mailcow.md)
3. [Google and Microsoft OAuth](./03_oauth_setup.md)
4. [Create the First Tenant](./04_first_tenant.md)
5. [Tenant Branding and Hosted Login](./05_tenant_branding_and_login.md)
6. [Passkey and MFA Policy](./06_passkey_and_mfa.md)
7. [API Keys and OAuth Clients](./07_api_keys_and_clients.md)
8. [Embedded Login](./08_embedded_login.md)
9. [Users, Sessions, and Device Access](./09_user_sessions_and_support.md)
10. [PostgreSQL Setup](./10_postgres_setup.md)
11. [Redis Setup](./11_redis_setup.md)
12. [MinIO Setup](./12_minio_setup.md)
13. [Hosted Widget Host-Page Security Checklist](./13_widget_host_page_security.md)
14. [Session And Cookie Doctrine](./14_session_and_cookie_doctrine.md)
15. [0.1 Release Security Checklist](./15_release_security_checklist.md)
16. [Security Operations Playbook](./16_security_operations_playbook.md)
17. [Security Architecture Diagram](./17_security_architecture_diagram.md)
18. [Auth Models By Surface](./18_auth_models_by_surface.md)
19. [Operator Runbooks](./19_operator_runbooks.md)
20. [Operator Guides](./20_operator_guides.md)
21. [Rate Limits And Abuse Protection](./21_rate_limits_and_abuse_protection.md)
22. [API And SDK Smoke Checklist](./22_api_and_sdk_smoke_checklist.md)

## Running a Public Demo Instance Alongside Production

If you want to expose a live demo (e.g. `demo.yoursite.com`) while keeping real users on the production instance, run two separate `rooiam-server` processes sharing the same Postgres and Redis:

| Instance | Port | `ROOIAM_MODE` | Purpose |
|---|---|---|---|
| Production API | `5170` | `production` | Real tenants |
| Demo API | `5180` | `demo` | Seeded demo tenants |

The demo frontends (admin `5181`, portal `5182`, demo app `5184`) build with `VITE_API_URL` pointing at the demo server on `5180`. The production frontends (`5171`, `5172`) point at the production server on `5170`.

The demo seed creates fixed tenant slugs (`roochoco`, `mintmallow`). Real production tenants coexist in the same database without conflict.

Key rule: never set `ROOIAM_MODE=demo` on the production server process. The fake OAuth routes (`/v1/oauth/demo/*`) are only registered when that mode is on.

## What This Guide Covers

- production-minded server configuration
- comprehensive email delivery paths (Mailhog vs Mailcow vs Providers)
- OAuth provider registration
- first tenant and workspace setup
- tenant branding and login behavior
- tenant API keys and downstream OAuth client setup
- hosted and embedded login usage
- core caching storage via Redis
- media bucket hosting via MinIO
- primary persistence safety via PostgreSQL

## Product Split

- `rooiam-admin`: platform/operator console
- `rooiam-app`: tenant login and tenant-admin portal
- `candycloud-web` + `candycloud-server`: downstream sample app
- `rooiam-server`: Rust API and session/OIDC/OAuth backend

## Important Current Boundary

Rooiam today separates platform-level settings from tenant-level policy:

- platform operator configures:
  - instance URLs
  - SMTP
  - Google OAuth credentials
  - Microsoft OAuth credentials
- tenant admin configures:
  - branding
  - enabled login methods
  - whether MFA is required
  - company apps and API keys

Tenants do not currently manage their own raw SMTP or OAuth credentials from the tenant UI.

After initial bootstrap is complete, setup configuration is intended to be managed by the signed-in platform superuser through `rooiam-admin`.
