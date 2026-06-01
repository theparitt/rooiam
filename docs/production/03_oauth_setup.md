# Google and Microsoft OAuth

Rooiam supports Google and Microsoft as social login providers.

Use this chapter after SMTP is ready.

## 1. Decide the Public Callback Base

Your callback base is the public `rooiam-server` URL:

- `https://auth.example.com`

Callback URLs:

- Google: `https://auth.example.com/api/v1/auth/google/callback`
- Microsoft: `https://auth.example.com/api/v1/auth/microsoft/callback`

These must match:

- Rooiam config
- provider console registration
- actual public server URL

## 2. Configure Google

High-level steps:

1. open Google Cloud Console
2. create/select a project
3. configure OAuth consent screen
4. create an OAuth client of type `Web application`
5. add redirect URI:
   - `https://auth.example.com/api/v1/auth/google/callback`
   - put this under `Authorized redirect URIs`
   - do not put it under `Authorized JavaScript origins`
6. copy:
   - client ID
   - client secret

Save them into Rooiam:

```env
ROOIAM_GOOGLE_CLIENT_ID=...
ROOIAM_GOOGLE_CLIENT_SECRET=...
```

Or enter them in `rooiam-admin` settings.

## 3. Configure Microsoft

High-level steps:

1. open Microsoft Entra admin center
2. create an app registration
3. choose supported account type
4. add web redirect URI:
   - `https://auth.example.com/api/v1/auth/microsoft/callback`
   - put this in `Authentication` -> `Web` -> `Redirect URIs`
5. create a client secret
6. grant delegated permission:
   - `User.Read`
7. copy:
   - application/client ID
   - client secret `Value`
   - tenant ID or use `common`

Important:

- Microsoft shows both `Value` and `Secret ID`
- Rooiam needs the secret from the `Value` column
- do not paste `Secret ID`

Save them into Rooiam:

```env
ROOIAM_MICROSOFT_CLIENT_ID=...
ROOIAM_MICROSOFT_CLIENT_SECRET=...
ROOIAM_MICROSOFT_TENANT_ID=common
```

## 4. Verify in `rooiam-admin`

After saving provider settings:

1. open `rooiam-admin`
2. go to settings/OAuth
3. save credentials
4. test provider login
5. enable admin/provider usage only after verification succeeds

## 5. Production Advice

- keep dev and production provider apps separate
- do not reuse localhost credentials in production
- use HTTPS for all production callback URLs
- document who owns provider secrets inside your team

Detailed provider walkthrough:

- [🔑 OAuth Provider Setup](../oauth_provider_setup.md)
