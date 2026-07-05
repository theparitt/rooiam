# Integration Snippets

This page gives copy/paste examples for common Rooiam integrations.

## 1. Minimal Hosted Widget Embed

```html
<iframe
  src="https://auth.example.com/login-widget?workspace_id=WORKSPACE_ID&client_id=CLIENT_ID"
  title="Sign in"
  style="width:100%;max-width:420px;height:640px;border:0;border-radius:24px"
></iframe>
```

Important:
- register the exact callback URL on the app
- register the exact embedding site origin in `Allowed Embed Origins`
- do not add `app`
- do not add `redirect_uri`, `state`, or PKCE fields to the widget URL
- handle OIDC callback and token exchange in your own app callback page

For the complete downstream pattern, read:

- [Downstream Hosted Widget Callback Flow](./11_downstream_hosted_widget_callback_flow.md)

## 2. Browser Fetch To Read Branding

```js
const response = await fetch('https://auth.example.com/api/v1/orgs/public/branding?slug=acme');
const branding = await response.json();
console.log(branding.name, branding.brand_color);
```

## 3. Node.js Backend With Workspace API Key

```js
const response = await fetch('https://auth.example.com/v1/orgs/integrations/members?page=1&page_size=20', {
  headers: {
    Authorization: `Bearer ${process.env.ROOIAM_WORKSPACE_API_KEY}`,
  },
});

const data = await response.json();
console.log(data.items);
```

## 4. Node / Express Logout Redirect

```js
app.post('/logout', (req, res) => {
  const url = new URL('https://auth.example.com/oidc/logout');
  url.searchParams.set('client_id', process.env.ROOIAM_CLIENT_ID);
  url.searchParams.set('post_logout_redirect_uri', 'https://app.example.com/logout/callback');
  res.redirect(url.toString());
});
```

Important:
- `post_logout_redirect_uri` must be registered for that app
- send `client_id` with it

## 5. Server-Side OIDC Authorize Redirect

```js
app.get('/login', (req, res) => {
  const authorize = new URL('https://auth.example.com/oidc/authorize');
  authorize.searchParams.set('client_id', process.env.ROOIAM_CLIENT_ID);
  authorize.searchParams.set('redirect_uri', 'https://app.example.com/callback');
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('scope', 'openid profile email');
  authorize.searchParams.set('state', 'replace-with-real-state');
  res.redirect(authorize.toString());
});
```

## 6. Example Backend Proxy Pattern

```js
async function callWorkspaceApi(path, init = {}) {
  const response = await fetch(`https://auth.example.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.ROOIAM_WORKSPACE_API_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Rooiam API failed: ${response.status}`);
  }

  return response.json();
}
```

Use this pattern when:
- your server owns the workspace API key
- the browser should not see that key

## 7. Good Contract Reminders

- `widget_login_context` is a temporary hosted-widget transaction
- `redirect_uri` is the final app callback
- workspace API keys are backend credentials, not end-user credentials

## 8. Hosted Widget + OIDC Rule

If you embed `/login-widget`, keep these two flows separate:

- widget URL:
  - `workspace_id`
  - `workspace` (optional)
  - `client_id`
- downstream OIDC authorize request:
  - `redirect_uri`
  - `state`
  - `code_challenge`
  - `code_challenge_method`

Do not merge those concerns into one browser-generated widget URL.
