# Troubleshooting Guide

Use this section when a flow works in theory but fails in your environment.

Use these pages in order:

1. [Install Checks](./01_install_checks.md)
2. [Demo Startup Failures](./02_demo_startup_failures.md)
3. [Login, Mailhog, And OAuth Problems](./03_login_mailhog_and_oauth.md)
4. [Hosted Login Widget Loading Stuck](./04_hosted_login_widget_loading_stuck.md)
5. [Storage Config Stuck In Database](./05_storage_config_in_database.md)

## Common Topics

- machine dependencies missing
- PostgreSQL or Redis not running
- Mailhog not running
- magic link email not arriving
- OAuth callback mismatch
- CORS and cookie problems
- passkey or MFA enrollment issues
- slow local demo or portal loading
- hosted login widget loading stuck or redirecting incorrectly
- MinIO / storage env vars ignored because database has stale values

## Start With

1. confirm public URLs
2. confirm SMTP mode (`demo` vs `normal`)
3. confirm provider callback URLs
4. confirm browser cookies are being set
5. confirm the current surface:
   - `rooiam-admin`
   - `rooiam-app`
   - `candycloud-web`

## Related Docs

- [Getting Started](../getting-started/00_index.md)
- [Run the Demo Locally](../getting-started/01_run_demo_locally.md)
- [Hosted Login URLs](../hosted_login_urls.md)
- [OAuth Provider Setup](../oauth_provider_setup.md)
- [Production Guide](../production/00_index.md)
- [Demo Account Map](../demo/01_accounts_and_surfaces.md)
- [Hosted Login Widget Integration](../reference/04_hosted_login_widget_integration.md)
