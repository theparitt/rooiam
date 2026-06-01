# Rooiam Docs Index

Rooiam is the self-hosted passwordless IAM for multi-tenant SaaS.

It gives you:

- hosted login
- tenant and workspace access control
- OIDC and app integration
- platform admin and audit tools

Use these docs when you want to run it yourself and keep control of your identity stack.

Current public truth:

- Rooiam already has a real product shape
- it is still early-stage
- it is best for evaluation, internal use, and early adopters today
- it is strongest when you want self-hosted passwordless IAM for a multi-tenant SaaS product

This page is the canonical public map for Rooiam docs.

If a page is not linked from here, it may still exist, but it is not part of the main public reading path.

> [!IMPORTANT]
> **Admin vs Portal**
> - **`rooiam-admin`**: platform operator console
> - **`rooiam-app`**: tenant login and workspace portal

## Start Here

- [Quick Start](./getting-started/00_index.md)
- [Production Guide](./production/00_index.md)
- [Reference Guide](./reference/00_index.md)
- [Development Guide](./development/00_index.md)

## Recommended Reading Paths

### I want to run Rooiam locally

- [Run the Demo Locally](./getting-started/01_run_demo_locally.md)
- [Run the Full Local Development Stack](./getting-started/02_run_local_development.md)
- [Choose the Right Surface](./getting-started/04_which_app_to_use.md)

### I want to operate Rooiam in production

- [Production Guide](./production/00_index.md)
- [Security Operations Playbook](./production/16_security_operations_playbook.md)
- [Operator Runbooks](./production/19_operator_runbooks.md)
- [Operator Guides](./production/20_operator_guides.md)
- [Release Security Checklist](./production/15_release_security_checklist.md)

### I want to integrate an app or backend

- [Reference Guide](./reference/00_index.md)
- [Integration API Contract](./reference/01_integration_api_contract.md)
- [Hosted Widget Integration Guide](./reference/03_hosted_widget_integration_guide.md)
- [Downstream Hosted Widget Callback Flow](./reference/11_downstream_hosted_widget_callback_flow.md)
- [API Key Cookbook](./reference/02_api_key_cookbook.md)
- [Integration Snippets](./reference/09_integration_snippets.md)

### I want architecture and concepts

- [Architecture](./architecture.md)
- [Data Boundaries](./identity_data_boundary.md)
- [Product Surface Map](./reference/05_product_surface_map.md)
- [Auth Models By Surface](./production/18_auth_models_by_surface.md)
- [Internal Market-Fit Review](./internal/37_market_fit_review_and_roadmap_2026-04-03.md)

## Public Reference Highlights

- [FAQ](./reference/07_faq.md)
- [Configuration Reference](./reference/06_configuration_reference.md)
- [Environment Variable Catalog](./reference/08_env_var_catalog.md)
- [Audit Log Reference](./reference/04_audit_log_reference.md)
- [Hosted Login URLs](./hosted_login_urls.md)

## Supporting Sites

- `rooiam-docs` on `5175`: public docs UI
- `rooiam-book` on `5176`: longer-form architecture / IAM textbook

## Developer Notes

The `docs/internal/` tree is maintainers-only planning and engineering context.
It is intentionally separate from the canonical public docs path.

---

## Developer Notes 🛠️

These notes are for the maintainers of Rooiam. They track our progress and internal plans.

### 🏗️ Engineering Index

- [Internal Home 🧿](./internal/00_index.md)
- [Current Status 📅](./internal/34_current_status_2026-03-21.md) (Check here for today's work)
- [Features List ✅](./internal/features.md)
- [Data Flow 🌊](./internal/data_flow.md)
- [Code Style ✨](./internal/code_styling.md)

### 🗺️ Product Plans & Roadmaps

- [Master Plan 🗺️](./internal/master_plan.md)
- [Product Phases 📈](./internal/product_phases.md)
- [Release Roadmap 🚀](./internal/release_roadmap.md)
- [Server Roadmap 🏗️](./internal/server_roadmap.md)
- [Product Policy 📜](./internal/product_policy.md)

### 🏁 Phase Checklist

- [Tenant Model](./internal/tenant_admin_model.md)
- [UI Plan](./internal/tenant_ui_plan.md)
- [Developer Platform Checklist](./internal/phase2_developer_platform_checklist.md)
- [API Test Checklist](./internal/phase2_rest_api_test_checklist.md)
- [Phase 3 Details](./internal/phase3_implementation.md)
- [Phase 4 Details](./internal/phase4_implementation.md)
- [Phase 5 Demo Checklist](./internal/phase5_demo_checklist.md)
- [Self Host Checklist](./internal/phase6_self_host_checklist.md)
