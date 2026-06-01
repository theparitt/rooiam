# Identity Data Boundary

This page defines what Rooiam should store as IAM data and what should stay in downstream apps.

## Short Version

Rooiam should store:

- identity data
- authentication data
- session data
- organization membership data
- security and audit data

Rooiam should not become the default storage layer for every customer-profile field in your product ecosystem.

## What Belongs In Rooiam

Store data in Rooiam when it is needed to answer:

- who is this user?
- how did they authenticate?
- is this identity verified?
- what organizations do they belong to?
- what security controls are enabled?
- what sessions and devices are active?

Examples:

- internal user ID
- primary email
- email verification state
- display name
- avatar URL
- linked Google/Microsoft identities
- passkeys
- TOTP MFA state
- recovery-code state
- session records
- organization memberships
- role assignments
- audit events

## What May Belong In Rooiam Later

These can be reasonable additions if multiple apps in the ecosystem need them consistently:

- first name
- last name
- phone number
- phone verification state
- locale
- timezone
- account status
- profile-complete flag

Add these only when they are truly cross-app identity fields, not just convenience fields for one app.

## What Should Usually Stay Outside Rooiam

These are usually app/business-domain records, not IAM-core records:

- postal address
- billing address
- shipping address
- company-specific customer profile data
- CRM lifecycle fields
- app-specific settings
- product preferences
- compliance workflows that belong to one product only

## Why This Boundary Matters

If IAM stores too much product/business data:

- schema changes become expensive
- every product becomes tightly coupled to IAM
- IAM turns into a general-purpose customer database
- downstream apps become harder to evolve independently

If IAM stores only identity/security data:

- boundaries stay cleaner
- downstream apps keep domain ownership
- auth and session logic remain easier to reason about

## Practical Rule

Before adding a field to Rooiam, ask:

1. Is this field needed by multiple apps?
2. Is it identity/security related?
3. Would login, verification, membership, or audit logic depend on it?

If the answer is mostly **no**, the field probably belongs in the downstream app instead.

## Recommended Current Rooiam Boundary

For the current Rooiam product stage:

- keep IAM focused on identity/auth/session/org/security
- avoid adding address and large customer profile models yet
- add universal identity fields only when there is a strong cross-app need

