# OAuth Provider Setup

This guide shows how to configure Google and Microsoft login for Rooiam.

Use this if you are:
- setting up Rooiam for the first time
- testing OAuth locally on `localhost`
- moving from local testing to a real domain

## What You Need To Understand First

Rooiam uses **server-side OAuth callbacks**.

That means the important callback URLs are:
- Google: `http://localhost:5170/api/v1/auth/google/callback`
- Microsoft: `http://localhost:5170/api/v1/auth/microsoft/callback`

For production, the same pattern applies:
- Google: `https://auth.yourdomain.com/api/v1/auth/google/callback`
- Microsoft: `https://auth.yourdomain.com/api/v1/auth/microsoft/callback`

The callback URL must match in three places:
- your Rooiam public URL settings
- the provider console
- the actual URL the Rooiam server is serving

If these do not match exactly, OAuth will fail.

## Localhost vs Real Domain

### Local testing

Use:
- `ROOIAM_SERVER_URL=http://localhost:5170`
- `ROOIAM_APP_URL=http://localhost:5172`
- `ROOIAM_ADMIN_URL=http://localhost:5171`

Callbacks:
- `http://localhost:5170/api/v1/auth/google/callback`
- `http://localhost:5170/api/v1/auth/microsoft/callback`

Notes:
- Google allows `http://localhost` for local development.
- Microsoft Entra also allows local development redirect URIs like `http://localhost/...`.
- The callback must still be registered exactly in the provider portal.

### Real domain / production

Example:
- `ROOIAM_SERVER_URL=https://auth.rooiam.com`
- `ROOIAM_APP_URL=https://app.rooiam.com`
- `ROOIAM_ADMIN_URL=https://admin.rooiam.com`

Callbacks:
- `https://auth.rooiam.com/api/v1/auth/google/callback`
- `https://auth.rooiam.com/api/v1/auth/microsoft/callback`

Notes:
- use HTTPS for real domains
- keep development and production app registrations separate if possible

## Google Setup

### 1. Open the Google Cloud Console

Go to:
- `https://console.cloud.google.com/`

### 2. Create or select a project

If this is your first time:
- create a new project
- give it a clear name, for example `Rooiam Local` or `Rooiam Production`

### 3. Configure the OAuth consent screen

In newer Google UI this may appear under:
- `Google Auth Platform`
- or `APIs & Services`

Set:
- app name
- support email
- developer contact email

For local or internal testing, the basic test configuration is enough.

### 4. Create OAuth credentials

Go to:
- `APIs & Services`
- `Credentials`
- `Create Credentials`
- `OAuth client ID`

Choose:
- `Web application`

Google puts Rooiam's callback in:

- `Authorized redirect URIs`
- under the `Web application` client
- this is the section Google uses for requests coming from a web server

### 5. Name the client

Examples:
- `Rooiam Local Admin`
- `Rooiam Production`

### 6. Add the redirect URI

For local:
- `http://localhost:5170/api/v1/auth/google/callback`

For production:
- `https://auth.yourdomain.com/api/v1/auth/google/callback`

Important:
- this exact URL must match Rooiam
- do not guess
- do not change `/api/v1/auth/google/callback`
- enter it in `Authorized redirect URIs`
- do not put this callback into `Authorized JavaScript origins`

### 7. Save and copy the values

Google gives you:
- `Client ID`
- `Client Secret`

Put them into Rooiam:
- `Settings > OAuth`
- `Google OAuth2`

Or bootstrap with env:
- `ROOIAM_GOOGLE_CLIENT_ID=...`
- `ROOIAM_GOOGLE_CLIENT_SECRET=...`

## Microsoft Setup

### 1. Open the Microsoft Entra admin center

Go to:
- `https://entra.microsoft.com/`

### 2. Open App registrations

Go to:
- `Identity`
- `Applications`
- `App registrations`
- `New registration`

### 3. Create the app

Set:
- Name: `Rooiam Local` or `Rooiam Production`

Supported account types:
- easiest default for broad sign-in: `Accounts in any organizational directory and personal Microsoft accounts`

If you want single-tenant only later, you can change this decision and use a tenant-specific value instead of `common`.

### 4. Add the redirect URI

Platform:
- `Web`

Microsoft puts Rooiam's callback in:

- `Authentication`
- platform type: `Web`
- `Redirect URIs`

For local:
- `http://localhost:5170/api/v1/auth/microsoft/callback`

For production:
- `https://auth.yourdomain.com/api/v1/auth/microsoft/callback`

Important:
- this must match exactly
- Microsoft rejects mismatched redirect URIs
- this is the server callback URL, not the frontend URL

### 5. Create a client secret

Go to:
- `Certificates & secrets`
- `New client secret`

Create one and copy the value immediately.

Important Microsoft warning:

- use the value shown in the `Value` column
- do **not** copy the `Secret ID`
- Rooiam needs the actual client secret value, not the identifier Microsoft uses to label it

You need:
- `Application (client) ID`
- `Client secret Value`

Optional:
- `Directory (tenant) ID`

For Rooiam, you can often use:
- tenant id: `common`

If you want single-tenant only:
- use the actual tenant ID from the Overview page

### 6. Add API permission

Go to:
- `API permissions`
- `Add a permission`
- `Microsoft Graph`
- `Delegated permissions`

Add:
- `User.Read`

Rooiam uses Microsoft Graph `/me`, so this permission matters.

### 7. Save the values in Rooiam

In Rooiam `Settings > OAuth`, enter:
- `Application (Client) ID`
- `Client Secret`
- `Tenant ID`

Or bootstrap with env:
- `ROOIAM_MICROSOFT_CLIENT_ID=...`
- `ROOIAM_MICROSOFT_CLIENT_SECRET=...`
- `ROOIAM_MICROSOFT_TENANT_ID=common`

## How To Test In Rooiam

After saving provider settings:

1. Open `Settings > OAuth`
2. Click `Test Google Login` or `Test Microsoft Login`
3. Complete the provider sign-in
4. Return to the same tab

Expected result:
- Rooiam returns to the OAuth settings page
- provider shows `Verified`
- a timestamp appears

If you edit:
- client ID
- client secret
- tenant ID
- API base / issuer URL

then Rooiam will show:
- `Needs retest`

This is intentional.

## Common Mistakes

### Google or Microsoft redirects to an error page

Check:
- the callback URL in the provider console
- the callback URL shown in Rooiam `Settings > OAuth`
- the `API Base URL` in Rooiam `Settings > Public URLs`

All three must match.

Provider-console reminder:

- Google:
  - put the callback in `Authorized redirect URIs`
- Microsoft:
  - put the callback in `Authentication` -> `Web` -> `Redirect URIs`

### Localhost works for one provider but not the other

Check that both providers use:
- `http://localhost:5170/api/v1/auth/.../callback`

Do not mix:
- `/v1/oauth/.../callback`
- `/api/v1/auth/.../callback`

Rooiam now treats `/api/v1/auth/.../callback` as the canonical callback.

### Microsoft login fails even though the app registration looks correct

Double-check:

- you copied the `Application (client) ID`
- you copied the client secret from the `Value` column
- you did **not** paste the `Secret ID`
- the redirect URI is under `Authentication` -> `Web`

Using `Secret ID` instead of the real secret value is one of the most common Microsoft setup mistakes.

### Google works but Microsoft fails

Check:
- `User.Read` permission added
- client secret copied correctly
- tenant mode matches your app registration
- redirect URI matches exactly

### Provider test does not return to the settings page

Check:
- `ROOIAM_ADMIN_URL`
- `Settings > Public URLs > Admin App URL`
- admin app is actually running on the configured port

## Which Settings Come From Env vs Admin UI

For OAuth, the best mental model is:
- env = bootstrap defaults
- database settings from admin UI = actual runtime values

So:
- first boot can use env
- once you save values in `Settings > OAuth`, those DB values become the real live config

## Recommended Local Values

For the current strict local dev layout:

- API server: `http://localhost:5170`
- admin: `http://localhost:5171`
- login app: `http://localhost:5172`
- landing: `http://localhost:5173`
- docs: `http://localhost:5175`

Use these callback URLs:

- Google: `http://localhost:5170/api/v1/auth/google/callback`
- Microsoft: `http://localhost:5170/api/v1/auth/microsoft/callback`

## Recommended Production Pattern

Use one stable public API domain:
- `https://auth.yourdomain.com`

Then set:
- `API Base URL` = `https://auth.yourdomain.com`
- `Auth App URL` = your hosted sign-in app
- `Admin App URL` = your admin dashboard URL

Register provider callbacks against the API domain, not the frontend domains.
