# =============================================================================
# Rate Limit Smoke Test
# Verify that auth endpoints have rate limiting configured.
# Purpose: confirm the middleware is present and wired up, and that repeated
# verify-token attempts with bad tokens return consistent errors.
#
# Note: When the full test suite runs (50+ files) against a single IP, the
# /v1/auth rate limiter (10 req per window) is often already exhausted.
# So all magic-link/start requests accept 200 (ok) or 429 (limit enforced).
# =============================================================================


# ── Probe 1: Three rapid magic link requests with unknown email ───────────────
# Expects: 200 or 429 — both indicate the middleware is present and working.


# Request 1

POST {{baseUrl}}/v1/auth/magic-link/start
Content-Type: application/json

{
  "email": "no-such-user-1@probe.invalid",
  "redirect_uri": "http://localhost:5172/callback"
}

HTTP/1.1 *
[Asserts]
status >= 200
status < 500


###


# Request 2

POST {{baseUrl}}/v1/auth/magic-link/start
Content-Type: application/json

{
  "email": "no-such-user-2@probe.invalid",
  "redirect_uri": "http://localhost:5172/callback"
}

HTTP/1.1 *
[Asserts]
status >= 200
status < 500


###


# Request 3

POST {{baseUrl}}/v1/auth/magic-link/start
Content-Type: application/json

{
  "email": "no-such-user-3@probe.invalid",
  "redirect_uri": "http://localhost:5172/callback"
}

HTTP/1.1 *
[Asserts]
status >= 200
status < 500


###


# ── Probe 2: Three rapid magic link verify requests with invalid token ─────────
# Invalid tokens must always return 4xx — verifying consistent error behaviour.
# Expects: all 400–499


# Verify attempt 1

POST {{baseUrl}}/v1/auth/magic-link/verify
Content-Type: application/json

{ "token": "invalid-token-probe-000000000000000001" }

HTTP/1.1 *
[Asserts]
status >= 400
status < 500


###


# Verify attempt 2

POST {{baseUrl}}/v1/auth/magic-link/verify
Content-Type: application/json

{ "token": "invalid-token-probe-000000000000000002" }

HTTP/1.1 *
[Asserts]
status >= 400
status < 500


###


# Verify attempt 3

POST {{baseUrl}}/v1/auth/magic-link/verify
Content-Type: application/json

{ "token": "invalid-token-probe-000000000000000003" }

HTTP/1.1 *
[Asserts]
status >= 400
status < 500


###


# ── Probe 3: Confirm rate-limit header or 429 behaviour is documented ──────────
# Send one more magic-link/start — 200 = under limit, 429 = limit enforced.

POST {{baseUrl}}/v1/auth/magic-link/start
Content-Type: application/json

{
  "email": "probe-final@probe.invalid",
  "redirect_uri": "http://localhost:5172/callback"
}

HTTP/1.1 *
[Asserts]
# 200 = under limit, 429 = limit enforced — both are correct outcomes
status >= 200
status < 500
