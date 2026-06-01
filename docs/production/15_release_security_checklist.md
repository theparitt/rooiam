# 0.1 Release Security Checklist

Use this checklist before tagging or shipping a release candidate.

## 1. Hosted Widget

- `Allowed Embed Origins` are explicitly configured
- registered app callbacks match the intended embed origins
- `/login-widget` rejects wrong origins
- widget replay/expiry handling still passes

## 2. Redirect Boundaries

- app callback is resolved from app registration, not browser input
- logout redirect still requires registered app context
- malformed provider callbacks are rejected and audited

## 3. Suspicious Auth

- suspicious-auth review state loads in workspace and platform UI
- reviewer + review time are visible
- high-severity operator email dedupe still works
- repeated blocked widget probes raise suspicious-auth signals

## 4. Session And Cookie

- session cookie is `HttpOnly`
- session cookie is `SameSite=Lax`
- localhost keeps `Secure` off by default
- production keeps `Secure` on
- logout clears and invalidates the session correctly

See:

- [Session And Cookie Doctrine](./14_session_and_cookie_doctrine.md)

## 5. Abuse Limits

- `/login` is rate-limited
- `/login-widget` is rate-limited
- magic-link start is rate-limited
- OAuth login start is rate-limited

## 6. Smoke Suite

Run the release smoke suite:

```bash
cd rooiam/test
bash run_security_smoke.sh
```

The runner expects:

- a normal isolated test server on `5177`
- a second isolated low-limit auth-abuse server on `5178`

## 7. Required Green Checks

Before `0.1`, these should all be green:

- `cargo check`
- `cargo test cookie:: -- --nocapture`
- `59_hosted_widget_security.hurl`
- `60_security_alert_reviews.hurl`
- `run_oauth_state_security_test.sh`
- `run_widget_context_security_test.sh`
- `run_risk_signal_test.sh`
- `run_cookie_security_test.sh`
- `run_widget_probe_signal_test.sh`
- `run_auth_surface_rate_limit_test.sh`

If one of these fails, fix it before shipping.
