# Embedded Login

Rooiam supports two downstream sign-in patterns:

- hosted login redirect
- hosted login widget embedded into a customer app page

The security model is the same in both cases:

- the downstream app is identified by the registered workspace app
- the final app callback comes from the app registration in Rooiam
- the browser does not choose the app callback URL at auth start

## 1. Recommended Contract

The hosted login widget should be embedded with workspace + client identity only:

```html
<iframe
  src="https://login.example.com/login-widget?workspace_id=<workspace-id>&client_id=<client-id>"
  width="420"
  height="520"
  frameborder="0"
  allow="publickey-credentials-get *"
></iframe>
```

Do not pass a browser-chosen `redirect_uri` in the widget URL.
Do not pass `app` in the widget URL.

Rooiam resolves the final app callback and app display context from the
registered app configuration and stores that inside the hosted-widget login
transaction.

The hosted-widget login transaction is short-lived:

- `widget_login_context` lifetime is about 15 minutes
- stale or replayed widget transactions are rejected
- the widget should tell the user to refresh when that session expires

## 2. What Rooiam Validates

When `/login-widget` loads, Rooiam validates all of these before it renders:

- the `client_id` is a real workspace app
- the app belongs to the requested workspace
- the current embedding site origin is listed in `Allowed Embed Origins`
- the app has a registered callback whose origin matches the current embedding site

If any of those checks fail, Rooiam blocks the widget instead of falling back to a broad redirect.

## 3. What To Configure In The Downstream App

For every workspace app registration, configure these separately:

- `Redirect URIs`
  - exact callback URLs such as `https://product.example.com/callback`
- `Allowed Embed Origins`
  - site origins only, such as `https://product.example.com`

These are related, but not identical:

- `Redirect URIs` answer: where can login finish?
- `Allowed Embed Origins` answer: which site is allowed to host the widget?

If one app supports multiple sites, Rooiam matches the current embedding origin to the registered callback with the same origin.

## 4. Customer-App Security Checklist

The hosted widget protects its own boundaries, but it cannot secure a customer app page that is already compromised.

Before embedding the widget in production:

1. serve the customer app over `https`
2. prevent XSS on the host page
3. set a real CSP on the customer app
4. register only the exact callback URLs you need
5. register only the exact embed origins you need
6. prefer one workspace app per site or environment when possible

See:

- [Hosted Widget Host-Page Security Checklist](./13_widget_host_page_security.md)

## 5. Preview vs Runtime

The tenant portal preview is a Rooiam-managed preview surface.

It is not the same as a customer runtime embed.

Runtime embeds must satisfy the real app checks above:

- real workspace app
- real allowed embed origin
- real matching callback origin

## 6. Recommendation

Prefer one workspace app per site or environment when that keeps ownership clear.

If you intentionally support multiple origins in one app, do it explicitly and understand that Rooiam will route each hosted-widget session to the callback whose origin matches the current embedding site.
