# Demo Login Hint Rules

This page locks the pattern for demo login hints across `rooiam-admin`, `rooiam-app`, and `rooiam-demo`.

## Placement Rule

- Demo login hints sit underneath the login card or embedded login frame.
- They must not look visually attached to the login card itself.
- Treat them as helper content, not part of the primary sign-in form.

## Content Rule

- Keep the title short:
  - `Try demo admin`
  - `Try demo workspace`
  - `Try the demo`
- Split each method into its own block.
- Use explicit numbered steps.
- Keep one action per line.
- Do not combine multiple actions in the same numbered line.

## Method Order

- Show `Magic Link` first.
- Show `Passkey` second.
- Add other demo methods only if they are intentionally supported.

## Step Pattern

For demo login hints, prefer this structure:

- `Magic Link`
  - `1.` Click the demo email to fill it.
  - `2.` Click `Send Magic Link`.
  - `3.` Open `MailHog`.
  - `4.` Click the login or authenticate link in the email.

- `Passkey`
  - `1.` Click the demo email to fill it.
  - `2.` Click `Passkey`.

If a flow requires MFA in demo, add that as a separate final step.

## Interaction Rule

- If the UI can fill the email field directly, the demo email should be clickable.
- Prefer click-to-fill over telling the user to type the email manually.
- If the login is embedded, the hint should still try to prefill the downstream login when feasible.

## Component Rule

- Use a `DemoLoginHint` component instead of ad hoc JSX.
- Keep the component API simple and data-driven:
  - title
  - accent color
  - demo email
  - click-to-fill callback
  - which methods are shown
  - optional extra steps such as MFA

## Code Reference Rule

When changing this pattern, update both:

- this document
- the `DemoLoginHint` component in each frontend project that renders it

The goal is consistency across surfaces, even when different coding agents touch the repo later.
