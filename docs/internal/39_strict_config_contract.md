# Strict Config Contract

This is the rule for **system** and **developer** supplied configuration.

It is intentionally stricter than user input handling.

## Principle

For operator, deployment, and developer-owned configuration:

- no silent fallback
- no unknown variables
- no wrong-mode variables
- no "close enough" interpretation
- fail fast at startup
- report the exact variable and exact reason

If configuration comes from:

- `.env`
- docker compose env
- process environment
- reverse-proxy deployment config
- build/runtime wiring controlled by developers or operators

then it must be exact.

## Split

Rooiam has two different strictness levels:

### 1. System / Developer config

This includes env vars, public URLs, cookie settings, deploy target, mode, storage wiring, SMTP wiring, and OAuth provider credentials.

Rules:

- Missing required config is a startup error.
- Unexpected `ROOIAM_*` env vars are a startup error.
- Vars present in the wrong mode are a startup error.
- Local/public mismatch is a startup error.
- The server must not silently reinterpret bad config into "something usable".

### 2. User input

User input is different.

Examples:

- query parameters from browsers
- form payloads
- callback inputs from OAuth providers
- tenant-managed branding and workspace settings

Rules:

- validate strictly
- reject clearly
- return user-facing errors
- do not convert user mistakes into server startup failures

## Current Contract

The server startup now enforces:

- explicit `ROOIAM_MODE`
- explicit `ROOIAM_DEPLOY_TARGET`
- explicit local/public URL expectations
- explicit cookie security expectations
- rejection of unexpected runtime `ROOIAM_*` env vars
- rejection of wrong-mode env vars such as demo-only vars in production mode

## Operational Rule

If you need a new environment variable:

1. Add it deliberately in code.
2. Add it to the allowed env contract.
3. Add it to the canonical env files.
4. Add it to docs.
5. Only then use it in deployment.

Do not "just pass one more env var" and hope startup ignores it.

## Design Rule

For system/dev-owned config:

> Exact or error.

For user-owned input:

> Validate, reject clearly, and keep the server running.
