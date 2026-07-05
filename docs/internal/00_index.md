# Internal Notes

This section is for engineering notes that are useful inside the repo but are not part of the normal product setup flow.

Use these pages as internal reference, not as the main operator or tenant docs:

- [Developer Manual](./DEVELOPERS.md)
- [Failure Notes](./FAILURES.md)
- [Marketing Notes](./MARKETING.md)

## Deep Technical Reference (generated 2026-03-12)

Generated from a full read of the Rust source — accurate as of the current codebase:

- [Security Model](./01_security_model.md) — token hashing, OIDC signing, session security, auth policy enforcement, demo mode security boundaries
- [Auth Flows](./02_auth_flows.md) — step-by-step for magic link, OAuth, demo OAuth, passkey, TOTP MFA, OIDC authorization code, session lifecycle
- [API Reference](./03_api_reference.md) — all endpoints grouped by module with method, path, auth requirement, and description
- [Demo Mode](./04_demo_mode.md) — how to enable, demo users and orgs, demo OAuth pages, account selection logic, audit tagging, limitations
- [Known Issues](./05_known_issues.md) — confirmed bugs and design gaps with severity ratings and recommended fixes
- [Security Remediation Checklist](./06_security_remediation_checklist.md) — selected fixes from the March 12, 2026 review with implementation status
- [Security Remediation Notes](./07_security_remediation_notes_2026-03-12.md) — rationale and behaviour changes for the implemented fixes
- [Domain Model](./08_domain_model.md) — canonical terminology for workspace, app, policy hierarchy, and branding constraints
- [Rooiam Admin Test Checklist](./09_rooiam_admin_test_checklist.md) — manual verification checklist for the `rooiam-admin` platform console
- [System Feature Test Checklist](./10_system_feature_test_checklist.md) — cross-surface release checklist for server, admin, app, demo, and deployment flows
- [Demo Login Hint Rules](./11_demo_login_hint_rules.md) — placement, wording, numbering, and click-to-fill pattern for demo login hints
- [Demo Badge Rules](./12_demo_badge_rules.md) — standardized overlay treatment for the Demo badge on logos and wordmarks
- [Demo Governance](./13_demo_governance.md) — what stays editable in demo mode, what gets locked, and how locked screens should explain themselves
- [Rooiam Admin Demo Validation — 2026-03-13](./14_rooiam_admin_demo_validation_2026-03-13.md) — confirmed demo-mode behavior for admin auth, locked settings, seeded data, demo isolation, and reset/reseed checks
- [UI System Rules](./15_ui_system_rules.md) — shared layout, spacing, overview, badge, audit-event, and naming rules for `rooiam-admin` and `rooiam-app`
- [Rooiam App Demo Validation — 2026-03-14](./16_rooiam_app_demo_validation_2026-03-14.md) — confirmed tenant-portal demo behavior for root login, workspace signals, member detail, seeded assets, and demo locks
- [Current Status — 2026-03-14](./17_current_status_2026-03-14.md) — current role model, nav scope model, demo account split, admin scalability work, Phase 2 server progress, and the remaining next steps
- [Current Status — 2026-03-15](./18_current_status_2026-03-15.md) — full Phase 1–5 checklist, Phase 3 active items and build order, admin UX improvements, session revocation feature
- [Current Status — 2026-03-17](./20_current_status_2026-03-17.md) — Phase 4 complete; 40 test files (297 requests); full endpoint coverage (30–39)
- [Current Status — 2026-03-17b](./22_current_status_2026-03-17b.md) — prior status snapshot — Phase 5 + 6 complete; latest full validation pass at that time: 56 test files (492 requests); security architecture + control plane maturity done
- [Reserved Workspace Slugs](./23_reserved_slugs.md) — full list of blocked slugs, the routes they protect, and instructions for updating the list
- [Frontend File Naming And Modules](./25_frontend_file_naming_and_modules.md) — canonical naming rules for page files, default exports, route scopes, and shared frontend module organization
- [Operator Flow Matrix — 2026-03-20](./26_operator_flow_matrix_2026-03-20.md) — role-by-role simulation of real admin and tenant tasks with `Works / Awkward / Missing` assessment and next UX gaps
- [Current Status — 2026-03-20](./27_current_status_2026-03-20.md) — prior status snapshot — current control-plane and tenant-portal state after the March 20 UX, naming, app-detail, and operator-flow cleanup pass
- [Current Status — 2026-03-21](./34_current_status_2026-03-21.md) — current state after documentation UX overhaul, Docker MinIO storage integration, and OIDC redirect bugfixes
- [Commercial-Grade Improvements — 2026-03-23](./35_commercial_grade_improvements_2026-03-23.md) — **latest** — OIDC cascade revocation, member removal, account deletion, TOTP session revoke, profile audit log, request logging, security headers, email domain validation, and 26/26 integration tests
- [Market-Fit Review And Roadmap — 2026-04-03](./37_market_fit_review_and_roadmap_2026-04-03.md) — **latest strategy** — brutal positioning review, what to cut, what to double down on, and the realistic path to market fit
- [Rooiam Server v0.1 Quality Checklist — 2026-04-03](./38_rooiam_server_v0_1_quality_checklist_2026-04-03.md) — working backend cleanup list for bootstrap, handlers, narrow APIs, and test coverage
- [Device Login Plan](./40_device_login_plan.md) — cross-device login design: phone-as-authenticator (QR scan / number match / 6-digit code), server endpoints, security model, build order
- [SDK Plan](./41_sdk_plan.md) — two TS packages (browser + server), monorepo by language, OpenAPI generated from code (`utoipa`), build order
- [OpenAPI + SDK Phases](./42_openapi_sdk_phases.md) — **execution plan + live status** — Phase A (OpenAPI foundation) done; B–F for integration annotation, TS SDKs, consumer refactor, multi-language
- [Mobile Device Login Contract](./44_mobile_device_login_contract.md) — exact Android/iOS/fake-phone contract for trusted-device registration, QR preview, payload signing, and approval
- [Audit Log Scope Doctrine](./28_audit_log_scope_doctrine.md) — canonical rules for what Platform, Tenant, Workspace, App, and My audit logs include and exclude across `rooiam-admin` and `rooiam-app`
- [Data Flow Doctrine](./29_data_flow_doctrine.md) — canonical scope/entity/page-type/source-of-truth rules for lists, detail pages, create flows, settings, danger zones, and navigation
- [Rooiam App Owner vs Admin Permission Matrix — 2026-03-20](./30_rooiam_app_owner_admin_permission_matrix_2026-03-20.md) — current `5172` authority comparison for workspace owner vs workspace admin, including what each role can view, edit, create, delete, and where owner-only controls begin
- [Rooiam Admin Platform Owner vs Platform Admin Permission Matrix — 2026-03-20](./31_rooiam_admin_platform_owner_admin_permission_matrix_2026-03-20.md) — current `5171` authority comparison for platform owner vs platform admin, including what each role can view, edit, create, delete, and where owner-only controls begin
- [Callback And Redirect Doctrine — 2026-03-20](./32_callback_and_redirect_doctrine_2026-03-20.md) — canonical distinction between provider callbacks, app callbacks, hosted login redirects, and the correct use of `workspace_id`, `workspace_slug`, and `client_id`
- [Rooiam Demo OIDC And End-User State — 2026-03-20](./33_rooiam_demo_oidc_and_end_user_state_2026-03-20.md) — current `5174` downstream-app state after the real OIDC, hosted-login, workspace-scenario, and end-user self-service pass

The canonical product documentation for users and operators stays under the main docs sections:

- [Demo](../demo/00_index.md)
- [Development](../development/00_index.md)
- [Production](../production/00_index.md)
