# Session And Cookie Doctrine

This page defines the intended Rooiam session-cookie model for `0.1`.

## 1. Core Rule

Rooiam uses a server-stored opaque session.

The browser cookie only carries:

- session id
- raw session secret

The server stores:

- hashed session secret
- current org context
- login surface metadata
- session timestamps

Rooiam does **not** use browser-stored JWT access tokens for normal app sessions.

## 2. Cookie Flags

`rooiam_sid` should be:

- `HttpOnly`
- `SameSite=Lax`
- `Path=/`

`Secure` should be:

- enabled automatically for `https` issuers
- disabled by default for loopback/local development

Loopback/local means:

- `localhost`
- `127.0.0.1`
- `::1`

## 3. Cookie Domain

By default, Rooiam should not set a cookie `Domain`.

That keeps the session host-only unless an operator explicitly chooses a shared cookie domain.

If `ROOIAM_COOKIE_DOMAIN` is used:

- leading dots are normalized away
- loopback values are ignored

## 4. Logout And Revocation

Logout is not just a client-side cookie clear.

Rooiam should:

1. revoke the DB session
2. clear the browser cookie
3. make the old cookie unusable if replayed later

That same rule applies to admin-driven or user-driven session revocation.

## 5. Localhost Doctrine

For local development:

- `Secure` is allowed to be off
- `SameSite=Lax` still stays on
- cookie domain should stay unset

Do not copy localhost cookie behavior into production.

## 6. Production Rule

In production:

- serve over `https`
- keep `Secure` on
- keep `HttpOnly` on
- keep `SameSite=Lax` unless a very specific cross-site flow truly requires otherwise
- do not broaden cookie domain without a clear reason

## 7. Security Intent

The cookie/session model should defend against:

- JavaScript reading the session cookie
- easy cross-site form replay
- stale session reuse after logout
- over-broad cookie sharing across unrelated hosts

This is the intended `0.1` session baseline.
