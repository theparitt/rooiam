# example-2-account

Richer account-focused Rooiam example.

This app shows:

- hosted login widget from `5170`
- backend API-key call from the example server to `rooiam-server` (`5170`)
- end-user `My` area:
  - `Profile`
  - `Account`
  - `Security`
  - `Sessions`
  - `Audit Logs`

Shared terms:
- `widget_login_context`
  - temporary hosted-widget login transaction owned by Rooiam
- `redirect_uri`
  - final app callback after login, registered on the workspace app
- `post_logout_redirect_uri`
  - final app callback after logout, validated per `client_id`

## Local config

1. Create a workspace in `rooiam-app` as `Workspace Owner` or `Workspace Admin`.
2. Create an app in that workspace.
3. Create a workspace API key.
4. Fill:
   - `.env`
   - `config.local.json`

Important:
- `client_id` must be the real app identifier from `rooiam-app`.
- the widget only needs app identity:
  - `workspace_id` or `workspace_slug`
  - `client_id`
  - `app_name`
- the callback stays registered on the Rooiam app itself.
- for this local example app, register `http://localhost:5192/callback`
- logout now sends both:
  - `client_id`
  - `post_logout_redirect_uri`
  so Rooiam can validate the app-specific logout target.
- if one app supports multiple sites, Rooiam matches the current embedding site to the registered callback with the same origin. If those sites are really separate products or environments, prefer separate app registrations.
- this app still needs its own CSP and XSS protections. Rooiam can validate widget origin, login context, and app callback selection, but it cannot defend a host page that already runs attacker-controlled script.

## Run

```bash
cd rooiam/rooiam-examples/example-2-account
npm install
npm run dev
```

Then open:

```text
http://localhost:5192
```
