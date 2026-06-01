# Demo Badge Rules

This page locks the visual rule for the `Demo` badge across `rooiam-admin`, `rooiam-app`, and `rooiam-demo`.

## Placement

- The badge overlays the logo or wordmark.
- It does not sit beside the logo in normal header layouts.
- Preferred anchor is bottom-right unless the asset shape needs a small adjustment.

## Visual Rule

- Label: `Demo`
- Style: compact pill
- Text: uppercase
- Include the small lock icon
- Use the same accent treatment across surfaces instead of per-page improvisation

## Usage Rule

- Show it on login surfaces in demo mode.
- Show it on dashboard or portal chrome when the current session is a demo session.
- Keep the same badge component or same visual tokens when possible.

## Code Rule

- Prefer a reusable `DemoBadge` component over hand-written badge spans.
- If a future change updates the badge look, update:
  - this document
  - the badge component in each frontend project
