# 🎨 Tenant Branding & Login

This chapter covers how a tenant admin customizes the login experience in `rooiam-app`.

## 1. Open Branding

In the tenant portal:

1. sign in to `rooiam-app`
2. select the target workspace
3. open `Branding`

## 2. Workspace Icon vs Login Widget Logo

- `Workspace Icon`
  - workspace avatar
  - default image for tenant login pages if no separate login logo is uploaded
- `Login Widget Logo`
  - the dedicated image shown in the hosted login widget

Typical setup:

1. upload workspace icon
2. optionally upload a separate login widget logo
3. choose icon/logo shape
4. choose logo size

## 3. Branding Fields

Tenant admins can configure:

- display name
- login title
- login subtitle
- workspace icon
- login widget logo
- brand color
- widget style
- card border/background/corner style
- whether title/subtitle/logo/powered-by are shown

## 4. Hosted Login URL

Workspace login uses query-string workspace context:

```text
https://login.example.com/?org=acme
```

Hosted-widget embeds use the registered workspace app instead of a browser-supplied callback URL.

Typical runtime embed parameters:

- `workspace_id`
- `client_id`
- `app`

Example:

```text
https://login.example.com/login-widget?workspace_id=<workspace-id>&client_id=<client-id>
```

Reference:

- [Hosted Login URLs](../hosted_login_urls.md)
- [Embedded Login](./08_embedded_login.md)

## 5. Preview Before Publishing

Use the `Preview` section in the tenant portal to:

- see the widget live
- reorder sign-in methods
- adjust card/logo/title visibility
- copy embed snippets

## 6. Branding in Magic-Link Email

Tenant branding now extends to tenant-facing magic-link email too.

What Rooiam can show in the email:

- workspace display name
- workspace logo when it is served from a first-party Rooiam asset URL
- workspace brand color

What Rooiam does not allow in `v1`:

- tenant-controlled sender domains
- arbitrary remote image URLs inside auth email

That restriction is deliberate. It reduces spoofing risk and prevents a tenant logo field from becoming an email-tracking surface.

## 7. User Trust Signals

To help users recognize real sign-in email, keep these details consistent:

- the same workspace name in the email and hosted login page
- the same logo and brand color in the email and hosted login page
- the same trusted hosted login domain in the email and browser

If a tenant changes branding, re-test one magic-link flow so the email and login page still match.
