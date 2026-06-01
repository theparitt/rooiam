# Chapter 13: Operator Security Playbook

This chapter is the practical companion to the threat-modeling chapter.

The earlier security chapters explain **why** the attacks matter. This chapter explains **how an operator should think about the live system** after deployment.

## 1. The Main Security Question

Every login system has the same core question:

> Who gets to decide where login starts, where it is allowed to run, and where it is allowed to finish?

Rooiam answers that question with three separate concepts:

- `widget_login_context`
  - the temporary hosted-widget login transaction
- `redirect_uri`
  - the final registered app callback after login
- `post_logout_redirect_uri`
  - the final registered app callback after logout

The key design choice is simple:

- the browser does **not** choose the final app callback

## 2. Sequence Diagram

```text
Customer App
    |
    | embed /login-widget?workspace_id=...&client_id=...&app=...
    v
Rooiam
    |
    | validate allowed embed origin
    | validate app/workspace match
    | select registered callback with same origin
    | mint widget_login_context
    v
Hosted Widget
    |
    | magic link / passkey / Google / Microsoft
    v
Rooiam Login Transaction
    |
    | store validated redirect_uri internally
    v
Customer App Callback
```

## 3. Threats Operators Must Understand

### Fake embed site

Attack:

- a phishing site tries to iframe the real hosted widget

Defense:

- explicit `Allowed Embed Origins`
- callback-origin matching
- audit logs for blocked origins

### Browser-chosen callback

Attack:

- attacker supplies a malicious callback URL

Defense:

- callback comes from app registration
- not from widget query params
- not from browser auth-start input

### Replay of old hosted-widget transaction

Attack:

- attacker or stale browser page reuses an old `widget_login_context`

Defense:

- short TTL
- consume-on-use
- rotation when widget remains on page
- refresh prompt on expiry

### Compromised email inbox

Attack:

- attacker controls the user mailbox and uses magic link

Defense:

- short-lived links
- MFA policy
- suspicious-login signals

Operator reality:

- inbox compromise is never a problem Rooiam can completely solve alone

### Compromised host page

Attack:

- XSS on the customer app page drives the real widget from an allowed site

Defense:

- Rooiam still validates origin and callback
- WebAuthn still binds to the correct origin

Operator reality:

- Rooiam cannot fix XSS on the customer app

## 4. Timing Matters

Operators should care about timing windows because timing changes what is suspicious and what is normal retry noise.

Important windows in `0.1`:

- hosted-widget login transaction:
  - `15 minutes`
- rapid IP-change risk window:
  - default `10 minutes`
- new-IP lookback:
  - last `10` successful logins
- new-user-agent lookback:
  - last `10` successful logins

## 5. What Operators Actually Watch

Tenant and platform operators should watch for:

- blocked embed-origin attempts
- replayed or expired widget transactions
- rejected app callbacks
- rejected logout callbacks
- suspicious successful logins from new IPs or rapid IP changes

This is why Rooiam has:

- audit logs
- suspicious-auth panels
- high-severity operator emails

## 6. Security Is Shared

Rooiam owns:

- app callback validation
- hosted-widget origin validation
- session/cookie handling
- audit and suspicious-login signals

The customer app owns:

- CSP
- XSS prevention
- safe dependency loading
- safe script loading

That shared-responsibility split is the real operational doctrine.

## 7. The Operator Rule Of Thumb

If an operator remembers only one thing, it should be this:

> The problem is not whether a callback exists. The problem is who gets to choose it.

Rooiam is secure when:

- callbacks come from app registration
- widget loads only on allowed sites
- temporary login transactions expire and cannot be replayed
- suspicious patterns are visible to operators

For the full production operator guidance, read:

- [docs/production/16_security_operations_playbook.md](../docs/production/16_security_operations_playbook.md)
- [docs/production/17_security_architecture_diagram.md](../docs/production/17_security_architecture_diagram.md)
