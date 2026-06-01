# FAQ

## Why is there no password field?

Rooiam is passwordless by design.

End users sign in with:
- magic link
- passkey
- Google
- Microsoft

## Why is the hosted widget blocked?

Usually because:
- the current site is not in `Allowed Embed Origins`
- or the site has no matching callback origin

## Why do I need `Allowed Embed Origins` if I already have `Redirect URIs`?

Because they protect different things:
- `Redirect URIs`: where login may finish
- `Allowed Embed Origins`: which site may load the hosted widget

## Should I use one app or many apps?

Recommended:
- one app per site or environment when possible

## Why did Rooiam reject my callback?

Usually because:
- the callback is not registered
- or the current site origin does not match a registered callback origin

## Why did logout ignore my redirect?

Usually because:
- `client_id` was missing
- or `post_logout_redirect_uri` was not registered for that app

## When should I use a workspace API key?

Use it for:
- backend integrations
- workspace automation
- server-to-server management

Do not use it for:
- human sign-in
- browser sessions
