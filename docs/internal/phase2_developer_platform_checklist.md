# Phase 2 Developer Platform Checklist

This document defines what Rooiam must complete to be considered a real **Phase 2 developer identity platform**.

Phase 2 is not done when OIDC endpoints merely exist.

Phase 2 is done when:

- a developer can plug an app into Rooiam
- the integration is predictable
- token lifecycle is production-safe
- auth behavior is consistent across flows
- the docs and SDK story are good enough that teams trust the platform

## Goal

Make Rooiam a reliable hosted identity platform for application developers.

At the end of this phase, a developer should be able to:

1. register an app
2. configure redirect URLs safely
3. send users through hosted login
4. receive and exchange authorization codes
5. validate issued tokens correctly
6. refresh and revoke tokens safely
7. integrate without reverse-engineering Rooiam internals

## Definition Of Done

Phase 2 is complete when all of these are true:

- OIDC/OAuth flows are complete enough for real apps
- client management is safe and production-usable
- hosted login behavior is consistent across auth methods
- public developer docs exist
- at least one good SDK exists
- error handling is predictable enough for real integrations

## Current Position

Rooiam is already strong in:

- OIDC discovery and authorization-code foundations
- hosted login and multi-method sign-in
- multi-tenant structure
- auditability and session foundations

Rooiam still needs work in:

- token lifecycle completion
- developer-facing integration polish
- OAuth client operational quality
- standardization of errors and security rules

## Checklist

## 1. OAuth / OIDC Lifecycle

Must-have:

- [ ] authorization-code flow works reliably for production apps
- [ ] refresh-token grant is implemented
- [ ] refresh token rotation is implemented
- [ ] refresh token invalidation rules are documented
- [ ] token revocation endpoint exists
- [ ] logout behavior is defined for browser session and OAuth token lifecycle

Nice-to-have:

- [ ] client credentials grant if Rooiam will support machine-to-machine use in this phase

Notes:

- Rooiam does not need every OAuth feature ever made
- it does need a trustworthy token lifecycle

## 2. Token Validation And Revocation

Must-have:

- [ ] `/oauth/revoke` exists and is documented
- [ ] access-token validation guidance is documented for downstream apps
- [ ] ID-token validation requirements are documented
- [ ] issuer, audience, expiry, and signature validation are clearly specified

Should-have:

- [ ] `/oauth/introspect` exists if Rooiam will support gateway/service-side token checks beyond JWT self-validation

Notes:

- revocation matters earlier than introspection
- introspection becomes more important if opaque tokens or API gateways are a first-class target

## 3. OAuth Client Management

Must-have:

- [ ] client type distinctions are clear: public vs confidential
- [ ] redirect URI validation is strict and safe
- [ ] redirect URI rules are documented
- [ ] client secrets are only shown when appropriate
- [ ] confidential clients can rotate secrets
- [ ] client metadata is understandable from admin and tenant surfaces

Should-have:

- [ ] environment separation guidance for dev / staging / production clients
- [ ] client disable / pause lifecycle is defined

## 4. PKCE And Security Correctness

Must-have:

- [ ] PKCE is required for public clients
- [ ] PKCE handling is documented with examples
- [ ] non-PKCE authorization-code paths are limited to appropriate confidential-client cases
- [ ] OAuth error responses are standardized
- [ ] auth failures return predictable OAuth-compliant error codes

Examples of error consistency to lock down:

- `invalid_client`
- `invalid_grant`
- `invalid_scope`
- `access_denied`
- `unsupported_response_type`

## 5. Hosted Login Consistency

Must-have:

- [ ] hosted login redirect behavior is consistent across login methods
- [ ] session creation rules are consistent across magic link, OAuth provider login, passkey, and MFA completion
- [ ] tenant branding and tenant login context resolve predictably
- [ ] MFA enforcement is consistent across equivalent auth paths
- [ ] success and failure audit events are emitted consistently

This is not optional polish.
This is what makes developers trust the hosted login surface.

## 6. Developer Experience

Must-have:

- [ ] public integration guide for OAuth / OIDC app setup
- [ ] step-by-step example from app registration to callback handling
- [ ] token validation guide for downstream apps
- [ ] callback and redirect troubleshooting guide

Recommended first SDK target:

- [ ] JavaScript / TypeScript SDK

Good next SDKs:

- [ ] Node helpers
- [ ] Go examples or helpers
- [ ] Rust examples or helpers

SDK responsibilities should include:

- redirect helpers
- callback helpers
- token verification helpers
- session/cookie helpers where relevant

## 7. Developer-Facing Documentation

Must-have docs:

- [ ] how to register an app
- [ ] how to build the authorize URL
- [ ] how to exchange the code
- [ ] how to validate the ID token
- [ ] how to use refresh tokens
- [ ] how logout and revocation work
- [ ] how tenant/workspace context affects login

Recommended examples:

- [ ] Next.js
- [ ] Express
- [ ] FastAPI
- [ ] Actix or Rust example

## 8. Operational Reliability For Developers

Must-have:

- [ ] predictable rate-limiting behavior for OAuth endpoints
- [ ] audit visibility for app login events
- [ ] safe default token lifetimes
- [ ] JWKS exposure is stable and documented
- [ ] callback URL mismatches are reported clearly

Should-have:

- [ ] webhooks or event notifications for app-auth lifecycle events
- [ ] environment-specific deployment examples

## 9. Product Quality Gates

Before calling Phase 2 complete, verify:

- [ ] a new developer can integrate a sample app in a short guided session
- [ ] hosted login works the same way across major auth methods
- [ ] token refresh works without surprising session loss
- [ ] revocation behavior is testable
- [ ] redirect URI mistakes produce understandable failures
- [ ] docs are enough that the integration does not depend on reading server code

## Minimum Ship Set

If Rooiam needs a smaller practical target, this is the minimum credible Phase 2 completion set:

- [ ] refresh-token grant
- [ ] refresh rotation
- [ ] token revocation
- [ ] PKCE enforcement by client type
- [ ] safe client management rules
- [ ] OAuth error consistency
- [ ] public integration docs
- [ ] one strong JS/TS SDK

That is the minimum line between:

- "OIDC exists"

and

- "Rooiam is a developer identity platform"

## What Comes Next

After this checklist is substantially complete, the priority shifts toward Phase 3 concerns:

- tenant policy systems
- role and permission maturity
- organization-wide operational controls
- compliance and audit depth
- federation and enterprise identity features

Phase 2 is the developer trust phase.
Phase 3 is the tenant-control phase.
