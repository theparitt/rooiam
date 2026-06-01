# Client And Workspace Context

This document defines the next design step for Rooiam's multi-tenant app flow.

## Problem

Today Rooiam already knows:

- who the user is
- which organizations the user belongs to
- which OAuth client is being used for OIDC flows
- which organization is active in the current session (`current_org_id`)

But the product does not yet express one important runtime fact clearly:

> which app the user signed into, and which workspace/org that sign-in was for

That gap shows up in:

- hosted login feeling generic across apps
- audit logs showing identity events without enough app context
- admin visibility not clearly answering "which app did this user enter?"
- tenant flows feeling under-specified when a user belongs to many organizations

## Target Runtime Model

Rooiam should treat a sign-in as:

- `user`
- `client`
- `workspace`
- `session`

In plain language:

- `user` answers "who signed in?"
- `client` answers "which app are they entering?"
- `workspace` answers "which tenant/org context is intended?"
- `session` answers "what active browser session carries that state?"

## Current State

Current implementation already covers parts of this:

- `oauth_clients` and redirect URIs identify downstream apps
- `organization_members` and `organizations` model tenant membership
- `sessions.current_org_id` stores active organization context
- `POST /v1/orgs/switch` changes active org context after sign-in

What is missing is first-class sign-in context that preserves:

- app/client intent at the start of login
- optional org/workspace hint through auth and MFA
- app + workspace visibility in audit and admin surfaces

## Recommended Flow

### 1. App starts login with both client and workspace intent

A downstream app should be able to start auth with:

- `client_id`
- `redirect_uri`
- optional `org_id` or `org_slug`

Examples:

- OIDC flow for a first-party app
- hosted magic-link flow with `redirect_uri`
- passkey or OAuth login with an org hint

### 2. Rooiam preserves that context through the whole auth flow

The following flows should carry the same context:

- magic link start -> verify
- Google login
- Microsoft login
- passkey login
- MFA challenge

That means login state records should preserve:

- `client_id` or client reference
- `redirect_uri`
- `org_id` or `org_slug` if supplied

### 3. Session can adopt workspace context on success

On successful sign-in:

- if the supplied org belongs to the user, Rooiam can set `current_org_id`
- if no org is supplied, app can later choose/switch workspace
- if the org hint is invalid, Rooiam should fail clearly or let the app choose a workspace later

### 4. App receives a sign-in that is no longer generic

After login, the app should know:

- user identity
- client/app context
- current workspace/org context

That is the point where a real tenant product flow becomes clear.

## Minimal Data Model Additions

Rooiam does not need a huge schema rewrite to improve this.

The smallest useful additions are:

- preserve `client_id` and optional `org_id` / `org_slug` in auth state
- preserve the same fields in MFA challenge state
- include client + workspace metadata in audit events
- surface current client/workspace context in session and admin UI

Optional future additions:

- `last_client_id` on session
- explicit auth-transaction records
- app-specific preferred workspace mapping

## Admin UI Impact

Admin should eventually be able to see:

- user
- app/client
- workspace/org
- time
- auth method
- MFA used or not

This should affect:

- `Audit Logs`
- session views
- future tenant/app diagnostics

## Hosted App Impact

The hosted auth app should stop feeling like a generic fallback.

It should be able to say things like:

- "Sign in to AraiHub"
- "Continue to Acme workspace"

That requires client + workspace context to be present at login start.

## Relationship To `candycloud-web`

This design is best validated in `candycloud-web`.

`candycloud-web` should be the first app that demonstrates:

- sign in to a specific app
- preserve redirect target
- preserve or select workspace/org context
- land in a real app dashboard instead of a generic fallback page

## Recommended Implementation Order

1. Add optional `org_id` / `org_slug` hint to hosted auth start flows.
2. Preserve client/workspace context through magic link, OAuth, passkey, and MFA state.
3. Write that context into audit metadata.
4. Show app + workspace context in admin session/audit views.
5. Validate the whole design in `candycloud-web`.

## Short Version

Rooiam is already multi-tenant at the identity layer.

The next gap to close is:

> sign-in should carry both app context and workspace context, not just user identity

That is what will make tenant-side flows feel correct when the product ecosystem grows.
