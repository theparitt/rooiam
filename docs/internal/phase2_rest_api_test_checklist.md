# Phase 2 REST API Test Checklist

This checklist is the regression baseline for Rooiam's Phase 2 developer-platform work.

Scope:

- OAuth / OIDC protocol lifecycle
- client registration and secret lifecycle
- public-client PKCE enforcement
- token revocation and introspection

This is intentionally API-focused. SDKs, public integration docs, and UI verification are tracked separately.

## Test Environment

- `ROOIAM_ENABLE_DEMO_SEED=true`
- local API on `http://127.0.0.1:5170`
- demo owner session created through:
  - `POST /v1/setup/demo-login`
  - body: `{ "email": "rooroo@sweetfactory.demo" }`

Why that account:

- it owns seeded demo workspaces
- it can create and rotate workspace-scoped OAuth clients

## OIDC Discovery

- [x] `GET /.well-known/openid-configuration` returns `authorization_endpoint`
- [x] returns `token_endpoint`
- [x] returns `userinfo_endpoint`
- [x] returns `jwks_uri`
- [x] returns `revocation_endpoint`
- [x] returns `introspection_endpoint`
- [x] `grant_types_supported` includes `authorization_code`
- [x] `grant_types_supported` includes `refresh_token`

## Personal Client Management

- [x] create personal `web` client succeeds
- [x] response returns `client.client_id`
- [x] response returns one-time `client_secret`
- [x] redirect URIs are normalized and persisted
- [x] `POST /v1/clients/{id}/rotate-secret` succeeds for owned `web` client
- [x] rotate response returns new `client_secret`
- [x] rotate does not require recreating the client
- [x] rotate fails cleanly for non-owned client
- [x] rotate fails cleanly for `spa`
- [x] rotate fails cleanly for `native`

## Workspace Client Management

- [x] create workspace `web` client succeeds at `POST /v1/orgs/current/clients`
- [x] response returns one-time `client_secret`
- [x] workspace client appears in `GET /v1/orgs/current/clients`
- [x] `POST /v1/orgs/current/clients/{id}/rotate-secret` succeeds for `web` client
- [x] rotate response returns new `client_secret`
- [x] rotate fails cleanly for non-manager member
- [x] rotate fails cleanly for `spa`
- [x] rotate fails cleanly for `native`
- [x] paused workspace client cannot rotate until resumed
- [x] workspace client status endpoint returns updated `active` / `paused` state

## PKCE Enforcement

- [x] public `spa` client authorization without PKCE is rejected
- [x] public `spa` client must use `code_challenge_method=S256`
- [x] authorization code exchange succeeds with valid verifier
- [x] public `native` client PKCE enforcement rechecked explicitly
- [x] invalid verifier returns OAuth-style error body

## Authorization Code Flow

- [x] `GET /v1/oidc/authorize` succeeds for valid client and session
- [x] authorization code can be exchanged at `POST /v1/oidc/token`
- [x] token response contains access token
- [x] token response contains ID token
- [x] token response contains refresh token for eligible client
- [x] `POST /v1/oidc/userinfo` succeeds with returned access token

## Refresh Token Lifecycle

- [x] `grant_type=refresh_token` succeeds with valid refresh token
- [x] new access token is issued
- [x] refresh-token grant is advertised in discovery
- [ ] refresh rotation behavior rechecked explicitly if rotation policy changes

## Revocation

- [x] `POST /v1/oidc/revoke` succeeds for refresh token
- [x] revoked refresh token cannot be reused
- [x] revoked refresh token returns `invalid_grant` on reuse
- [ ] revoke with wrong client credentials returns `invalid_client`

## Introspection

- [x] `POST /v1/oidc/introspect` returns `active: true` for valid access token
- [x] `POST /v1/oidc/introspect` returns `active: true` for valid refresh token
- [x] revoked refresh token introspection returns `active: false`
- [x] wrong client credentials return `invalid_client`

## Redirect URI Safety

- [x] redirect URIs are validated through shared normalization logic
- [x] invalid redirect URI shape is rejected on client creation
- [ ] localhost policy rechecked for public clients
- [ ] duplicate redirect URI handling rechecked explicitly

## Error Semantics

- [x] token endpoint returns OAuth-style errors for core invalid cases
- [x] revoke endpoint returns OAuth-style errors for core invalid cases
- [x] authorize endpoint error semantics standardized and rechecked
- [ ] `invalid_scope` path tested if scopes become configurable

Current note:

- `invalid_scope` remains deferred because scopes are still fixed to the built-in OIDC set and are not yet caller-configurable.
- Personal non-owner rotate currently returns `404 Not Found: Client not found.`, which is acceptable because owned personal clients are intentionally hidden from other users.
- Workspace non-manager rotate/status currently returns `403 Forbidden`, which is acceptable because workspace membership is known but management permission is missing.

## UI Surface Follow-Through

- [x] admin client-management UI can create confidential clients
- [x] admin client-management UI can rotate confidential client secrets from the platform-wide app inventory
- [x] tenant workspace app UI can create confidential clients
- [x] tenant workspace app UI can rotate workspace client secrets
- [x] new and rotated secrets are shown once with copy affordance

## Before Calling Phase 2 API-Ready

Ship gate:

- [ ] all unchecked negative-path tests above pass
- [ ] examples for authorize/token/userinfo/revoke/introspect are published
- [ ] first developer-facing integration guide is published
- [ ] first SDK/helper package is published
