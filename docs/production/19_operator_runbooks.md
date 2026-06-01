# Operator Runbooks

This page is the short response guide for the most common auth and integration incidents.

## Suspicious Login Spike

Symptoms:
- many `auth.login.suspicious`
- many failed logins
- repeated new-IP signals

What to do:
1. open suspicious audit logs
2. filter by affected user or IP
3. check whether one source hit multiple accounts
4. revoke suspicious sessions if needed
5. notify the tenant owner/admin if end users are affected

## Blocked Hosted Widget Origin

Symptoms:
- `auth.widget.embed_origin_blocked`

What to do:
1. confirm which app was targeted
2. check whether the site should really be allowed
3. if valid, add the exact origin to `Allowed Embed Origins`
4. if invalid, leave it blocked and watch for repeated probing

## App Callback Rejected

Symptoms:
- `auth.app_callback_rejected`

What to do:
1. check the app's `Redirect URIs`
2. check the allowed embed origins
3. make sure each site has a callback with the same origin
4. if this is a multi-origin app, confirm it is intentional

## OAuth Provider Misconfiguration

Symptoms:
- Google/Microsoft start works poorly
- provider callback errors

What to do:
1. confirm provider client ID and secret
2. confirm provider callback URL points back to Rooiam
3. confirm Rooiam public URLs are correct
4. test a full login again

## Mail Delivery Failure

Symptoms:
- users do not receive magic links
- SMTP test fails

What to do:
1. test SMTP from platform settings
2. confirm sender address and domain
3. confirm SPF/DKIM/DMARC
4. check provider logs
5. fall back to passkey or provider sign-in if needed

## Unexpected API-Key Calls

Symptoms:
- `api_key.used` from unexpected IPs
- unusual routes called by a key

What to do:
1. identify the key label and owner
2. confirm whether that backend integration is expected
3. rotate or revoke the key if needed
4. review recent activity for the same key
