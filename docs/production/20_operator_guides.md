# Operator Guides

This page is the human-friendly operator walkthrough set for daily use.

It is written for people who need to operate Rooiam without reading the code.

## Guide 1: Review Suspicious Auth Alerts

Where:
- `rooiam-app` workspace overview
- `rooiam-admin` platform overview

What you will see:
- `High` or `Medium` severity labels
- alert title
- actor, IP, or workspace detail
- review buttons
- links into filtered audit logs

How to review:
1. open the alert card
2. click `Review in audit logs`
3. confirm actor, IP, target, and timing
4. if expected, mark it reviewed
5. if unexpected, keep investigating and revoke sessions or rotate keys if needed

## Guide 2: Check A Workspace App Before Production

Where:
- workspace app create/edit pages in `rooiam-app`

Checklist:
1. confirm every real callback is in `Redirect URIs`
2. confirm every real site is in `Allowed Embed Origins`
3. confirm no callback origin is missing from the embed-origin list
4. confirm `https://` is used outside localhost
5. confirm the app is not unintentionally shared across many sites

## Guide 3: Investigate API-Key Activity

Where:
- workspace audit logs
- tenant-workspace audit logs

What to check:
1. API key label in `Action`
2. key owner in `Actor`
3. area and route in `Target`
4. IP and timing

If something looks wrong:
1. identify the backend integration
2. confirm whether that route was expected
3. rotate or revoke the key if necessary

## Guide 4: Investigate Widget Problems

If the hosted widget is blocked:
1. confirm the app registration
2. confirm the current site is in `Allowed Embed Origins`
3. confirm there is a matching callback origin in `Redirect URIs`
4. check audit logs for:
   - `auth.widget.embed_origin_blocked`
   - `auth.app_callback_rejected`

## Guide 5: Investigate Mail Problems

If users do not receive magic links:
1. test SMTP from platform settings
2. confirm sender domain setup
3. confirm SPF/DKIM/DMARC
4. review email provider logs
5. direct users to passkey or provider sign-in while mail is degraded

## Notes For Documentation Screenshots

This page is written so screenshots can be added later without rewriting the guidance:
- workspace overview alert panel
- platform overview alert panel
- workspace app edit form
- workspace audit log quick views

For `0.1`, the text is the source of truth even if screenshots are added later.
