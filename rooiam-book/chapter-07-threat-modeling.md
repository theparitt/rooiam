# Chapter 7: Threat Modeling

A threat model identifies assets, actors, trust boundaries, and failure cases. It helps explain what each check protects and where the implementation still needs care.

## Start with concrete assets

Rooiam protects user identities, browser sessions, login transactions, workspace membership, client configuration, and machine credentials. Downstream applications protect their own sessions and business data.

| Threat | Relevant control | Limit to understand |
|---|---|---|
| Stolen cookie | Hashed session secret, expiry and server revocation | A stolen raw cookie is still a bearer credential |
| Cross-workspace access | Explicit workspace and permission checks | UUID randomness is not authorization |
| Malicious widget embedding | Registered embed origins and callback-origin selection | Host-page compromise remains a downstream responsibility |
| Redirect abuse | Exact registered callback validation | CORS is not a callback allowlist |
| Refresh-token reuse | Rotation and family revocation | Concurrent client refreshes can trigger reuse protection |
| Login flooding | Redis rate-limit counters and risk signals | Shared-IP users share rate-limit budgets |
| Audit alteration | Restricted operational access and external delivery | Current logs are not cryptographically immutable |

## Browser boundaries

The session cookie is HttpOnly, but that does not make an XSS-compromised page harmless: malicious code can still initiate actions in the user's browser. Cookie policy, request-origin checks, content security policy, and careful frontend rendering address different parts of that risk.

Hosted-widget registration keeps `Allowed Embed Origins` separate from redirect URIs. The embedding page supplies workspace/client identity; Rooiam validates that relationship and chooses the callback. Ordinary OIDC authorization still carries an explicit registered redirect URI.

## Request identity and limits

`shared/request_ip.rs` derives the client IP. Forwarded headers are trusted only through configured proxy ranges. An overly broad trusted-proxy setting can undermine IP-based policy and rate limiting.

The generic rate limiter has per-IP/method/path counters and per-IP scope counters. Redis expiry defines the counting window; it is not a sliding history of all requests. Device-login endpoints also use dedicated limits.

## Review implementation, not just intention

Security claims should describe the code that exists. For example, current magic-link lookup and marking used are separate operations; they do not guarantee one winner for simultaneous redemption. OIDC code exchange and refresh-family handling use stronger transactional coordination.

A useful review records both a control and its precise limit. Do not describe every endpoint as automatically tenant-scoped or every audit write as guaranteed durable.

## Exercises

1. Trace one member-management route from credential extraction to its database query.
2. Explain how a shared corporate NAT affects per-IP rate limits.
3. Compare sequential replay and concurrent redemption tests for a one-time credential.

## Follow the source

- [rooiam-server/src/http/middleware/auth.rs](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/src/http/middleware/auth.rs)
- [rooiam-server/src/http/middleware/rate_limit.rs](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/src/http/middleware/rate_limit.rs)
- [rooiam-server/src/shared/request_ip.rs](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/src/shared/request_ip.rs)
- [rooiam-server/src/shared/widget_login_context.rs](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/src/shared/widget_login_context.rs)
