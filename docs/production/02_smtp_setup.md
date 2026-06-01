# 📧 SMTP Setup Guide

Rooiam uses SMTP to deliver Magic Login Links, Organization Invites, and Security Alerts. Because Rooiam is fundamentally **passwordless**, reliable email delivery is the most critical piece of your infrastructure.

If emails silently bounce or go to spam, your users cannot log in.

---

## Choosing Your SMTP Strategy

| Option | Best For | Effort |
|--------|----------|--------|
| [Resend](#option-a-resend) | Most deployments, easiest setup | Low |
| [Gmail SMTP Relay](#option-b-gmail-smtp-relay) | Small installs, G Suite users | Low |
| [Mailcow (self-hosted)](#option-c-mailcow-self-hosted) | Data sovereignty, own mail server | High |
| [Amazon SES](#option-d-amazon-ses) | High volume, AWS environments | Medium |

---

## Where to Enter Credentials

You have two valid paths — either works:

**Path 1 — Setup Wizard (recommended for first run)**

Go to `https://admin.example.com` → Setup Wizard → SMTP step. Fill in the fields and click **Send Test Email** before saving.

**Path 2 — Environment file**

Add values to `rooiam-server/.env` before starting the server. The server uses them immediately at runtime even if the wizard fields appear empty.

```env
ROOIAM_SMTP_HOST=smtp.example.com
ROOIAM_SMTP_PORT=587
ROOIAM_SMTP_SECURITY=starttls
ROOIAM_SMTP_FROM=login@yourcompany.com
ROOIAM_SMTP_USER=your-smtp-username
ROOIAM_SMTP_PASS=your-smtp-password
```

> **Note:** Values set in `.env` do NOT automatically appear in the wizard form fields — they work silently as a runtime fallback. If you want the values to prefill in the UI later, save them once through the wizard or admin settings.

### SMTP Parameter Reference

| Variable | Description | Values |
|----------|-------------|--------|
| `ROOIAM_SMTP_HOST` | Mail server hostname | e.g. `smtp.resend.com` |
| `ROOIAM_SMTP_PORT` | Network port | `587` (STARTTLS) or `465` (TLS) |
| `ROOIAM_SMTP_SECURITY` | Encryption mode | `none`, `starttls`, or `tls` |
| `ROOIAM_SMTP_FROM` | Sender address shown to users | Must be a domain you own |
| `ROOIAM_SMTP_USER` | SMTP username / API key | Provider-specific |
| `ROOIAM_SMTP_PASS` | SMTP password / secret | Provider-specific |

**Security modes:**
- `none` — plain text. Never use in production.
- `starttls` — starts plain, upgrades to TLS. Use with port `587`.
- `tls` — encrypted from first byte. Use with port `465`.

---

## Option A: Resend

[Resend](https://resend.com) is the easiest and most reliable choice. Free tier allows 3,000 emails/month.

### 1. Create account and verify domain

1. Sign up at resend.com
2. Go to **Domains** → **Add Domain**
3. Enter your domain (e.g. `yourcompany.com`)
4. Add the DNS records they show you — they require **SPF**, **DKIM**, and optionally **DMARC**
5. Wait for the domain status to show **Verified** (usually 5–15 minutes)

### 2. Get SMTP credentials

1. Go to **API Keys** → **Create API Key**
2. Give it a name like `rooiam-production`
3. Set permission to **Sending access**
4. Copy the key — it starts with `re_`

### 3. Configure Rooiam

```env
ROOIAM_SMTP_HOST=smtp.resend.com
ROOIAM_SMTP_PORT=587
ROOIAM_SMTP_SECURITY=starttls
ROOIAM_SMTP_FROM=login@yourcompany.com
ROOIAM_SMTP_USER=resend
ROOIAM_SMTP_PASS=re_xxxxxxxxxxxxxxxxxxxxxx
```

> The SMTP username is always the literal string `resend` — not your email address.

### 4. Test it

In the setup wizard, click **Send Test Email** and enter your own address. The email should arrive within 30 seconds. Check the Resend dashboard → **Emails** to see delivery status and any errors.

---

## Option B: Gmail SMTP Relay

Works for small deployments or if you already have Google Workspace. Free but limited — Google caps at 2,000 messages/day per user for workspace accounts, 500/day for personal Gmail.

> **Do not use your personal Gmail password here.** Google requires an App Password when 2FA is enabled (which it should be).

### 1. Enable 2-Step Verification on the sending account

Go to your Google Account → Security → 2-Step Verification and confirm it is on. Gmail SMTP relay does not allow App Passwords unless 2FA is active.

### 2. Create an App Password

1. Go to your Google Account → Security → **App Passwords**
   (Direct URL: `myaccount.google.com/apppasswords`)
2. Select app: **Mail**
3. Select device: **Other (Custom name)** → type `rooiam`
4. Click **Generate**
5. Copy the 16-character password shown (it looks like `abcd efgh ijkl mnop` — remove the spaces)

### 3. Configure Rooiam

```env
ROOIAM_SMTP_HOST=smtp.gmail.com
ROOIAM_SMTP_PORT=587
ROOIAM_SMTP_SECURITY=starttls
ROOIAM_SMTP_FROM=login@yourcompany.com
ROOIAM_SMTP_USER=you@yourcompany.com
ROOIAM_SMTP_PASS=abcdefghijklmnop
```

> `ROOIAM_SMTP_FROM` should match the Gmail address you are authenticating as, otherwise Gmail will rewrite the sender.

### 4. Google Workspace vs personal Gmail

| | Google Workspace | Personal Gmail |
|-|-----------------|----------------|
| Daily send limit | 2,000/day | 500/day |
| Custom from address | Yes (if domain matches) | No |
| Recommended for production | Yes | No — dev/test only |

### 5. Known Gmail limitation

Gmail may automatically replace the `From:` header with the authenticated account address if it does not match. For consistent sender branding, use Resend or SES instead.

---

## Option C: Mailcow (Self-Hosted)

Mailcow is a Docker-based mail server stack that gives you full control. Use this if you need data sovereignty and are comfortable operating a mail server long-term.

> **Warning:** Self-hosted mail has significant operational overhead. Your server IP must have a clean reputation. If your server IP was previously used by a spammer, emails will go to spam or be rejected even with perfect DNS records. Use a fresh dedicated IP.

### Prerequisites

- A dedicated server or VM (separate from your Rooiam server is recommended)
- A public IPv4 address with no spam history
- A domain or subdomain you control (e.g. `mail.yourcompany.com`)
- Ports 25, 80, 443, 465, 587, 993, 995 open in your firewall

### 1. Install Mailcow

```bash
# Clone Mailcow
cd /opt
git clone https://github.com/mailcow/mailcow-dockerized
cd mailcow-dockerized

# Run the setup script
./generate_config.sh
# Enter your mail hostname when prompted: mail.yourcompany.com

# Start Mailcow
docker compose pull
docker compose up -d
```

The Mailcow admin panel is available at `https://mail.yourcompany.com` after startup.

Default credentials (change immediately):
- Username: `admin`
- Password: `moohoo`

### 2. Configure DNS records

In your DNS provider, add these records for `yourcompany.com`:

| Type | Name | Value | Notes |
|------|------|-------|-------|
| MX | `yourcompany.com` | `mail.yourcompany.com` | Priority 10 |
| A | `mail` | `<your-server-ip>` | |
| TXT | `yourcompany.com` | `v=spf1 mx ~all` | SPF record |
| TXT | `_dmarc.yourcompany.com` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@yourcompany.com` | DMARC |

For DKIM, Mailcow generates the key automatically:

1. Log into Mailcow admin → **Configuration** → **ARC/DKIM keys**
2. Copy the public key shown for your domain
3. Add it as a TXT record: `_domainkey.yourcompany.com` → paste the value

### 3. Create a mailbox for Rooiam

In Mailcow admin:

1. **E-Mail** → **Mailboxes** → **Add mailbox**
2. Username: `login`
3. Domain: `yourcompany.com`
4. Set a strong password
5. Save

This creates `login@yourcompany.com` as the sender mailbox.

### 4. Configure Rooiam

```env
ROOIAM_SMTP_HOST=mail.yourcompany.com
ROOIAM_SMTP_PORT=587
ROOIAM_SMTP_SECURITY=starttls
ROOIAM_SMTP_FROM=login@yourcompany.com
ROOIAM_SMTP_USER=login@yourcompany.com
ROOIAM_SMTP_PASS=your-mailbox-password
```

> For Mailcow, the SMTP username is always the **full email address**, not just the local part.

### 5. Verify deliverability

After setup, test your configuration at:
- [mail-tester.com](https://www.mail-tester.com) — send a test email and get a spam score
- [mxtoolbox.com/SuperTool](https://mxtoolbox.com/SuperTool.aspx) — check DNS records and blacklists
- Check that your IP is not on any blocklist: `mxtoolbox.com/blacklists.aspx`

A score of 9/10 or higher at mail-tester.com means your setup is correct.

---

## Option D: Amazon SES

Good choice if you already run infrastructure on AWS and need high volume.

### 1. Verify your domain in SES

1. Go to AWS Console → **Amazon SES** → **Verified identities**
2. Click **Create identity** → **Domain** → enter `yourcompany.com`
3. Add the CNAME records shown for DKIM verification to your DNS
4. Wait for status to become **Verified**

### 2. Get SMTP credentials

1. Go to **SES** → **SMTP Settings** → **Create SMTP credentials**
2. IAM creates a new user — download the CSV with the SMTP username and password
3. Note: these are NOT your AWS access key/secret — they are SES-specific SMTP credentials

### 3. Check sending limits

New SES accounts start in **sandbox mode** — you can only send to verified email addresses. To send to real users:

1. Go to **SES** → **Account dashboard** → **Request production access**
2. Fill in the form explaining your use case (transactional auth emails)
3. AWS approves within 24–48 hours

### 4. Configure Rooiam

The SES SMTP endpoint depends on your AWS region:

| Region | SMTP Host |
|--------|-----------|
| us-east-1 | `email-smtp.us-east-1.amazonaws.com` |
| eu-west-1 | `email-smtp.eu-west-1.amazonaws.com` |
| ap-southeast-1 | `email-smtp.ap-southeast-1.amazonaws.com` |

```env
ROOIAM_SMTP_HOST=email-smtp.us-east-1.amazonaws.com
ROOIAM_SMTP_PORT=587
ROOIAM_SMTP_SECURITY=starttls
ROOIAM_SMTP_FROM=login@yourcompany.com
ROOIAM_SMTP_USER=AKIAIOSFODNN7EXAMPLE
ROOIAM_SMTP_PASS=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

---

## Email Deliverability Checklist

Before going live, verify:

- [ ] SPF record exists for your sending domain
- [ ] DKIM is configured and the public key is in DNS
- [ ] DMARC record exists (start with `p=none` to monitor, then move to `p=quarantine`)
- [ ] `ROOIAM_SMTP_FROM` domain matches the DNS records above
- [ ] Test email received in inbox (not spam) at Gmail, Outlook, and Apple Mail
- [ ] Mailhog is NOT in your production Docker Compose

---

## Rooiam Platform Email Trust Boundary

While Rooiam injects tenant branding (workspace display name, logo, brand colors) into magic-link emails, the **SMTP server and sender address are always controlled by the Platform Admin**.

Workspace owners and workspace admins cannot input their own SMTP credentials. This prevents a malicious tenant from using your Rooiam instance as a spam or phishing relay.

If email branding templates per-tenant are needed, that is scoped for v1.5+.

---

## Customizing Email Templates

All emails are generated on the Rust backend. The React frontends never touch email content.

| What to change | Where |
|----------------|-------|
| HTML layout and design | `rooiam-server/templates/magic_link.html` (Askama template) |
| Subject lines and plain-text fallback | `rooiam-server/src/infra/email.rs` |

After editing either file, recompile the server (`SQLX_OFFLINE=true cargo run`).

Tenants cannot upload raw HTML. Rooiam only accepts a logo image and a brand color from tenants and safely injects them into the platform template. This protects your SMTP reputation from being blacklisted.
