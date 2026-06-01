# API Keys and OAuth Clients

Tenant admins can create both workspace API keys and downstream OAuth clients.

## 1. Workspace API Keys

Use API keys when a company/workspace needs programmable access within the tenant boundary.

Open:

- `API Keys`

You can:

- create a key
- set an optional expiry
- copy the raw key once
- revoke a key later

Important:

- API keys are workspace-scoped
- they are not platform-admin credentials
- they should be treated like secrets

Reference:

- [Tenant API Access](../tenant_api_access.md)

## 2. OAuth Clients

Use OAuth clients when a downstream app should delegate login to Rooiam.

Open:

- `Clients`

You can:

- register a client
- choose app type
- set redirect URIs
- copy the client ID
- receive a client secret for confidential clients
- revoke clients later

## 3. When To Use Which

Use **API key** when:

- you need programmatic workspace access

Use **OAuth client** when:

- you want browser or app sign-in through Rooiam
- you want a downstream app to rely on Rooiam identity

