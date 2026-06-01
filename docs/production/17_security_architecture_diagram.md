# Security Architecture Diagram

This page is the compact visual map of Rooiam login security for operators.

## 1. Main Login Boundaries

```text
Customer App Site
    |
    | embeds hosted widget
    v
Rooiam /login-widget
    |
    | validates:
    | - workspace app exists
    | - app belongs to workspace
    | - embed origin is allowed
    | - callback origin matches embed origin
    v
widget_login_context
    |
    | starts:
    | - magic link
    | - passkey
    | - Google / Microsoft
    v
Rooiam login transaction
    |
    | keeps validated redirect_uri internally
    v
Customer App callback
```

## 2. Trust Boundaries

```text
Browser
  - can request widget
  - can click login method
  - must NOT choose final app callback

Rooiam
  - validates app and site
  - mints widget_login_context
  - validates provider state
  - stores final callback server-side
  - issues session

Customer App
  - must keep host page safe
  - must prevent XSS
  - must configure correct callback and embed origin

Email Provider / OAuth Provider
  - can prove mailbox ownership or provider identity
  - does NOT choose the final app callback
```

## 3. Threat To Control Map

| Threat | Main Control | Operator Signal |
|---|---|---|
| Fake embed site | `Allowed Embed Origins` + callback-origin match | `auth.widget.embed_origin_blocked` |
| Fake callback | registered `redirect_uri` only | `auth.app_callback_rejected` |
| Widget replay | short TTL + consume-on-use | `auth.widget.expired`, `auth.widget.context_invalid` |
| Logout redirect abuse | registered `post_logout_redirect_uri` only | `auth.logout.redirect_rejected` |
| New suspicious login | risk engine | `auth.login.suspicious` |
| Host-page XSS | customer app CSP/XSS defenses | operator review + app security review |

## 4. Timing Diagram

```text
widget_login_context
    lifetime: 15 minutes

rapid_ip_change
    default window: 10 minutes

new_ip / new_user_agent
    default lookback: last 10 successful logins
```

## 5. Operator View

```text
Workspace operator
    -> rooiam-app
    -> review suspicious auth
    -> review workspace app config

Platform operator
    -> rooiam-admin
    -> review cross-tenant patterns
    -> review tenant overrides and severity
```

## 6. Practical Rule

When debugging login security, ask these in order:

1. is the site allowed to embed the widget?
2. does the app have a callback for that same site?
3. did the hosted-widget session expire or get replayed?
4. did provider or logout state get rejected?
5. is this normal user behavior or a suspicious pattern?

This is the smallest useful map of the `0.1` security design.
