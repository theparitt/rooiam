# RooIAM SDK

RooIAM SDK is the integration surface for downstream applications that want to use RooIAM for authentication, identity, and session infrastructure.

This repo currently contains:

- [android](./android)
  - standalone Android device-login SDK (`0.4.0-alpha.1` beta)
  - protocol, protected credentials, enrollment and signed approval
  - consumed by [example-5-android-reference-app](../rooiam-examples/example-5-android-reference-app)

- [packages/js-browser](./packages/js-browser)
  - browser-side SDK
  - public login flows
  - hosted widget / callback flows
  - session-cookie self-service APIs
- [packages/js-server](./packages/js-server)
  - server-side SDK
  - backend integration with RooIAM workspace APIs
  - workspace API-key calls through `RooiamServer`
  - BFF-only user self-session calls through `RooiamUser` with a server-held OIDC access token
- [spec/openapi.json](./spec/openapi.json)
  - OpenAPI source used to generate SDK types

## Current implementation

Package version: `0.1.0`. `spec/openapi.json` is generated from the Rust server annotations and used to generate both TypeScript schemas. Rebuild SDK packages after regenerating their types.

The browser package exports `buildHostedLoginUrl({ apiOrigin, workspaceId, clientId })`. OIDC code exchange has a typed token response; refresh rotation is implemented by the server, while the browser SDK currently has no dedicated refresh helper. Serialize refresh requests and replace the old refresh token after success.

See the [SDK and device-login reference](../docs/reference/13_sdk_and_device_login.md) for current boundaries and server-only capabilities.
For verified package-consumer commands, supported versions and upgrade limits, see the [SDK support and upgrade guide](../docs/reference/17_sdk_support_and_upgrade.md).

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

- list or search workspace members and invitations, including their outcomes
- invite people, change a member's RooIAM workspace role, remove membership, or inspect a member through a workspace API key
- list or revoke a member's sessions in that workspace
- enroll a signed-in OAuth user as an ordinary member when your app allows self-registration
- manage the signed-in user's own RooIAM sessions with that user's server-held OIDC access token

```ts
import { RooiamServer, RooiamUser } from '@rooiam/sdk-server'

const workspace = new RooiamServer({
  apiBase: 'https://api.rooiam.com/v1',
  apiKey: process.env.ROOIAM_WORKSPACE_API_KEY!,
})
const sent = await workspace.invites.send('staff@example.com')
const outcome = await workspace.invites.get(sent.invite_id)
// Only for a customer-facing flow that explicitly allows self-registration.
// The key needs members.enroll. RooIAM verifies this token, its live session,
// and that the OAuth client belongs to the key's workspace.
const enrolled = await workspace.members.enroll(appSession.rooiamAccessToken, '<workspace OAuth client ID>')
const activeMember = await workspace.members.byUserId(enrolled.subject)
await workspace.members.setRole(activeMember.id, 'member')
await workspace.members.revokeSessions(activeMember.id)
await workspace.members.remove(activeMember.id) // also revokes that workspace's sessions

// Create only inside your BFF after validating your own opaque app session.
const self = new RooiamUser({
  apiBase: 'https://api.rooiam.com/v1',
  accessToken: appSession.rooiamAccessToken,
})
const sessions = await self.sessions.list()
```

The SDK does not grant application roles or create the app session. Match
provider users by stable `user_id`, require active workspace membership, and
keep product permissions in the downstream application. Never use the
workspace key for a user's self-service session routes.
These member and session methods are general RooIAM APIs for any integrating
application; they contain no Howllo workspace mapping or product-specific role
rules. Removing a RooIAM member also revokes their RooIAM sessions for that
workspace. An integrating application must separately revoke its own sessions
and application roles for that member.

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
