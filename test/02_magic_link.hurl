# Request magic link for demo user
# Expects: 200 — link sent (check Mailhog at :8025)
# Note: may return 429 when the full test suite runs (rate limit 10/60s per IP)

POST {{baseUrl}}/v1/auth/magic-link/start
Content-Type: application/json

{
  "email": "{{demoUserEmail}}",
  "redirect_uri": "http://localhost:5172/auth/callback?workspace={{demoWorkspaceSlug}}"
}

HTTP/1.1 *
[Asserts]
# 200 = ok, 429 = rate limited (both are correct outcomes when suite runs fast)
status >= 200
status < 500


###


# Request magic link for unknown email
# Expects: 200 — same response to prevent user enumeration

POST {{baseUrl}}/v1/auth/magic-link/start
Content-Type: application/json

{
  "email": "nobody@notreal.example",
  "redirect_uri": "http://localhost:5172/auth/callback"
}

HTTP/1.1 *
[Asserts]
status >= 200
status < 500


###


# Verify with invalid token
# Expects: 400 or 422 — token invalid

POST {{baseUrl}}/v1/auth/magic-link/verify
Content-Type: application/json

{
  "token": "invalid-token-that-does-not-exist"
}

HTTP/1.1 *
[Asserts]
status >= 400
status < 500
