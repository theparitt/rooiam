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

## Release status

[Android phone sign-in and recovery](./roadmap.md) are available for evaluation, with the 0.3–0.4 flows tested on a Play-installed reference app. The 0.5–1.0 source changes remain release candidates until the matching backend and portal are deployed and checked together. The Android SDK and reference app are developer integrations, not a general-purpose tenant app.

## Start Here

- [SDK and Device Login Reference](./reference/13_sdk_and_device_login.md)
- [Android phone sign-in walkthrough](./getting-started/10_android_phone_sign_in_walkthrough.md)
- [Build an Android app with the SDK](./reference/14_android_sdk_integration.md)
- [Confirm API-key creation with an Android phone](./reference/15_phone_action_approval.md)
- [1.0 compatibility and OpenID conformance scope](./reference/19_compatibility_and_conformance.md)

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

## Public Reference Highlights

- [FAQ](./reference/07_faq.md)
- [Configuration Reference](./reference/06_configuration_reference.md)
- [Environment Variable Catalog](./reference/08_env_var_catalog.md)
- [Audit Log Reference](./reference/04_audit_log_reference.md)
- [Hosted Login URLs](./hosted_login_urls.md)

## Supporting Sites

- `rooiam-docs` on `5175`: public docs UI
- `rooiam-book` on `5176`: longer-form architecture / IAM textbook
