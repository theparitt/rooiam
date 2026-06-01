# Rooiam Server: A Textbook on Identity and Access Management (IAM)

Welcome to the **Rooiam Server Walkthrough**.

This book acts as a textbook for computer science students who want to learn how Identity and Access Management (IAM) systems work in the real world. IAM is the system that handles user logins, security, and permissions. Every time you log into a website or app, an IAM system is working behind the scenes.

Instead of just talking about theory, we will use **Rooiam**, a real, open-source IAM server built in Rust, as our main example. By the end of this book, you will understand the deep concepts, algorithms, and actual code needed to build a secure system from scratch. We will use simple language to make these complex topics easy to grasp.

## How to Read This Book

Each chapter tackles a real-world problem you face when building an app (the "why"), explains the computer science concepts to solve it (the "how"), and then walks you through the actual Rust code and database tables used in Rooiam.

## Design & Styling
To ensure that all diagrams (database schemas, flowcharts, and sequence diagrams) remain consistent and readable, see the [Diagram Styling Standards](DIAGRAM_STANDARDS.md) guide. **All AI or human contributors MUST read and follow these standards before editing or adding diagrams.**

### Table of Contents

- [Chapter 1: The Identity Core](./chapter-01-the-identity-core.md)
  - What is a "user"? We learn why using an email address as a database primary key is a bad idea, and how unique IDs (UUIDs) create a safe, permanent foundation.
- [Chapter 2: Magic Link Authentication](./chapter-02-magic-link-authentication.md)
  - How to let users log in without a password using email links. We explore secure token hashing and how to prevent replay attacks.
- [Chapter 3: Stateful Sessions vs. JWTs](./chapter-03-stateful-sessions.md)
  - How does a website remember you are logged in? We compare storing sessions in a database versus using stateless tokens (JWTs), and explain why Rooiam uses opaque cookies.
- [Chapter 4: Social Logins & External Identities](./chapter-04-social-logins.md)
  - "Log in with Google." We look at how to securely connect third-party providers to your main database.
- [Chapter 5: Multi-Tenant Organizations](./chapter-05-multi-tenant-organizations.md)
  - How to build software for businesses (B2B). We cover how to safely group users into organizations or "workspaces".
- [Chapter 6: The OIDC Provider](./chapter-06-the-oidc-provider.md)
  - The magic of Single Sign-On. We explain Authorization Codes and how Rooiam becomes a central login provider for many apps.
- [Chapter 7: Threat Modeling](./chapter-07-threat-modeling.md)
  - How to defend against attackers. We explore session hijacking, cross-tenant IDOR, and email enumeration.
- [Chapter 8: RBAC & Permission Roles](./chapter-08-rbac-roles.md)
  - Defining who can do what. We build a flexible Role-Based Access Control system for fine-grained permissions.
- [Chapter 9: MFA & Passkeys](./chapter-09-mfa-passkeys.md)
  - Hardening security with a second factor. We implement TOTP apps and phishing-resistant WebAuthn passkeys.
- [Chapter 10: Activity & Audit Logs](./chapter-10-activity-audit-logs.md)
  - Keeping a secure paper trail. We learn how to record system events for compliance and security forensics.
- [Chapter 11: API Keys](./chapter-11-api-keys.md)
  - Machine-to-machine security. We design a system for issued secrets that allow scripts and microservices to talk to each other.
- [Chapter 12: Corporate Guardrails](./chapter-12-corporate-guardrails.md)
  - Large-scale management. We implement IP-based policies and global guardrails for enterprise environments.
- [Chapter 13: Operator Security Playbook](./chapter-13-operator-security-playbook.md)
  - The practical operator view. We explain how hosted-widget security, callback validation, suspicious-login review, and shared responsibility work in production.
