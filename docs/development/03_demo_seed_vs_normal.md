# Demo Seed vs Normal Mode

Rooiam supports two main local operating modes.

## Demo Mode

```env
ROOIAM_MODE=demo
ROOIAM_DEPLOY_TARGET=local
```

Behavior:

- seeds demo accounts and demo orgs
- uses demo SMTP values or Mailhog defaults
- enables demo walkthrough flows

## Normal Mode

```env
ROOIAM_MODE=production
ROOIAM_DEPLOY_TARGET=local
```

Behavior:

- no demo seed data
- uses normal SMTP settings
- better fit for production-like local testing

## SMTP Rule

When demo mode is enabled (`ROOIAM_MODE=demo`):

- `ROOIAM_DEMO_SMTP_*` is used

When demo mode is disabled (`ROOIAM_MODE=production`):

- `ROOIAM_SMTP_*` is used

