# Rooiam Release Roadmap

This is the current release roadmap for Rooiam after the `0.1.0` codebase review.

The product lane is now explicit:

**Rooiam is the self-hosted passwordless IAM for multi-tenant SaaS.**

This roadmap exists to stop drift.
It is not a list of every interesting IAM feature.

## Roadmap rules

- do not compete on enterprise feature count yet
- do not broaden the audience yet
- finish the self-host + multi-tenant SaaS lane first
- favor clarity, operability, and integration speed over breadth

## Version positioning

- `v0.1` = foundation release
- `v0.2` = self-host trust + integration clarity
- `v0.3` = tenant/operator polish + first real production confidence
- `v1.0` = credible product for small and mid-size multi-tenant SaaS teams
- `v2+` = optional enterprise expansion only after market pull

## `v0.1` — foundation release

Status:

- shipped

What it proves:

- passwordless auth core exists
- multi-tenant workspace model exists
- hosted login exists
- tenant and operator surfaces exist
- OIDC and workspace integration direction exists

What it does not prove yet:

- easy self-host adoption
- low-friction first integration
- tenant/operator polish under real usage
- market fit outside the repo owner

## `v0.2` — self-host trust + integration clarity

Goal:

- make Rooiam easy to evaluate, easy to run, and easier to integrate

Priority areas:

- deployment doctrine clarity
- explicit public URL and mode behavior
- operator install flow
- production setup docs
- backup / restore guidance
- upgrade guidance
- one gold-standard integration path
- one gold-standard hosted login path
- one gold-standard OIDC app path

Success test:

- a technical team can self-host Rooiam and complete first integration without reading much source code

## `v0.3` — tenant/operator polish + production confidence

Goal:

- make the product feel safe and understandable in daily use

Priority areas:

- tenant workflow polish
- operator setup polish
- session and audit visibility polish
- repeated live-flow verification
- identity lifecycle cleanup
- clearer error states and recovery paths
- stronger product wording across UI and docs

Success test:

- a small SaaS team can run Rooiam in production and explain its behavior clearly to both operators and tenant admins

## `v1.0` — credible market-fit candidate

Goal:

- be a serious option for self-hosted multi-tenant SaaS identity

Priority areas:

- stable self-host installation path
- stable upgrade story
- clear integration docs and examples
- polished hosted login and tenant controls
- clear operator/tenant boundaries
- proven passwordless auth quality

Success test:

- an outside team can evaluate Rooiam as a real auth product, not just an interesting open-source project

## What stays out of scope until after `v1.0`

- SAML
- SCIM
- multi-region architecture
- reseller / franchise topology
- broad marketplace / connector work
- heavy cloud-hosted product breadth
- deep enterprise compliance packaging
- arbitrary customization engines

These may matter later.
They should not drive the next release sequence.

## `v2+` — only after market pull

Only consider this after:

- self-host adoption is real
- at least a few real integrations exist
- the core audience is clear

Then evaluate:

- SAML
- SCIM
- custom domains
- stronger enterprise lifecycle controls
- compliance packaging

## Current strategic priority

If a roadmap item does not clearly improve one of these, it should probably wait:

1. self-host trust
2. passwordless auth quality
3. multi-tenant SaaS fit
4. tenant/operator control
5. integration speed
