# RooIAM SDK

RooIAM SDK is the integration surface for downstream applications that want to use RooIAM for authentication, identity, and session infrastructure.

This repo currently contains:

- [packages/js-browser](./packages/js-browser)
  - browser-side SDK
  - public login flows
  - hosted widget / callback flows
  - session-cookie self-service APIs
- [packages/js-server](./packages/js-server)
  - server-side SDK
  - backend integration with RooIAM workspace APIs
  - API-key based trusted service calls
- [spec/openapi.json](./spec/openapi.json)
  - OpenAPI source used to generate SDK types

## Start Here

If you are designing a downstream product, read this first:

- [DOWNSTREAM_APP_DESIGN.md](./DOWNSTREAM_APP_DESIGN.md)

That guide explains the recommended architecture:

- RooIAM owns login, identity proof, and identity session infrastructure
- your app owns its own user profile, product roles, activity, and business data
- your app should exchange RooIAM access tokens for an app-owned session instead of persisting RooIAM bearer tokens in browser storage

## Which SDK Should I Use?

Use `@rooiam/sdk-browser` when you need:

- sign-in from the browser
- hosted login widget integration
- OIDC callback handling
- browser-side identity/session interactions

Use `@rooiam/sdk-server` when you need:

- backend integration
- trusted server-to-server API access
- workspace automation and administrative integration

## Recommended Integration Pattern

Best practice for downstream apps:

1. Authenticate with RooIAM
2. Resolve the RooIAM subject in your app
3. Exchange the RooIAM access token for an app-owned session
4. Upsert a local app user record
5. Keep app profile data in your app
6. Keep app roles and app activity in your app

Do not use RooIAM as your product database.

Recommended boundary:

- RooIAM bearer tokens are for identity verification and OIDC flows
- your app session token is for product behavior
- multi-workspace apps should usually make the app session workspace-scoped

## Package Notes

### Browser SDK

Package:

- `@rooiam/sdk-browser`

Purpose:

- frontend auth and identity flows

Important boundary:

- browser self-service endpoints may rely on a first-party RooIAM session cookie
- this is different from your app's own local session and profile model
- if you are embedding a hosted login widget, do not assume the browser SDK self-service APIs are a substitute for your app profile APIs

### Server SDK

Package:

- `@rooiam/sdk-server`

Purpose:

- backend integration with RooIAM APIs

Use it when your server needs to:

- read or manage workspace integration state
- perform trusted API operations
- automate identity-related backend workflows
- exchange RooIAM identity into an app-owned session on behalf of your product

## Repository Layout

```text
rooiam-sdk/
  README.md
  DOWNSTREAM_APP_DESIGN.md
  packages/
    js-browser/
    js-server/
  spec/
    openapi.json
```

## Design Principle

RooIAM should answer:

- who is this user?
- how did they sign in?
- what session is active?

Your app should answer:

- what does this user look like in the app?
- what can they do here?
- what content and activity belongs to them?

For multi-workspace products, also answer:

- which workspace session is active right now?
- which RooIAM client/widget config belongs to this workspace?

That separation is the intended integration model.
