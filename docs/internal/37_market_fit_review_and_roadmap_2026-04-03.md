# Market-Fit Review And Roadmap — 2026-04-03

This note is the current blunt product review for Rooiam after reading the `0.1.0` codebase, landing page, docs, and deployment model.

It exists to answer three questions clearly:

1. What is the real product?
2. What should we cut or delay?
3. What path gives Rooiam the best chance to survive in the market?

## Short answer

Rooiam should position itself as:

**The self-hosted passwordless IAM for multi-tenant SaaS.**

That is the strongest lane visible in the current codebase.

Rooiam should not position itself as:

- a generic IAM for every company
- a broad enterprise identity suite
- a consumer auth toolkit
- a general-purpose identity cloud competitor

## Brutal product-positioning review

### What is strong

The code already shows a real and differentiated shape:

- passwordless-first login
- strong multi-tenant workspace model
- clear split between platform admin and tenant/workspace admin
- hosted login plus tenant portal
- OIDC and app integration direction
- audit and session control
- self-host deployment path

This is more serious than a simple login page.
It already looks like a product for SaaS teams that have:

- many customer workspaces
- one shared identity system
- a need for hosted login and tenant controls
- a reason to self-host

### What is weak

The current product story is still too broad.

The repo talks like it might be:

- a login system
- an IAM textbook
- a tenant admin suite
- an OIDC provider
- an ecosystem identity layer
- a future enterprise platform

All of those are true in pieces.
Together, they make the message soft.

The biggest market risk is not missing features.
The biggest market risk is:

- too many concepts
- too many audiences
- too many future promises

### Real market lane

The best lane is:

- self-hosted
- passwordless
- multi-tenant SaaS
- hosted login
- workspace access control
- OIDC for downstream apps

Simple target customer:

- a small or mid-size SaaS team
- building B2B software
- with many customer workspaces
- wanting control over auth
- not wanting to hand identity to a hosted vendor

### Enemies in the market

Rooiam should not try to beat all of these at once:

- Auth0 / WorkOS on enterprise breadth
- Clerk on polish and hosted speed
- Supabase Auth on “already in my stack”
- Keycloak on giant protocol surface

Rooiam wins only if it is:

- clearer than Keycloak
- more self-host friendly than Clerk
- more tenant-aware than simple auth products
- more operationally understandable than Auth0-style platforms

## What to cut or delay

These are not “bad ideas”.
They are bad priorities for now.

### Cut from near-term positioning

- generic “identity for your whole product” language
- broad “platform for every ecosystem” messaging
- too much emphasis on future enterprise breadth
- white-label platform mode as near-term story
- reseller / franchise topology as near-term story
- multi-region as near-term story
- marketplace / connector sprawl before core adoption
- deep hosted-cloud positioning before self-host wins

### Delay until market pull is real

- SAML
- SCIM
- advanced compliance packaging
- directory sync
- complex delegated admin hierarchies
- heavy no-code customization
- arbitrary theme / template engines
- very broad SDK program

### Be careful with

- ecosystem-specific lock-in roadmap for first-party apps

Reason:

- it can help later as proof
- but too much internal-ecosystem thinking can hide whether outside teams actually want the product

## What to double down on

### 1. One clear promise

Repeat this everywhere:

**The self-hosted passwordless IAM for multi-tenant SaaS.**

### 2. One buyer shape

Optimize for:

- technical founder
- small infra team
- SaaS engineer
- B2B app team with many customer workspaces

### 3. Self-host trust

This should become one of the main reasons to choose Rooiam:

- simple deployment
- explicit config
- clear upgrades
- backup and restore guidance
- stable operator model
- no mystery cloud dependencies

### 4. Integration speed

A team should be able to:

1. run Rooiam
2. create a workspace
3. register an app
4. complete hosted login
5. read current identity

in a short, predictable path

### 5. Tenant/workspace control plane

This is one of the real differentiators already visible in the code:

- workspace branding
- workspace sign-in policy
- invites and roles
- workspace apps / clients
- workspace audit trail

### 6. Passwordless quality

Rooiam should be known for:

- magic link
- passkeys
- good session control
- MFA where needed

not for “also supports every old auth pattern”

## Do now

- make the product message very clear:
  - Rooiam is the self-hosted passwordless IAM for multi-tenant SaaS
- make self-host setup easy to trust
- make first integration easy to understand
- improve hosted login, tenant portal, and operator flows
- fix docs so they match the real product
- make the demo and example apps show the best real use case
- improve passwordless quality:
  - magic link
  - passkey
  - MFA
  - session handling
- improve tenant and workspace control:
  - branding
  - members
  - invites
  - access policy
  - audit logs
- improve operator confidence:
  - setup
  - production config
  - backup and restore guidance
  - upgrade guidance

## Do later

- SAML
- SCIM
- custom domains
- deeper compliance packaging
- more SDKs
- broader connector ecosystem
- deeper lifecycle controls beyond the most important ones
- hosted cloud product expansion
- deeper ecosystem integrations with first-party apps
- advanced analytics and reporting
- more enterprise policy layers

## Do not do now

- do not market Rooiam as identity for everyone
- do not market it as a giant IAM platform already
- do not chase enterprise checklists too early
- do not build many big features just because competitors have them
- do not add too many new product concepts at once
- do not turn customization into an unbounded theme engine
- do not spread effort across too many audiences
- do not promise more than the current product can clearly deliver
- do not let roadmap language sound bigger than product reality

## Simple decision rule

If a roadmap item clearly helps one of these, it is probably a `Do now` item:

- easier to self-host
- easier to integrate
- better passwordless auth
- better tenant and workspace control
- better operator trust

If it does not clearly help one of those, it probably belongs in `Do later` or `Do not do now`.

## Realistic roadmap to market fit

## Stage 1: Survive self-host evaluation

Goal:

- make a serious technical buyer say “I can run this and trust it”

Must win:

- local demo works fast
- local production is understandable
- hosted production config is explicit and safe
- upgrade and backup story is written
- docs stop fighting the code

Success signal:

- an engineer can self-host Rooiam without reading the whole source code

## Stage 2: Win the first integration

Goal:

- make one real multi-tenant SaaS app integrate Rooiam end to end

Must win:

- one reference integration flow that feels boring and predictable
- one best-practice path for hosted login
- one best-practice path for OIDC app registration
- clean callback / redirect doctrine
- clear app/workspace/client naming

Success signal:

- a developer can integrate a real SaaS app in 1–2 days without confusion

## Stage 3: Become operable by tenants

Goal:

- make tenant admins comfortable using the product without operator help

Must win:

- workspace branding
- workspace sign-in methods
- invites and member lifecycle
- session and audit visibility
- good empty states and explanations

Success signal:

- a tenant admin can manage workspace login without platform-owner intervention

## Stage 4: Become credible in production

Goal:

- make a cautious small SaaS team trust Rooiam for a real deployment

Must win:

- repeated live verification across auth flows
- safe lifecycle controls
- production install docs
- strong security model explanation
- clear audit story

Success signal:

- at least one real external deployment survives normal production use

## Stage 5: Add enterprise pull carefully

Goal:

- only after the core lane has evidence

Then consider:

- SAML
- SCIM
- custom domains
- stronger compliance packaging

Rule:

- enterprise breadth comes after market proof, not before it

## Near-term build order from this codebase

### Now

- sharpen positioning everywhere
- finish self-host documentation and deployment trust
- remove remaining product-language confusion
- stabilize the mode and deployment doctrine

### Next

- create one gold-standard integration guide and sample app path
- tighten tenant portal workflows
- tighten operator setup and production onboarding

### After that

- gather real user friction from setup and integration
- cut scope that does not help self-hosted multi-tenant SaaS adoption
- only then choose the next protocol or enterprise feature

## Decision rule for roadmap choices

For the next few releases, a feature should be prioritized only if it clearly improves one of these:

1. self-host trust
2. multi-tenant SaaS fit
3. passwordless auth quality
4. tenant/operator control
5. integration speed

If it does not clearly help one of those, it should probably wait.
