# Chapter 6: The OIDC Provider

Rooiam can act as an OpenID Connect provider for downstream applications. It issues identity and access tokens while the application retains ownership of its own business data and session lifecycle.

## Authorization code flow

1. The app starts authorization at `/v1/oidc/authorize` with `response_type=code`, `client_id`, a registered `redirect_uri`, and the necessary state/scope/PKCE values.
2. Rooiam resolves login and policy requirements and returns a short-lived authorization code to the registered callback.
3. The client exchanges that code at `/v1/oidc/token` using a form-encoded POST.
4. The app validates the resulting identity and establishes its own session.

Confidential clients authenticate with their client secret. Public clients cannot safely keep a secret and use PKCE. PKCE binds the authorization request to a high-entropy `code_verifier` via its S256 challenge. Applications must also validate their callback state.

Hosted-widget login has a different initiation contract: the widget receives workspace and client identity, while Rooiam selects the registered callback and creates `widget_login_context`. Do not add ordinary OIDC query fields to `/login-widget`.

## Stored state

| Table | Relevant fields |
|---|---|
| `oauth_clients` | `client_id`, `client_secret_hash`, `org_id`, `app_type` |
| `oauth_client_redirect_uris` | `oauth_client_id`, `redirect_uri` |
| `oauth_authorization_codes` | `code_hash`, `oauth_client_id`, `user_id`, `session_id`, `scopes`, PKCE fields, expiry/use timestamps |
| `oauth_refresh_tokens` | `token_hash`, `family_id`, `oauth_client_id`, `session_id`, `rotated_from_id`, expiry/revocation timestamps |

Client secrets use Argon2id. Authorization codes and refresh tokens use SHA-256 hashes of random bearer secrets. Authorization codes expire after five minutes. Code exchange locks the code record and performs validation within a transaction.

## Tokens and discovery

Discovery is at `/.well-known/openid-configuration`; public verification keys are at `/.well-known/jwks.json`. Discover actual endpoint URLs and signing algorithms rather than assuming a fixed configuration.

With RSA configured, tokens use RS256 and clients verify them through JWKS. An HS256 development fallback also exists; it does not publish the symmetric secret in JWKS. Production OIDC integrations should configure RSA signing.

Access-token lifetime defaults to 60 minutes and refresh-token lifetime to 30 days, with effective policy overrides. The token response uses `access_token`, `token_type`, `expires_in`, `refresh_token`, and an optional `id_token`. The initial exchange produces an ID token for an `openid` request; refresh currently returns no new ID token.

## Refresh rotation and concurrency

Each successful refresh revokes the submitted refresh token and creates a successor in the same family. Reusing a revoked token revokes the active tokens in its family. The current implementation takes a PostgreSQL transaction-level advisory lock for that family before rotating or handling reuse.

Clients must serialize refresh attempts and replace their stored refresh token after success. Two independent refreshes with the same old token can trigger reuse protection and invalidate the successor. Automatic retries with an already-used token are not safe.

`/v1/oidc/revoke` and `/v1/oidc/introspect` are also available. Session revocation paths cascade to associated refresh tokens. A downstream app that only verifies a JWT locally must account for its expiry and its own app session; local signature validation is not a live session-revocation check.

## Exercises

1. Find the client, redirect, expiry, use, and PKCE checks in `exchange_code_for_tokens`.
2. Explain why a row lock on one refresh token would not serialize an ancestor replay against a descendant's rotation.
3. Compare discovery and JWKS with and without RSA configuration in an isolated test deployment.

## Follow the source

- [rooiam-server/src/modules/oidc/service.rs](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/src/modules/oidc/service.rs)
- [rooiam-server/src/modules/oidc/handlers.rs](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/src/modules/oidc/handlers.rs)
- [rooiam-server/src/modules/oidc/authorize_tests.rs](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/src/modules/oidc/authorize_tests.rs)
- [rooiam-sdk/spec/openapi.json](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-sdk/spec/openapi.json)
