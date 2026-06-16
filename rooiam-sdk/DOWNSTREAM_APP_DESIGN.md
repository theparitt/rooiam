# RooIAM SDK: Downstream App Design Guide

This guide explains how a downstream product should use RooIAM.

The short version:

- RooIAM should handle identity, login, and session infrastructure.
- Your app should own its own product data, profile data, and business rules.
- Do not turn RooIAM into your app database.

This is the design that scales cleanly for apps like `jotjum-web`, `howllo-web`, and other downstream products.

## What RooIAM Should Do

Use RooIAM for:

- sign-in
- sign-out
- identity proof
- OIDC / OAuth2 flows
- magic link / passkey / social login
- session issuance and revocation
- identity claims such as:
  - subject ID
  - email
  - verified identity attributes

RooIAM is the authentication and identity layer.

## What Your App Should Do

Your app should own:

- app user profile
- public display name
- avatar shown inside the app
- app-specific preferences
- activity history
- posts, comments, boards, workspaces, memberships
- moderation rules
- app permissions and product roles

Your app is the product layer.

## Correct Mental Model

Use this split:

1. RooIAM identity
- `rooiam_subject`
- login methods
- session state
- OIDC tokens / session cookies

2. App user record
- internal `user_id`
- `display_name`
- `avatar_url`
- app roles
- app activity
- app content ownership

In practice:

- RooIAM says: "this is user `sub=abc123`"
- your app says: "this user is `u_42`, display name `Paritt`, avatar `...`, moderator in workspace `howllo-6soj`"

That is the correct boundary.

## Recommended Data Model

Your downstream app should keep a local `users` table.

Example:

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  rooiam_subject TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
```

Recommended rule:

- `rooiam_subject` is the stable external identity key
- `id` is your app's internal user ID
- `display_name` and `avatar_url` belong to your app, not to RooIAM

## Correct Login Flow

Recommended downstream flow:

1. User signs in with RooIAM
2. RooIAM returns OIDC tokens or app callback result
3. Your app validates the identity
4. Your app exchanges the RooIAM access token for an app-owned session
5. Your app upserts a local user row using:
   - `rooiam_subject`
   - `email`
6. Your app opens or refreshes an app session or workspace session
7. Your app uses the local user row for product behavior

Important:

- first sign-in may provision the local user
- later sign-ins should not blindly overwrite app-owned profile fields
- downstream app behavior should run on the app-owned session, not on a RooIAM bearer token that was left sitting in browser storage

Good example:

- update local email if it changed
- keep local display name unless your app explicitly wants a sync policy

Bad example:

- overwrite `display_name` on every login from identity claims

That destroys app-owned profile data.

## Token Storage Rule

Do not treat a RooIAM OIDC access token as your app session token.

Recommended rule:

1. RooIAM returns an access token
2. your app or backend validates RooIAM identity
3. your app exchanges that RooIAM token for an app-owned session
4. your product runs on the app-owned session

Why:

- RooIAM bearer tokens are identity credentials
- your app session is product state
- separating them reduces accidental overexposure of RooIAM credentials in browser code
- it makes logout, workspace scoping, and product authorization easier to reason about

Bad pattern:

- storing RooIAM access tokens in `localStorage` as if they were the app's long-lived session key

Better pattern:

- use the RooIAM token only long enough to mint an app-owned session
- store the app-owned session according to your own product architecture

## Session Design

RooIAM session and app session are not the same thing.

You may have:

1. RooIAM session
- global identity session
- used for auth and identity verification

2. App session
- your app's active session
- may be scoped to one workspace, board, or tenant

For multi-workspace apps, this is often the best design:

- identity is global
- active app access is workspace-scoped

Example:

- user is known to RooIAM globally
- user is signed into `howllo-6soj`
- user is not automatically active in `jotjum-190063`

This is a product decision, not an identity bug.

Recommended downstream rule:

- one identity can exist across many workspaces
- one active app session should normally be scoped to exactly one workspace
- switching workspace should establish or confirm a workspace-specific app session

This keeps product boundaries clear even when identity is shared.

## Per-Workspace RooIAM Configuration

For multi-workspace products, do not assume one global RooIAM browser client is enough.

Good design:

- `1 workspace = 1 RooIAM app client or widget configuration`

That configuration may include:

- `client_id`
- widget base URL
- allowed embed origins
- redirect URIs
- branding

Why:

- each workspace may have a different domain or subdomain
- each workspace may need different widget branding
- custom domains and embed origins become much easier to manage

Bad pattern:

- one globally hardcoded RooIAM widget config reused across every workspace in the app

## Browser SDK vs Server SDK

Use `@rooiam/sdk-browser` for:

- browser login flow
- public login widget flow
- callback completion
- session-cookie self-service surfaces when you intentionally want RooIAM-owned account UI

Use `@rooiam/sdk-server` for:

- server-to-server integration
- workspace API access
- backend automation
- trusted integration calls with API keys

Simple rule:

- browser SDK for frontend auth flows
- server SDK for backend integration flows

## When To Store Profile In RooIAM

Only store profile fields in RooIAM if they are truly identity-level and shared across many apps.

Examples that can reasonably live in RooIAM:

- verified email
- legal name if identity-grade
- security settings
- passkeys / MFA state
- linked providers

Examples that usually should stay in your app:

- public display name inside the app
- avatar used only by the app
- bio
- public profile card
- workspace nickname
- moderator preferences
- app-specific settings

If the field affects product behavior or product presentation, it usually belongs in the app.

## Good Downstream Design

This is the recommended design:

- RooIAM handles login
- your app stores user profile locally
- your app stores activity locally
- your app stores roles locally
- your app stores workspace membership locally
- RooIAM subject links the local user to identity

Example:

```text
RooIAM subject -> app user -> workspace membership -> app content
```

This works well for:

- SaaS products
- multi-workspace apps
- community apps
- feedback boards
- collaboration products

## Bad Designs To Avoid

### 1. Using RooIAM as your app database

Bad:

- storing all app profile and product data in RooIAM
- making RooIAM responsible for app board history, posts, or product preferences

Why it is bad:

- wrong responsibility boundary
- harder product evolution
- tighter coupling
- identity system becomes product state storage

### 2. Overwriting local profile from RooIAM on every login

Bad:

- every sign-in resets `display_name` or avatar from identity claims

Why it is bad:

- user changes in your app are lost
- app no longer owns its own profile semantics

### 3. Assuming RooIAM self-service APIs are the same as app profile APIs

Bad:

- showing RooIAM session-management UI as if it were your app profile UI

Why it is bad:

- RooIAM self-service may depend on first-party cookie context
- app profile editing and identity security are different UX surfaces

### 4. Treating one global RooIAM login as automatic app access everywhere

Bad:

- user signs into one workspace and is silently active in every workspace

Why it is bad:

- weak product boundary
- confusing permissions
- dangerous for multi-workspace apps

### 4a. Using different auth rules for REST and realtime

Bad:

- REST requests resolve RooIAM identity one way
- websocket or realtime endpoints use a different token contract

Why it is bad:

- users appear signed in for normal pages but disconnected for realtime
- debugging becomes confusing
- hosted userinfo fallback and session-scoped app auth drift apart

Recommended rule:

- REST auth and realtime auth should resolve identity through the same downstream contract
- if your product supports an app-owned workspace session, realtime should accept that same session model too

### 5. Binding app roles directly to identity provider roles without local control

Bad:

- app permissions depend only on external claims

Why it is bad:

- app loses local control
- moderation and workspace permissions become brittle

Your app should still own its product permission model.

## Good UX Pattern

Recommended UI split:

### In your app

Show:

- app profile
- app avatar
- app display name
- app activity
- workspace membership
- product roles

### In RooIAM-owned surfaces

Show:

- security sessions
- passkeys
- MFA
- linked identity providers
- identity-level account security

If you combine them, do it deliberately and label the boundary clearly.

## Recommended Pattern For Howllo-Like Apps

For a workspace app like Howllo:

- RooIAM
  - login
  - OIDC
  - session verification

- Howllo
  - workspace-scoped session
  - local user row
  - display name
  - avatar
  - post history
  - board activity
  - roles in each workspace

Recommended sequence:

1. RooIAM login completes
2. Howllo validates the RooIAM identity
3. Howllo creates or refreshes a workspace-scoped app session
4. the browser uses the Howllo workspace session for app behavior
5. Howllo keeps profile, activity, and moderation state locally

Recommended rule:

- RooIAM is for "who are you?"
- Howllo is for "what can you do here, and how do you appear here?"

## Example Integration Policy

A strong default downstream policy is:

- On first login:
  - create local user from RooIAM subject + email
  - initialize display name from RooIAM once

- On later login:
  - update only safe identity fields like email
  - keep local app profile fields unchanged

This gives you a clean bootstrap without losing app ownership later.

## Design Checklist

Use this checklist when integrating RooIAM into a downstream app:

- Do we have a local `users` table?
- Do we store `rooiam_subject` locally?
- Do we keep app profile fields in the app?
- Do we avoid overwriting app profile on every login?
- Do we exchange RooIAM bearer tokens for an app-owned session?
- Do we distinguish identity session from app session?
- Do we scope app sessions per workspace when the product needs that boundary?
- Do we keep RooIAM config at the workspace level when the product is multi-workspace?
- Do we keep workspace roles in the app?
- Do we avoid using RooIAM as product storage?
- Do we treat RooIAM self-service as optional, not mandatory for app profile?
- Do REST and realtime endpoints use the same identity-resolution contract?

If the answer is yes to all of those, the design is probably healthy.

## Final Recommendation

The best downstream design is:

- RooIAM for authentication
- your app for product identity and product state

Do not collapse them into one thing.

That separation makes the app easier to maintain, easier to scale, and much easier to reason about.
