# Rooiam Release Roadmap

Updated: 2026-09-23. This is the current release sequence, superseding the older SDK-only 0.2 and separate 0.3–0.8 device rollout.

**Rooiam is the self-hosted passwordless IAM for multi-tenant SaaS.**

## Version positioning

| Version | Goal | Status |
|---|---|---|
| 0.1 | Passwordless identity, workspaces, hosted login and OIDC foundation | Current package version; checkout also includes OpenAPI, TypeScript SDKs and device-login server code |
| 0.2 | Trusted Device & QR Authentication — Scan. Match. Approve. | Active: server foundation exists; contract review is the current gate; Android/browser product flow is not implemented |
| 0.3 | Tenant/operator polish and production confidence | Follow-up direction; scope informed by 0.2 adoption |
| 1.0 | Stable, credible self-hosted identity for small and mid-size SaaS teams | Requires repeatable installs, upgrades, integrations and operational evidence |

## 0.2 — Focused security and product milestone

The [public roadmap](../roadmap.md) defines product scope and acceptance. The [implementation plan](./43_v0.2_plan_brief.md) defines code mapping, protocol decisions, phases and release evidence.

Build sequence:

1. Reconcile and freeze the existing contract and security model.
2. Verify device trust, tenant policy and single-use browser completion.
3. Complete Android and hosted-login QR UX.
4. Extend existing TypeScript SDKs, reference demo and self-host docs.
5. Collect security, live-server, real-device and fresh-clone release evidence.

OpenAPI and SDK foundations already exist. Extend and verify them rather than treating them as unstarted work. Preserve working passwordless, MFA and OIDC flows. Security and audit tests run throughout delivery.

### Current progress

- **Complete foundation:** device registration/revocation routes, signed approval, number matching, browser-bound status/completion, conditional database transitions, tenant enablement, MFA-aware completion, audit events, endpoint rate limits, attestation verifier paths and OpenAPI annotations.
- **Verified locally on 2026-09-23:** 53 device-login tests passed; TypeScript SDK unit suites passed (browser 44 with 7 live tests skipped, server 26 with 5 live tests skipped); documentation links passed.
- **Incomplete:** live PostgreSQL/race/failure evidence, production-mode abuse checks, refreshed SDK OpenAPI snapshot, device-specific SDK helpers, fake-phone harness, hosted-login QR UI, Android client, reference demo and real-device/fresh-clone certification.
- **Known contract risk:** `/complete` marks an approved intent consumed before session/MFA response construction. Failure recovery and exactly-once session behavior need explicit tests and, if necessary, a transactional redesign.

The canonical progress report is [Current Status — 2026-09-23](./45_v0.2_current_status_2026-09-23.md). Update it when a gate changes; do not infer release readiness from the presence of server routes.

## Later work and scope limits

Tenant controls, session/audit visibility, recovery clarity and operator workflows continue after 0.2. iOS, push approval, Rust SDK and broader identity-sensitive approvals are candidates, not version promises. Push-token storage is not push delivery.

Defer SAML, SCIM, password-login expansion, multi-region, reseller topology, marketplace breadth and heavy enterprise packaging until real demand supports them. Keep application business data and payment workflows outside the identity platform.

## Planning sources

- [Product policy](./product_policy.md) — product doctrine.
- [0.2 implementation plan](./43_v0.2_plan_brief.md) — current execution scope.
- [Mobile contract](./44_mobile_device_login_contract.md) — current wire behavior, updated with each implementation change.
- [Device-login design history](./40_device_login_plan.md) and [OpenAPI/SDK phases](./42_openapi_sdk_phases.md) — supporting context; historical version assignments do not override this roadmap.
