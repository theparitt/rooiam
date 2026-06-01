# Rooiam Product Policy

This document is the product doctrine for Rooiam.

It exists to prevent Rooiam from drifting into random feature sprawl or implementation-by-accident.

Every roadmap, architecture, UI, API, and workflow decision should be judged against this policy.

## Short Internal Motto

**Rooiam is the self-hosted passwordless IAM for multi-tenant SaaS.**

## 1. Rooiam Is For Multi-Tenant SaaS First

Rooiam is not trying to be identity software for every possible company on day one.

The primary target is:

- small and mid-size SaaS teams
- products with many customer workspaces
- teams that want hosted login and app integration
- teams that want to self-host or keep strong infrastructure control

If a feature does not help this core user, it should be deprioritized.

## 2. Rooiam Is An Identity Platform, Not A Login Widget

Rooiam is built to manage identity as a platform layer across products and organizations.

Rooiam owns:

- user identity
- authentication methods
- session lifecycle
- organization and workspace membership
- client and application identity integration
- auditability of security-critical actions

Rooiam does not try to own:

- application-specific business data
- app-local workflow rules
- arbitrary downstream product behavior

## 3. Rooiam Favors Clarity Over Feature Sprawl

Rooiam should be easier to understand than traditional IAM systems.

Core concepts should stay small and consistent:

- user
- workspace
- application
- session
- policy
- membership

New functionality should fit these concepts cleanly.

If a feature adds complexity without clearly improving:

- identity security
- tenant control
- developer integration
- self-host trust

then it should be deferred or rejected.

## 4. Rooiam Is Passkey-First And Modern-Auth Friendly

Rooiam prioritizes modern authentication methods:

- passkeys
- passwordless login
- strong session management
- MFA where appropriate

Legacy methods may be supported when market demand is real, but legacy patterns should not define the product.

## 5. Rooiam Is Built For Multi-Tenant SaaS From The Start

Multi-tenant identity is not an add-on.

Rooiam must support:

- one user across multiple workspaces
- workspace-specific roles and policies
- workspace branding and login configuration
- workspace-scoped auditability
- workspace-owned downstream applications

Tenant boundaries must stay explicit and safe throughout the product.

## 6. Rooiam Values Tenant Operational Control, Not Just Authentication

A tenant should be able to operate its identity environment with confidence.

Rooiam should provide clear control over:

- enabled login methods
- MFA requirements
- workspace branding
- members and invitations
- workspace clients and app access
- security-relevant activity

A technically correct IAM system is not enough.
Rooiam must also be operable by organizations.

## 7. Rooiam Must Be Pleasant For Developers To Integrate

A protocol implementation alone is not enough.

Rooiam should optimize for:

- strong OIDC correctness
- clear redirect and callback behavior
- predictable token claims
- safe client registration
- high-quality SDKs and examples
- documentation that gets a developer from setup to first login quickly

Developer time-to-success is a product feature.

## 8. Rooiam Must Remain Self-Host Friendly

Rooiam should remain practical for teams that want identity inside their own infrastructure.

This means prioritizing:

- simple deployment
- understandable configuration
- upgrade guidance
- backup and restore guidance
- predictable operational behavior

Rooiam should not depend on platform lock-in to be valuable.

## 9. Rooiam Prefers Strong Defaults Over Endless Customization

Customization should be safe and structured.

Rooiam should prefer:

- controlled branding slots
- safe policy toggles
- constrained templates
- explicit inheritance rules

Rooiam should avoid becoming:

- an unbounded theme engine
- an arbitrary scripting surface
- a policy maze with unclear override behavior

## 10. Rooiam Should Complete Standards And Lifecycle Basics Before Enterprise Breadth

Rooiam should finish the fundamentals before chasing enterprise checklists.

Priority order:

- secure identity graph
- session correctness
- OIDC quality
- MFA and recovery flows
- tenant control-plane polish
- self-host adoption

Enterprise features such as:

- SAML
- SCIM
- advanced compliance controls

should come after the core is proven.

## 11. Rooiam Competes By Being Simpler, Lighter, And More Operable

Rooiam does not win by copying every IAM vendor.

Rooiam should aim to be:

- simpler than Auth0
- lighter than Keycloak
- more tenant-aware than Firebase Auth
- more self-host friendly than Clerk
- more complete as an identity platform than narrow SSO tools

The goal is not maximum surface area.
The goal is a cleaner identity platform.

## 12. Rooiam Should Not Chase Enterprise Checklists Before Market Proof

The product should not spend its best time early on:

- SAML
- SCIM
- complex compliance packaging
- marketplace sprawl
- multi-region architecture
- reseller topology

unless real market pull proves they are needed

These may become important later.
They should not define the near-term roadmap.

## Decision Rule

When evaluating a new feature, Rooiam should ask:

1. Does this improve identity security?
2. Does this improve tenant control?
3. Does this improve developer integration quality?
4. Does this improve self-host or operational trust?
5. Does this fit the platform cleanly without adding confusion?
6. Does this help the self-hosted multi-tenant SaaS lane specifically?

If the answer is mostly no, the feature should wait.

## Engineering Consequence

This doctrine should affect implementation directly:

- finish standards and lifecycle basics before broadening feature scope
- prefer consistent primitives over one-off complexity
- reject UI and API drift that weakens clarity
- keep tenant boundaries explicit in code and product structure
- treat developer operability as part of the core product, not optional polish

## Usage

Use this document as the first reference for:

- roadmap planning
- product scope decisions
- API design choices
- admin and tenant UI decisions
- agent or AI implementation guidance
