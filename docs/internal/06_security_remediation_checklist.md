# Security Remediation Checklist

This checklist tracks the March 12, 2026 security review fixes that were selected for immediate implementation.

## Completed in this change

- [x] Restrict first-run `/v1/setup/*` access to loopback requests by default
- [x] Add explicit `ROOIAM_SETUP_TOKEN` support for remote bootstrap requests
- [x] Stop returning plaintext SMTP and OAuth secrets from `/v1/setup/config`
- [x] Stop logging raw magic-link URLs when SMTP delivery is disabled
- [x] Default session cookies to `Secure` when the public issuer is HTTPS
- [x] Redact database and Redis URLs in startup logs
- [x] Hash tenant-scoped confidential OIDC client secrets with Argon2id
- [x] Only auto-link OAuth logins to existing Rooiam accounts when the provider email is verified
- [x] Escape user-controlled values in the demo OAuth HTML page
- [x] Validate saved public URLs as full `http(s)` URLs before storing them
- [x] Stop trusting forwarded client IP headers unless the immediate peer matches `ROOIAM_TRUSTED_PROXY_CIDRS`
- [x] Add regression tests for trusted proxy resolution and cookie security defaults

## Deferred

- [ ] Replace plaintext `system_settings` secret storage with envelope encryption or an external secret manager
- [ ] Expose a dedicated public admin-login capability endpoint instead of reusing `/v1/setup/config`
- [ ] Add broader regression tests for bootstrap access control and OAuth auto-linking rules
