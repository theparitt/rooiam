# Rooiam 1.0 compatibility and conformance

Rooiam 1.0 is a **release target**, not an OpenID certification or an already deployed version. The compatibility contract below takes effect when a 1.0 release is tagged and its release checks pass. The REST `/v1` prefix, product milestone number, Rust crate version and SDK package versions are separate identifiers.

## Proposed supported surface

| Surface | 1.0 contract | Current evidence and limit |
|---|---|---|
| Self-hosted server and tenant portal | A matching server/portal release with PostgreSQL migrations, `/health` and `/ready`, and documented backup/restore and rollback | 0.5–0.8 changes are engineering checked; their combined production rollout is still pending |
| Tenant REST API | Documented `/v1` endpoints and response/error shapes; preserve request and permission behavior within 1.x | Existing API and isolation regressions; release-specific upgrade check still required |
| OIDC relying-party integration | Authorization code with S256 PKCE, discovery/JWKS, userinfo, confidential `client_secret_basic` or `client_secret_post`, public `none`, and app-owned callback/session | Local tests cover these integrations. OpenID Foundation Config OP and Basic OP results must be recorded separately; no certification is claimed |
| Browser and server TypeScript SDKs | Source-distributed `@rooiam/sdk-browser@0.1.0` and `@rooiam/sdk-server@0.1.0` against the documented `/v1` API | Node 22 package/consumer checks; these packages are not on npm |
| Android SDK | Source/local-Maven `com.rooiam:android-sdk:0.4.0-alpha.1` for API 26+ and the registered Play package/operator setup | Controlled reference-package evidence only; arbitrary tenant packages require their own vendor and device validation |
| iOS SDK | Experimental source, excluded from 1.0 support | Simulator build/tests only; no real iPhone/App Attest/distribution evidence |

Rooiam's hosted login is deliberately separate from a relying party's OIDC callback. A relying party must create its own application session after validating state, exchanging the code and validating tokens. Rooiam requires S256 PKCE even for confidential web clients. An OpenID certification profile may exercise features outside this stated integration contract; passing local checks does not imply that the complete profile passes.

In an isolated 2026-09-24 candidate run of the official OpenID Foundation suite, **Config OP passed** with HTTPS discovery and RSA JWKS. The first **Basic OP** happy-path module failed because it omitted PKCE and Rooiam rejected the request. Rooiam is not OpenID-certified. The live production origin has not been upgraded to this candidate; do not use the candidate result as a claim about `api.rooiam.com`.

## Compatibility rules after a 1.0 release

- A 1.x server must preserve documented `/v1` API and OIDC request/response behavior for supported clients. Additive optional fields and endpoints are allowed. A breaking change requires a new major product/API contract and a migration guide.
- Existing migrations are immutable. New schema changes use new migration numbers and must be tested on a copy of a prior-version database before deployment. Operators take a private backup and run the documented restore check before upgrading.
- SDK artifacts use their **own** version numbers. A supported SDK version is named in each server release's compatibility matrix; a product milestone does not silently change npm, Maven or Swift package coordinates.
- Deprecations are documented at least one minor release and 90 days before removal, whichever is longer, except when a security fix requires an earlier change. Release notes explain the replacement and any required consumer change.
- Security fixes may reject previously accepted unsafe input. Document the behavior and upgrade impact; never weaken tenant authorization, PKCE, callback matching or phone approval to satisfy an older client.

## Release evidence required

Before calling a build **Rooiam 1.0**, record the exact server/portal/SDK commit or artifact digests, an upgrade/restore result, API/OIDC/SDK/Android regression results, production rollout checks, and the OpenID Foundation suite plan IDs/results for the claimed OIDC profile. Publish only capabilities whose corresponding matrix passed. [The SDK upgrade guide](./17_sdk_support_and_upgrade.md) describes the current artifacts; the [production upgrade guide](../production/25_backup_restore_and_upgrade.md) covers operations. The 0.9 [iOS source guide](./18_ios_experimental_integration.md) remains experimental until physical-device evidence exists.
