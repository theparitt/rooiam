# Rooiam Server v0.1 Quality Checklist

This is the working backend cleanup checklist for `rooiam-server` after reviewing the `0.1.0` code.

The goal is not to rewrite the server.

The goal is to improve the code in a safe order:

1. reduce risk
2. improve readability
3. improve testability
4. keep product work moving

## Current view

The server is already serious enough for `0.1`.

Strong parts:

- real domain split
- real auth and policy thinking
- setup, admin, tenant, identity, OIDC, MFA, and session flows already exist
- mode handling is centralized enough to improve

Weak parts:

- some handler files are much too large
- some APIs are broader than the UI actually needs
- integration testing is still thin
- startup logic is carrying too many concerns in one place

## Checklist

### 1. Startup and bootstrap cleanup

Goal:

- make startup logic easier to read
- avoid mode confusion in startup flow
- avoid noisy localhost-only logs in hosted runs

Tasks:

- gate demo seed and test seed clearly by mode
- move startup-only orchestration into small helper functions
- print local URL matrix only when the server is running in a local shape
- keep hosted startup logs based on actual configured URLs
- move top-level module declarations from `main.rs` to `lib.rs`
- keep the binary and library Rust crate names distinct so builds and links stay stable

Status:

- done on 2026-04-03

### 2. Narrow setup/admin read models

Goal:

- stop using broad setup payloads where a small policy payload is enough

Tasks:

- review every admin page that reads `/setup/config`
- replace broad reads with smaller purpose-specific endpoints or existing narrow endpoints
- keep secrets on owner-only paths

Status:

- in progress

### 3. Split giant handler files

Goal:

- reduce edit risk
- make review easier
- make tests easier to place

Priority files:

- `modules/organization/handlers.rs`
- `modules/admin/handlers.rs`
- `modules/setup/handlers.rs`
- `modules/oauth/handlers.rs`
- `modules/auth/handlers.rs`

Tasks:

- split by feature surface, not by random size
- keep route registration stable
- move pure business logic into service or shared modules
- first safe extraction done:
  - moved setup/admin access guards out of `setup/handlers.rs`
- second safe extraction done:
  - moved setup diagnostics and public-url helper logic out of `setup/handlers.rs`
- third safe extraction done:
  - moved setup settings/state helpers out of `setup/handlers.rs`
- fourth safe extraction done:
  - moved setup request and response payload types out of `setup/handlers.rs`
- fifth safe extraction done:
  - moved setup timing/logging helpers out of `setup/handlers.rs`
- sixth safe extraction done:
  - moved setup demo/workspace helper logic out of `setup/handlers.rs`
- seventh safe extraction done:
  - moved setup public auth/bootstrap loading out of `setup/handlers.rs`
- eighth safe extraction done:
  - moved setup demo app catalog/config handlers out of `setup/handlers.rs`
- ninth safe extraction done:
  - moved admin access guards, list-query helpers, and demo filters out of `admin/handlers.rs`
- tenth safe extraction done:
  - centralized repeated admin demo-visibility checks for users, organizations, and clients
- eleventh safe extraction done:
  - moved admin policy and governance handlers out of `admin/handlers.rs` into `admin/policies.rs`
- twelfth safe extraction done:
  - moved admin session policy handlers out of `admin/handlers.rs` into `admin/session_policies.rs`
- thirteenth safe extraction done:
  - moved admin risk policy and platform security-alert review handlers out of `admin/handlers.rs` into `admin/risk.rs`
- fourteenth safe extraction done:
  - moved admin storage config handlers out of `admin/handlers.rs` into `admin/storage.rs`
- fifteenth safe extraction done:
  - moved organization workspace-integration API-key context helpers and the first read-only integration endpoints out of `organization/handlers.rs` into `organization/integration.rs`
- sixteenth safe extraction done:
  - moved organization workspace-integration auth-config read endpoint out of `organization/handlers.rs` into `organization/integration.rs`
- seventeenth safe extraction done:
  - moved organization workspace-integration client read endpoints out of `organization/handlers.rs` into `organization/integration.rs`

Status:

- started on 2026-04-03

### 4. Strengthen auth and policy integration tests

Goal:

- cover real boundary behavior, not only helper functions

Priority flows:

- setup incomplete vs setup complete
- platform owner vs platform admin permissions
- demo mode vs production mode behavior
- magic link login
- OAuth login
- passkey login
- admin MFA requirement

Status:

- not started

Note:

- fixed the cookie env-var test flakiness on 2026-04-03
- normal parallel `cargo test -q` passed again after serializing env access in `modules/session/cookie.rs`

### 5. Reduce handler-side policy decisions

Goal:

- make handlers thin
- make effective policy easier to test

Tasks:

- move reusable policy resolution into service or shared modules
- keep handlers focused on request parsing and response formatting

Status:

- not started

### 6. Clean startup and operator diagnostics

Goal:

- make logs useful in both local and hosted deployments

Tasks:

- remove misleading localhost assumptions from startup output
- keep clear mode banner
- show actual effective public URLs

Status:

- done on 2026-04-03

## Working rule

Do not do big refactors all at once.

For each item:

1. patch one area
2. run verification
3. update this checklist
4. continue
