# Hosted Widget Host-Page Security Checklist

This checklist is for the customer app page that embeds the Rooiam hosted login widget.

Rooiam secures the hosted widget itself. It does **not** secure a customer page that already has XSS, unsafe third-party scripts, or weak CSP.

## 1. Use HTTPS Everywhere

Production customer apps should use `https://`.

Plain `http://` should only be used for:

- `localhost`
- `127.0.0.1`
- loopback development

## 2. Prevent XSS On The Host Page

If an attacker can run script on the page that embeds the widget, they can still abuse the real widget from an allowed origin.

Minimum expectations:

- no unsafe HTML injection
- no untrusted inline script
- no unchecked Markdown or rich-text rendering
- review third-party script tags carefully

## 3. Set A Real CSP

The customer app should set its own CSP.

Minimum guidance:

- avoid `unsafe-inline`
- avoid `unsafe-eval`
- restrict `script-src` to trusted domains
- restrict `frame-src` to the Rooiam login host
- restrict `connect-src` to the app’s own APIs and required providers

Example starting point:

```http
Content-Security-Policy:
  default-src 'self';
  script-src 'self' https://login.example.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  frame-src https://login.example.com;
  connect-src 'self' https://login.example.com https://api.example.com;
  object-src 'none';
  base-uri 'self';
  frame-ancestors 'self';
```

Adjust this to your own app. Do not copy it blindly.

## 4. Keep App Registration Tight

For each workspace app:

- register only the callback URLs you actually use
- register only the embed origins that really host the widget
- prefer one app per site or environment when that is operationally simpler

Too many origins in one app increases configuration risk.

## 5. Review Suspicious Auth Alerts

Rooiam can detect and surface:

- new IP sign-ins
- rapid IP changes
- new user-agent sign-ins
- blocked widget origin attempts

Tenant owners/admins and platform operators should review these alerts regularly.

## 6. Treat Email And Sessions As Sensitive

Magic-link security depends on inbox security.

Also make sure:

- session cookies stay `HttpOnly` and `Secure`
- shared devices are logged out
- suspicious sessions are revoked quickly

## 7. Final Rule

The hosted widget is safe when:

- the customer app page is trustworthy
- the workspace app registration is correct
- callback URLs and embed origins are kept explicit and tight
