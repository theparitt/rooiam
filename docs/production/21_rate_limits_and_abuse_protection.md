# Rate Limits And Abuse Protection

Rooiam does not rely on one control. Abuse protection is a stack:
- rate limits
- origin validation
- callback validation
- short-lived widget transactions
- suspicious-auth detection
- audit logs

## Current Rate-Limit Families

### Auth

Controls:
- `ROOIAM_RATE_AUTH_PER_ENDPOINT`
- `ROOIAM_RATE_AUTH_PER_IP`

Used for:
- login
- hosted widget auth-start
- verification-style auth surfaces

### Identity

Controls:
- `ROOIAM_RATE_IDENTITY_PER_ENDPOINT`
- `ROOIAM_RATE_IDENTITY_PER_IP`

Used for:
- self-service identity/account surfaces

### Workspace / Org

Controls:
- `ROOIAM_RATE_ORGS_PER_ENDPOINT`
- `ROOIAM_RATE_ORGS_PER_IP`

Used for:
- workspace-management surfaces

## Hosted Widget Abuse Protection

Rooiam protects the hosted widget by:
1. checking allowed embed origins
2. checking callback-origin match
3. minting a short-lived `widget_login_context`
4. consuming or rotating that context during auth start
5. auditing blocked origin and invalid/replayed widget events

## Common Abuse Cases

### Repeated blocked widget probes

Attacker tries:
- many disallowed origins against real app identities

Rooiam response:
- blocks widget load
- audits the attempt
- can escalate into suspicious-auth review signals

### Login flood

Attacker tries:
- many repeated login starts

Rooiam response:
- auth rate limits
- suspicious-auth visibility

### API-key misuse

Attacker or bad integration tries:
- repeated high-volume workspace API requests

Rooiam response:
- audit logging
- route visibility in audit logs
- operator review and key rotation

## Operator Guidance

If you see repeated:
- rate-limited auth attempts
- blocked embed-origin probes
- suspicious login signals

Then:
1. review the affected IPs and actors
2. confirm whether the traffic is expected
3. rotate keys or revoke sessions when necessary
4. tighten app configuration if the issue is misconfiguration, not attack

## `0.1` Rule

For `0.1`, the important operator outcome is:
- Rooiam should make abuse visible quickly
- the same auth flow should not fail silently
- operators should have a clear trail in audit logs
