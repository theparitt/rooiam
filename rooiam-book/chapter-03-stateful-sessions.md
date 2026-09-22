# Chapter 3: Stateful Sessions

HTTP requests do not inherently remember who logged in. Rooiam uses an opaque session cookie backed by PostgreSQL to retain that state and support server-side revocation.

## The cookie format

The fixed cookie name is `rooiam_sid`. Its value is:

```text
<session UUID>.<base64url random secret>
```

The UUID identifies the row. Only a SHA-256 hash of the random secret is stored, in `sessions.session_secret_hash`. The UUID by itself cannot authenticate a request.

`SessionService::verify_opaque_session` parses the two components, loads a valid session by UUID, hashes the supplied secret, and compares it with the stored hash using constant-time comparison.

## Session records and policy

Important columns are `user_id`, `current_org_id`, `session_secret_hash`, `created_at`, `last_seen_at`, `expires_at`, `revoked_at`, and `session_fingerprint`. Later migrations add login-surface and app/workspace context.

The normal session-duration default is seven days. Effective policies can differ by surface and workspace. Expiry, revocation, account status, maximum age, idle timeout, and request policy checks collectively determine whether a request may continue.

`max_concurrent_sessions` can limit active sessions for a user in a workspace. Creating a new session can revoke older sessions. Session revocation paths also revoke associated OIDC refresh tokens; downstream application sessions remain the downstream application's responsibility.

## Cookie attributes

`build_session_cookie` always sets `HttpOnly` and path `/`. Its current SameSite selection is:

| Configuration | SameSite |
|---|---|
| Valid cookie domain configured | `Lax` |
| Host-only and Secure | `None` |
| Host-only and not Secure | `Lax` |

`ROOIAM_COOKIE_SECURE` and `ROOIAM_COOKIE_DOMAIN` affect cookie attributes. Localhost/loopback domain overrides are ignored. There is no environment variable for changing the cookie name.

Cookies on localhost are shared across ports. Use separate browser profiles when testing operator and tenant logins simultaneously. Browser privacy restrictions may also affect third-party iframe cookies; an app-owned session is separate from the Rooiam cookie.

## Fingerprints are signals

`shared/session_fingerprint.rs` hashes a device class and a coarse network subnet: IPv4 `/24` or IPv6 `/48`. It is not a cryptographic proof of device possession. Read the middleware and risk policy to understand how changes are handled rather than assuming every address change automatically revokes a session.

## Exercises

1. Why does exposing the session UUID not reveal the session secret?
2. Trace `get_valid_session` and the authentication middleware to distinguish database validity from request policy checks.
3. Explain why clearing a browser cookie and revoking its database session are different operations.

## Follow the source

- [rooiam-server/src/modules/session/cookie.rs](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/src/modules/session/cookie.rs)
- [rooiam-server/src/modules/session/service.rs](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/src/modules/session/service.rs)
- [rooiam-server/src/modules/session/repository.rs](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/src/modules/session/repository.rs)
- [rooiam-server/src/http/middleware/auth.rs](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/src/http/middleware/auth.rs)
- [rooiam-server/src/shared/session_fingerprint.rs](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/src/shared/session_fingerprint.rs)
