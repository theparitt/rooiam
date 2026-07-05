# Hosted Login URLs

> [!IMPORTANT]
> This page is mainly about the root tenant login URL (`rooiam-app` on `5172`).
>
> If you are integrating the hosted widget iframe, use the canonical guide instead:
> - [Hosted Widget Integration Guide](./reference/03_hosted_widget_integration_guide.md)

## Overview

The hosted login page lives at the root of `rooiam-app` (`/`).
It is a single-page app — there is no `/login/:slug` route.
Workspace (org) context is passed as a **query parameter**, not a path segment.

---

## URL Format

```
http://<rooiam-app-host>/?org=<workspace-slug>
```

### Examples

| Workspace | URL |
|-----------|-----|
| RooChoco  | `http://localhost:5172/?org=roochoco` |
| MintMallow | `http://localhost:5172/?org=mintmallow` |
| Generic (no branding) | `http://localhost:5172/` |

When `?org=` is omitted, the login page shows a generic Rooiam login with no tenant branding.

---

## Additional Query Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `org` | Workspace slug — loads tenant branding | `?org=roochoco` |
| `app` | App name hint shown in the root tenant login UI | `?app=MyApp` |

This `app` parameter is for the root `rooiam-app` login page only. It is not
part of the canonical hosted-widget iframe contract described below.

---

## Why Query String, Not Path

Path-based slugs (`/roochoco`) would require:
- A dedicated route `/login/:slug` or `/:slug` in the SPA router
- Vite/Nginx rewrite rules to serve `index.html` for all slug paths
- Extra complexity when app login context is carried through the login URL

Query strings work cleanly with SPA routing, OIDC `login_hint`, and redirect chains without any server-side rewrite config.
A pretty-URL redirect (`/roochoco` → `/?org=roochoco`) can be added later without breaking existing integrations.

---

## Demo Mode

When the server runs with `ROOIAM_ENABLE_DEMO_SEED=true`, demo orgs are seeded automatically on startup.
The login page shows a **Demo** badge when `demo_mode: true` is returned by the server.

Demo login URLs:

```
http://localhost:5172/?org=roochoco
http://localhost:5172/?org=mintmallow
```

Demo users:
- Tenant user: `rooroo@sweetfactory.demo`
- Platform admin: `admin@rooiam.demo`

Magic links sent during demo mode go to **Mailhog** (not real email):
→ `http://localhost:8025`

---

## How the Login Page Resolves Workspace Context

1. Reads `?org=<slug>` from the URL
2. Calls `GET /api/v1/orgs/public/branding?slug=<slug>` — loads tenant name, logo, colors, login methods
3. Calls `GET /api/v1/setup/auth-methods?org=<slug>` — loads enabled login methods + `demo_mode` flag
4. Renders the login widget with tenant branding (or generic defaults if no org is specified)

## Hosted Widget Runtime Contract

The hosted login widget is a different surface from the root tenant login page.

Use the widget with workspace + client identity only:

```text
https://login.example.com/login-widget?workspace_id=<workspace-id>&client_id=<client-id>
```

Rooiam then:

1. validates the workspace app
2. validates the current embedding site origin
3. resolves the final app callback from the registered app configuration
4. mints a short-lived hosted-widget login transaction

Do not pass a browser-chosen `redirect_uri` to `/login-widget`.

Also do not pass `app` to `/login-widget`. The widget should resolve app
display context from the registered OAuth client and workspace branding.

For the full widget integration path, production checklist, and multi-origin guidance, prefer:
- [Hosted Widget Integration Guide](./reference/03_hosted_widget_integration_guide.md)
- [Downstream Hosted Widget Callback Flow](./reference/11_downstream_hosted_widget_callback_flow.md)
