# Current Status — 2026-03-21

This document supersedes [27_current_status_2026-03-20.md](./27_current_status_2026-03-20.md) as the latest practical status note.

It records the current state of the project following a comprehensive documentation overhaul, deployment infrastructure upgrades to include MinIO, and key protocol routing fixes.

---

## Product Direction

- Documentation has been reorganized to clearly delineate user-facing tutorials from internal engineering docs.
- `rooiam-book` is now formally positioned as a textbook-style resource focusing on IAM concepts and architecture.
- Self-hosted deployment is more robust with the inclusion of S3-compatible object storage (MinIO) as a default part of the stack.
- Documentation presentation is now aligned with the premium aesthetic of the admin and portal apps.

---

## What Changed Today

### Infrastructure & Deployment

- **MinIO Integration**: Both `docker-compose.demo.yml` and `docker-compose.prod.yml` stacks have been updated to provision MinIO.
- Rooiam now utilizes MinIO for object storage and media/file persistence in the Docker stack.
- Production and Developer setup documentation were updated to cover the new storage configuration.

### Documentation Polish & Restructure

- **Clean Structure**: The `rooiam-docs` hierarchy was cleaned up to separate public-facing materials from deep technical logs.
- **UI Enhancements**: 
  - Adjusted the color palette to modern pastel colors, aligning with the actual applications.
  - Implemented the "Outfit" font across the documentation site for a cohesive, premium feel.
  - Introduced robust code highlighting using `react-syntax-highlighter` to make code blocks highly readable.
- **Mermaid Diagram Fixes**: Restored and corrected broken Mermaid diagrams in the `rooiam-book`, ensuring core architectural concepts render correctly.
- **Textbook Format**: Refined `rooiam-book` language to target undergraduate students, simplifying complex IAM concepts.

### OIDC & Protocol Fixes

- **Redirect Logic Corrected**: Fixed an OIDC logic bug where the `return_to` parameter incorrectly pointed the user to the frontend. It now accurately loops back to the issuer API server.
- **Root Routing**: Frontend login paths post-auth were adjusted to safely redirect users to the root path (`/`) instead of bouncing them to `/login`.

---

## Current Strengths

### Documentation & Developer Experience

- The documentation is beautiful, readable, and logically broken down.
- Reading through the `rooiam-book` provides an educational on-ramp before diving into the API.
- MinIO simplifies local environment setup for developers needing file storage access without external cloud dependencies.

### Deployment Readiness

- The Docker flow is more comprehensive and closer to what an enterprise self-hosted topology actually looks like.
- Protocol redirect fixes mean the login flow is much more stable and reliable over the network boundary.

---

## Still Incomplete or Weak

### Large Frontend Files Still Exist

As noted in the previous status update, the most important structural files needing to be split for maintainability are still:
- `rooiam-admin/src/pages/PlatformSettings.tsx`
- `rooiam-app/src/pages/PortalHome.tsx`
- `rooiam-demo/src/App.tsx`

---

## Recommended Next Order

1. **Split the three large frontend files** to manage tech debt and improve long-term maintainability.
2. Monitor MinIO performance and ensure volume mapping works cleanly across both Windows/WSL and native Linux environments.
3. Validate all the rewritten `rooiam-book` chapters against the actual implemented system to ensure textbook theory matches the practical reality.
4. Continue extracting custom hooks for access policy, branding, and workspace management to simplify frontend complexities.
