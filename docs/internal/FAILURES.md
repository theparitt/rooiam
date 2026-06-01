# Failed IAM Products: Case Studies and Lessons

When building Rooiam, we studied why highly-funded, technically competent teams struggled or failed to build a sustainable IAM platform that outcompetes Auth0. This document collects the most vital lessons of what *not* to do.

## Case Study 1: The "Bolt-On B2B" Startup

**The Scenario:** A startup built a blazing fast Google/Email auth widget. They launched it as a developer tool specifically for B2C consumer applications.
**The Pivot:** B2C doesn't pay well, so they pivoted to B2B SaaS and attempted to implement Organizations.
**The Failure:** Their database core relied on a schema where `users` directly owned records, and permissions were tied to the user. When they added `organizations`, they realized 80% of their codebase needed massive, breaking `JOIN` refactors. By the time they finished, their B2B architecture was wildly fragile.
**Rooiam Lesson:** Org/Tenant modeling must be implemented at Day 0. In Rooiam, `organization_memberships` is the bridge, meaning a user can exist cleanly without an org, but org contexts are securely mapped immediately.

## Case Study 2: The "We Can Do Everything" Approach

**The Scenario:** An open-source IAM tool attempted to replace Keycloak but built every feature (SAML, SCIM, 24 Social Providers, 4 kinds of WebAuthN) in parallel.
**The Failure:** The product became bloated, slow, and nearly impossible for a solo-founder or new startup to self-host easily. Configuration files spanned thousands of lines. 
**Rooiam Lesson:** Don't build everything immediately. Follow a precise phased roadmap. We built Email Magic Links and Google/Microsoft OAuth as the core, ensuring they are perfectly decoupled, fast, and secure via Rust, before expanding outward.

## Case Study 3: The JWT Explosion

**The Scenario:** A prominent tool leaned entirely into stateless JWTs to make reads faster for the consuming applications.
**The Failure:** They lacked a strict session model. When requested to implement strict "force logout everywhere" or device management, stateless JWTs made it impossible without complex cache-lookups on every request, deleting the performance benefit anyway. Even worse, as permissions scaled, the JWT sizes hit HTTP header limits (14kb+ JWTs) because every Role and Permission string was stuffed inside it.
**Rooiam Lesson:** Rooiam uses **Opaque Sessions** (stored as secure HttpOnly cookies directly verifying against our fast `sessions` postgres table) with real revocation structures. We separate Authentication from Authorization—the JWT claims from Rooiam to an App only contain Identity and standard scopes. The App manages deep role permissions.

## Case Study 4: Ignoring External App Routing (The Monolith Mistake)

**The Scenario:** An internal team wrote a monolithic login system directly into their primary product. Later, they launched a second, parallel marketing tool and wanted users to have a single login experience.
**The Failure:** Because their auth logic was embedded inside App #1, App #2 had no clear way to securely "delegate" login to App #1 without resorting to horribly insecure token sharing tricks. 
**Rooiam Lesson:** We built the `oauth_clients`, `redirect_uris`, and `OIDC Provider` system. Even our own first-party apps (AraiHub, Jotjum) treat Rooiam as an external identity provider using the identical, secure OAuth flow that a 3rd party would use.
