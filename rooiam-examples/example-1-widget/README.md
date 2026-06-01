# example-1-widget

Minimum hosted widget example.

This app shows only:

- hosted login widget from `5170`
- local callback route
- basic callback success/error handling

Shared terms:

- `widget_login_context`
  - temporary hosted-widget login transaction owned by Rooiam
- `redirect_uri`
  - final app callback after login, registered on the workspace app

## Local config

1. Create a workspace in `rooiam-app` as `Workspace Owner` or `Workspace Admin`.
2. Create an app in that workspace.
3. Fill `config.local.json` from `config.example.json`.

Important:

- `client_id` must be the real app identifier from `rooiam-app`.
- the widget only needs app identity:
  - `workspace_id` or `workspace_slug`
  - `client_id`
  - `app_name`
- the callback stays registered on the Rooiam app itself.
- for this local starter example, register `http://localhost:5180/callback` on that app.
- if one app supports multiple sites, Rooiam matches the current embedding site to the registered callback with the same origin. If that feels confusing, use a separate app registration per site or environment.
- this host page still needs normal frontend security:
  - strict CSP where possible
  - XSS prevention
  - trusted dependencies only
  Rooiam protects the hosted widget flow, but it cannot rescue a host page that is already compromised.

## Run

```bash
cd /home/theparitt/work/rooiam/rooiam-example/example-1-widget
npm install
npm run dev
```

Then open:

```text
http://localhost:5180
```
