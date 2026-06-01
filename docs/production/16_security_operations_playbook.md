# Security Operations Playbook

This page is for operators, not developers.

It explains:

- what the main login risks are
- how attackers usually try them
- what Rooiam does to block them
- what timing matters
- what the operator should do next

You should not need to read server code to use this page.

## 1. The Three Terms To Remember

Rooiam uses three different redirect-related ideas:

- `widget_login_context`
  - the short-lived hosted-widget login session
- `redirect_uri`
  - the final registered app callback after login
- `post_logout_redirect_uri`
  - the final registered app callback after logout

The main rule is simple:

- the browser must not choose the final app callback

Rooiam chooses the final app callback from app registration and keeps it inside the server-side login transaction.

## 2. Simple Flow

```text
Customer app page
    |
    | embeds /login-widget with workspace_id + client_id + app
    v
Rooiam /login-widget
    |
    | checks:
    | - app belongs to workspace
    | - site origin is allowed
    | - callback origin matches that site
    | creates widget_login_context
    v
Hosted widget
    |
    | user chooses:
    | - magic link
    | - passkey
    | - Google / Microsoft
    v
Rooiam login flow
    |
    | keeps validated redirect_uri internally
    v
Registered app callback
```

For a tighter structural view, see:

- [Security Architecture Diagram](./17_security_architecture_diagram.md)

## 3. Main Risks And Protections

### Fake Site Embeds The Widget

What goes wrong:

- a phishing site tries to iframe the real login widget

How the attacker does it:

- uses a real `client_id`
- loads `/login-widget` from a site that is not really allowed

How Rooiam protects it:

- the app must belong to the requested workspace
- the current site must be in `Allowed Embed Origins`
- the app must have a registered callback with the same origin
- blocked attempts are audited

What the operator should check:

- audit event:
  - `auth.widget.embed_origin_blocked`
- suspicious-auth spikes from repeated blocked probes

### Browser Chooses The Callback URL

What goes wrong:

- login finishes at the wrong callback

How the attacker does it:

- sends a fake `redirect_uri`
- hopes the server trusts it

How Rooiam protects it:

- widget URL does not carry browser-chosen callback
- Rooiam resolves the callback from app registration
- unregistered callbacks are rejected and audited

What the operator should check:

- audit event:
  - `auth.app_callback_rejected`

### Replay Or Expired Hosted-Widget Session

What goes wrong:

- a stale or stolen `widget_login_context` is reused

How the attacker does it:

- replays an old widget token
- or abuses browser back/restore with stale page state

How Rooiam protects it:

- widget session is short-lived
- auth start consumes it
- widget flows rotate it when needed
- expired state tells the user to refresh

What the operator should check:

- audit events:
  - `auth.widget.expired`
  - `auth.widget.context_invalid`

Timing note:

- the hosted-widget login transaction is intentionally short-lived
- current `0.1` lifetime is about 15 minutes
- users should refresh the widget when that session expires

### Wrong Site Uses A Real App

What goes wrong:

- someone uses a real app from the wrong site

How the attacker does it:

- they know a valid `client_id`
- but they load the widget from a different origin

How Rooiam protects it:

- the site origin must be explicitly allowed
- the callback origin must match that site
- widget load is blocked before auth starts

Important operator note:

- one app can support more than one site
- if you do that, Rooiam routes each hosted-widget session to the callback whose origin matches the current site
- for clarity, prefer one app per site or environment when possible

### Magic-Link Inbox Compromise

What goes wrong:

- attacker controls the user mailbox

How the attacker does it:

- compromised mailbox
- forwarded email
- stolen device with mailbox access

How Rooiam protects it:

- short-lived magic links
- auth-start rate limits
- MFA can still gate the final session
- suspicious-login signals raise visibility

What Rooiam cannot solve:

- Rooiam cannot protect an inbox that is already compromised

What the operator should do:

- require MFA for sensitive tenants
- review suspicious login alerts
- remind users that email security matters

### Passkey On A Compromised Host Page

What goes wrong:

- the customer app page has XSS

How the attacker does it:

- runs script on the real allowed site
- drives the real widget from the correct origin

How Rooiam protects it:

- widget still validates site and app
- WebAuthn still binds to the correct origin

What Rooiam cannot solve:

- Rooiam cannot fix XSS in the customer app

What the operator should do:

- require the customer app to use CSP
- require XSS-safe rendering practices
- keep third-party scripts tight

### Provider Callback / OAuth State Abuse

What goes wrong:

- provider callback or state is tampered with

How the attacker does it:

- wrong provider state
- malformed callback payload
- replay of provider callback

How Rooiam protects it:

- provider returns to Rooiam, not directly to the customer app
- provider state is validated
- malformed callbacks are rejected and audited
- callback mismatch and replay paths are in the security tests

What the operator should check:

- suspicious login failures
- OAuth callback reject patterns

### Logout Redirect Abuse

What goes wrong:

- logout bounces the browser somewhere unrelated

How the attacker does it:

- sends arbitrary `post_logout_redirect_uri`

How Rooiam protects it:

- logout redirect must be registered for the supplied `client_id`
- otherwise Rooiam falls back safely
- rejected values are audited

What the operator should check:

- audit event:
  - `auth.logout.redirect_rejected`

### Misconfiguration

What goes wrong:

- the operator registers the wrong callback or wrong site origin

How it usually happens:

- too many origins in one app
- callback copied from the wrong environment
- site and callback drift apart over time

How Rooiam protects it:

- separate fields for:
  - `Redirect URIs`
  - `Allowed Embed Origins`
- warnings for multi-origin apps
- explicit confirmation when one app spans multiple origins
- production widget load is blocked when the site/callback contract does not match

## 4. Timing That Matters

The main timing values in `0.1` are:

- hosted-widget login session
  - `15 minutes`
- rapid IP-change window
  - default `10 minutes`
- new-IP lookback
  - default last `10` successful logins
- new-user-agent lookback
  - default last `10` successful logins

Why operators care:

- these values decide how long a login session stays usable
- how quickly a location change looks risky
- how long a browser or device is treated as “known”

## 5. Abuse Limits

Rooiam rate-limits the main auth-start surfaces:

- `/login`
- `/login-widget`
- magic-link start
- OAuth login start

Why this matters:

- it makes login flooding harder
- it makes probing more visible
- it helps suspicious-auth signals stand out sooner

## 6. Where Operators Look

### Tenant / Workspace Operators

Use `rooiam-app` for:

- suspicious login alerts
- blocked hosted-widget site attempts
- new IP and rapid IP-change review
- workspace app configuration review

### Platform Operators

Use `rooiam-admin` for:

- cross-tenant suspicious patterns
- tenant risk settings and overrides
- platform-wide suspicious-auth review

## 7. What To Do When This Alert Appears

### `auth.widget.embed_origin_blocked`

Meaning:

- a site tried to load the hosted widget but was not allowed

Operator steps:

1. confirm whether the origin is expected
2. if expected, check the app’s `Allowed Embed Origins`
3. if unexpected, leave it blocked and watch for repeated probes
4. if the probes repeat, treat it as hostile scanning

### `auth.app_callback_rejected`

Meaning:

- something tried to use a callback that is not registered for the app

Operator steps:

1. confirm the correct callback in app settings
2. check whether the app was misconfigured
3. if the callback is unknown, keep it blocked
4. review whether anyone recently edited that app

### `auth.widget.expired` or `auth.widget.context_invalid`

Meaning:

- the hosted-widget login session expired or was already used

Operator steps:

1. if isolated, treat it as normal user retry noise
2. if frequent, check for replay attempts or broken browser caching
3. tell the user to refresh and retry
4. if clustered by IP or site, review suspicious-auth logs

### `auth.logout.redirect_rejected`

Meaning:

- logout tried to use an unregistered callback

Operator steps:

1. check whether the app sent the wrong `client_id`
2. check the registered logout/app callback list
3. if the target is unknown, keep it blocked
4. review whether this is a broken app deploy or suspicious probing

### Suspicious Login: `new_ip`

Meaning:

- successful login from an IP not seen in the recent history for that user

Operator steps:

1. check whether the user expected a new location or network
2. if it looks normal, mark reviewed
3. if it looks suspicious, revoke risky sessions and contact the user
4. if tenant policy is weak, consider requiring MFA

### Suspicious Login: `rapid_ip_change`

Meaning:

- successful logins from different IPs inside a short window

Operator steps:

1. treat this as higher severity
2. compare session times and device details
3. ask the user whether both locations are real
4. revoke suspicious sessions if needed
5. review whether more users are affected

### Suspicious Login: `new_user_agent`

Meaning:

- successful login from a browser/device not seen recently

Operator steps:

1. confirm whether the user changed device or browser
2. if yes, mark reviewed
3. if not, revoke suspicious sessions and follow up

## 8. Shared Responsibility

Rooiam is responsible for:

- callback validation
- hosted-widget origin validation
- session and cookie handling
- audit logs and suspicious-login signals

The customer app is responsible for:

- CSP
- XSS prevention
- safe script loading
- safe dependency management

This split matters because a secure login service still cannot protect a host page that is already compromised.

## 9. The Short Version

If the operator remembers only three things, remember these:

1. the browser does not choose the final app callback
2. the hosted widget only loads on allowed sites
3. suspicious patterns must be reviewed, not ignored

See also:

- [Embedded Login](./08_embedded_login.md)
- [Hosted Widget Host-Page Security Checklist](./13_widget_host_page_security.md)
- [Session And Cookie Doctrine](./14_session_and_cookie_doctrine.md)
- [0.1 Release Security Checklist](./15_release_security_checklist.md)
- [Security Architecture Diagram](./17_security_architecture_diagram.md)
