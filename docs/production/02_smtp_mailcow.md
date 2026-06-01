# 📧 SMTP & Email Delivery

Rooiam uses SMTP (Simple Mail Transfer Protocol) to deliver Magic Login Links, Organization Invites, and Security Alerts. Because Rooiam is fundamentally passwordless, reliable email delivery is **the most critical piece of your infrastructure**.

If your emails silently bounce or go to spam (or "Junk Mail"), your users literally cannot log in.

## 🛡️ The Junk Mail Risk (DKIM, SPF, DMARC)

Email providers like Gmail, Outlook, and Apple Mail aggressively filter out "spoofed" (fake) emails to protect users. If you spin up a server on your own IP address and start sending emails as `no-reply@yourcompany.com`, Gmail will instantly throw them in the **Spam folder** (or reject them entirely) unless you cryptographically prove you own the domain.

To prevent this, you **must**:

1. Configure **SPF (Sender Policy Framework)** DNS records to authorize the server's IP address.
2. Configure **DKIM (DomainKeys Identified Mail)** DNS records to cryptographically sign every email leaving your server.
3. Configure **DMARC** DNS records to instruct Gmail what to do if an email fails the SPF/DKIM checks.
4. "Warm up" your IP address so Gmail trusts that you aren't a malicious botnet.

## 💡 Choosing an Email Strategy (Pros & Cons)

Because managing IP reputation and DKIM/SPF is incredibly difficult, you have three distinct choices depending on your goals:

### Option A: External Providers (Resend, SendGrid, Amazon SES)

Using a managed third-party service that specializes in delivering transactional emails.  
**(Recommended for 99% of businesses)**

*   **Pros:** Near-perfect deliverability out of the box. They handle IP warmups, DKIM rotation, and bounce handling automatically. Extremely easy to set up.
*   **Cons:** Costs money at higher volumes. You are trusting a third party with the metadata of your user logins.
*   **How to use:** Create an account, verify your domain DNS records via their UI, get the standard SMTP credentials (Host, Port, Username, Password) from them, and paste them into Rooiam's `.env`.

### Option B: Self-Hosted (Mailcow / Postfix)

Running your own heavy, production-grade Mail server alongside Rooiam.  
**(Recommended only if you are an advanced SysAdmin who wants 100% data sovereignty)**

*   **Pros:** Absolutely free, unlimited sending volume. Complete and total control over your own data. No third-party network tracking.
*   **Cons:** Massive operational overhead. If the IP address of your DigitalOcean or AWS server was previously used by a spammer years ago, you will inherit a "banned" IP and your magic links will fail. You must manually configure DKIM/SPF/DMARC correctly or all mail permanently goes to junk.

### Option C: The Local Fake Inbox (Mailhog)

Running a local fake email-catcher on your machine.  
**(Recommended ONLY for Local Development/Testing)**

*   **Pros:** Completely prevents emails from being blasted onto the real internet. Catches every login email locally so you can click Magic Links during testing without needing a real domain or risking spam blocklists.
*   **Cons:** Absolutely useless for real users in production because it intentionally doesn't route outbound emails.
*   **How to use:** Run `docker compose up --build -d` — Mailhog starts automatically. View caught login emails at `http://localhost:8025`.

## ⚙️ What Rooiam Needs

Regardless of which choice you pick, Rooiam only needs the final standard SMTP connection details. You can configure them in `rooiam-server/.env` directly:

```env
ROOIAM_SMTP_HOST=smtp.resend.com
ROOIAM_SMTP_PORT=587
ROOIAM_SMTP_SECURITY=starttls
ROOIAM_SMTP_FROM=login@yourcompany.com
ROOIAM_SMTP_USER=resend
ROOIAM_SMTP_PASS=your-smtp-password
```

### SMTP Parameter Reference

| Variable | Description | Allowed Values |
| :--- | :--- | :--- |
| `ROOIAM_SMTP_HOST` | The address of your mail server. | IP or Domain (e.g. `smtp.gmail.com`) |
| `ROOIAM_SMTP_PORT` | The network port for mail. | `587` (Modern) or `465` (Legacy SSL) |
| `ROOIAM_SMTP_SECURITY` | The encryption handshake method. | `none`, `starttls`, or `tls` |
| `ROOIAM_SMTP_FROM` | The "Sender" address shown to users. | Must be an email on your domain. |

#### Security Modes Explained:
*   **`none`**: Data is sent in plain text. **Never use this in production.**
*   **`starttls`**: Starts plain, then upgrades to encrypted. Use with Port `587`.
*   **`tls`**: Encrypted from the very first second. Use with Port `465`.

---

Rooiam will automatically inject tenant branding into the magic-link emails based on the context of the login request:

*   Workspace display name (e.g. "RooChoco via Rooiam")
*   Workspace logo
*   Brand colors

**Important Platform Trust Boundary:**

While emails are injected with Tenant logos and names, the actual SMTP server mapping and the *sender address* (e.g. `login@yourcompany.com`) always remains controlled by the **Platform Admin**. Tenants cannot input their own raw SMTP credentials to send magic links blindly from their own private domains. This deliberately prevents malicious Tenant Admins from using the Rooiam platform as a giant spam/phishing relay network.

---

## 5. Customizing Email Templates (Backend vs Frontend Limitations)

A common point of confusion is how to change the look and feel of the emails sent by Rooiam.

### What Generates Where

Emails are **100% generated on the Rust backend**. The React frontend apps (admin/app) never touch the email content directly; they only tell the backend *who* to email.

### Where to Change

* **HTML Design**: To redesign the visual layout of the Magic Link email, you must edit the [Askama](https://github.com/djc/askama) template file at `rooiam-server/templates/magic_link.html`.
* **Subject Lines & Text**: To change the subject line or the plain-text fallback (for users who disable HTML email), you must edit the logic inside `rooiam-server/src/infra/email.rs`.
* **Note**: You must recompile the Rust server after making these changes.

### What Cannot Change (Platform Safety)

In the Rooiam multi-tenant model, **Tenants cannot upload their own raw HTML blocks**.

We allow Tenants to upload their logo and choose a brand color which we safely inject into the template. We do NOT allow arbitrary HTML input from Tenants because:

1. It would turn your Rooiam instance into a massive phishing/spam relay if a malicious tenant signed up.
2. It protects your SMTP reputation from being blacklisted by Gmail/Outlook.

If you want a completely different email design, you must commit it as a platform-wide change in the server source code.
