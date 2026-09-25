# Rooiam Agent Rules

Before making product, API, UI, roadmap, or architecture changes, use the public
[roadmap](./docs/roadmap.md) and the rules below. Maintainers may also have
private planning notes outside this public repository; read them when available.

## Required Rule

When making decisions, prefer changes that improve:

- identity security
- tenant control
- developer integration quality
- self-host trust
- product clarity

Avoid changes that add:

- feature sprawl
- confusing terminology
- unnecessary customization
- weak tenant boundaries
- protocol drift

## Implementation Rule

When a user explicitly decides to change product direction, follow that decision.

For downstream web-app login or BFF changes, read
[the BFF user-token integration guide](./docs/reference/20_bff_user_token_integration.md)
and compare the actual exchange/session/proxy boundary in `candycloud-server/src/routes/auth.js`,
`candycloud-server/src/routes/proxy.js`, and
`rooiam-examples/example-4-reference-app/app.mjs`. An app session cookie is not
Rooiam's `rooiam_sid`; a BFF uses its server-held OIDC access token on the
explicit `/v1/identity/token/*` Bearer routes. Do not substitute an ID token,
workspace API key, browser cookie route, or a browser-visible token for that flow.

When changing public testing results in `rooiam-landing/src/pages/testingResults.ts`,
record the actual test completion time in `lastTestedAt` as ISO 8601 with a UTC
offset and update `lastTestedOn` to the evidence date. The Testing page shows
precise times in each viewer's time zone. Never use a commit, page edit, build,
or deploy timestamp as a substitute for a test run; leave historical date-only
results explicitly marked as having no recorded time.
