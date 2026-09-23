# Rooiam Marketing & Scale Direction

This is an internal overview of the competitive strategy and product pipeline.

## Current public-copy rule

The landing page serves developers evaluating Rooiam for their users. Lead with the user outcome, explain how it fits their app/workspace and offer a relevant next step. Use a brief preview or planned label when needed. Keep hardware names, alpha-build history, test counts, release-gate lists, protocol implementation reports and internal task IDs out of landing copy. Link to docs for detail instead of reproducing a progress report.

Public roadmap copy should state the next product benefit in one or two lines. The [release roadmap](./release_roadmap.md) and milestone documents are the source for engineering scope and evidence. Earlier strategy phases below are historical, not a release schedule.

### Target Audience

Developers, indie-hackers, and mid-sized startups struggling to integrate basic multi-tenant login setups without getting squeezed by enterprise providers. The primary geographic launch focus should consider the high-growth Asian developer market.

### Phase Breakdown

#### Phase 1: Establish Pure Capability
* **Goal:** A simple CLI and self-hosting `docker run` path that provides Magic Links and Google Login out of the box. 
* **Traction:** Developer word of mouth for ease of integration into their custom React or Swift applications using pure HTTP calls.

#### Phase 2: Open Sourcing the Client Network
* **Goal:** Expand from B2C features to robust B2B SaaS building blocks. Rooiam implements a strict `OAuth Clients` system running via internal UUIDs/ULIDs. Downstream integrations can instantly register their applications inside the Admin dash and hook them into Rooiam's routing. 
* **Milestone:** The user is seamlessly integrated with multi-app ecosystem architectures.

#### Phase 3: Brand Distribution and Hosted Plans
* **Goal:** Make self-hosting wildly easy, but offer a highly available managed SaaS version that skips operational setup (Docker / SMTP setup). 
* **Why it works:** Because login is a commodity, developers want it cheap or free. Setting up multi-tenant DB structure is NOT a commodity. Our moat will be giving people one unified identity interface capable of managing team scopes cleanly across a developer's entire portfolio of projects.

### Feature Non-Goals (What We Skip intentionally)
Do NOT chase SAML or huge SCIM enterprise provisioning instantly. Trying to court enormous Fortune 500s early is a trap. Build for speed, transparency, and B2B SaaS workflows (inviting members, editing roles, transparent sessions) heavily in Phase 1 & 2.

We are establishing **Rooiam** not merely as a tool to log in, but as **Identity Infrastructure.**
