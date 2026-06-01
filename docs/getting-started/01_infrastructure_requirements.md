# System Infrastructure & Dependencies

Rooiam uses several external tools (PostgreSQL, Redis, MinIO, and Mailcow/Mailhog). If you are new to the ecosystem, you might be wondering why we use these specific tools, what they actually do, and whether you can replace them.

This guide explains each dependency one by one, why it was chosen, and its hard limitations so you don't waste time on trial and error.

---

## 1. PostgreSQL (The Source of Truth)

**What is it?** A powerful, open-source relational database.  
**What Rooiam uses it for:** Storing users, organizations, sessions, OAuth clients, audit logs, and all access policies.  

**Can you replace it?** **NO.**  

**Why this tool & Limitations:**  
Rooiam is built with the Rust library `sqlx`, which strictly checks SQL queries against a live database during compilation for maximum safety. We heavily utilize advanced Postgres-specific features (like `JSONB`, `UUID` native types, arrays, and `RETURNING` statements) to achieve massive performance gains.  

**Why not SQLite/MySQL/MongoDB?**  

- **SQLite** cannot handle the high-concurrency writes required for large-scale SaaS authentication.  
- **MySQL / NoSQL** lack some of the strict relational constraints and advanced JSON capabilities that our data model inherently relies on.  

You CANNOT swap this for another database without rewriting the entire Rooiam server data layer.

---

## 2. Redis (The Fast State)

**What is it?** An in-memory, blazing-fast data store.  
**What Rooiam uses it for:** Caching short-lived OAuth authorization codes, temporary magic-link login states, CSRF tokens, rate limiting, and session verification caching.  

**Can you replace it?** **Partially** (You can use any drop-in that supports the Redis API).  

**Why this tool & Limitations:**  
We need a memory store that guarantees strict TTL (Time To Live) expiration so that single-use login codes automatically destroy themselves reliably.  

**Why not Memcached?**  
Memcached lacks advanced data structures and Pub/Sub capabilities that Rooiam relies on for background tasks and data synchronization. You can replace local Redis with **AWS ElastiCache, KeyDB, or Upstash**, but it *must* speak the Redis protocol.

---

## 3. MinIO (S3-Compatible Object Storage)

**What is it?** A self-hosted object storage server that mimics AWS S3.  
**What Rooiam uses it for:** Storing tenant branding assets (e.g., custom company logos that tenant admins upload, user avatars, etc).  

**Can you replace it?** **YES, absolutely.**  

**Why this tool & Limitations:**  
In our Docker Demos, we include MinIO so that Rooiam is entirely self-sufficient and works **offline** on your local machine. It allows you to simulate high-availability storage without literally paying for AWS S3 while developing.  

**Replacement Options:**  
Because Rooiam natively speaks the industry-standard S3 protocol, when you move to production, you can instantly replace MinIO with **AWS S3, Cloudflare R2, Google Cloud Storage, or DigitalOcean Spaces**. Just change the `S3_ENDPOINT`, `S3_ACCESS_KEY`, and `S3_BUCKET` environment variables.  
*(Do NOT try to use local disk storage in production, as SaaS authentication servers must be infinitely scalable and heavily replicated across multiple VMs).*

---

## 4. Mailcow / Mailhog (SMTP Email Delivery)

**What is it?** Mailhog is a local fake-email "catcher" UI. Mailcow is a heavy, production-grade mail server.  
**What Rooiam uses it for:** Delivering "Magic Link" login codes, organization member invites, and critical security alerts.  

**Can you replace it?** **YES, absolutely.**  

**Why this tool & Limitations:**  
Rooiam is fundamentally passwordless, which means it inherently requires a reliable SMTP connection to send out secure login emails.
- **In local development/demos**, we ship **Mailhog** so you can securely catch all login emails through a local `localhost:8025` inbox without configuring real domains or hitting spam filters.
- **In production**, some hardcore setups recommend **Mailcow** if you aggressively want to be 100% self-hosted and completely independent of third parties.

**Replacement Options:**  
Because it uses standard SMTP, you absolutely can (and usually should) replace it with a dedicated transactional email service like **Resend, SendGrid, Postmark, AWS SES, or Mailgun**. Just update the `ROOIAM_SMTP_*` environment variables with your chosen provider's credentials.  
*(⚠️ Do NOT try to run your own raw Postfix server locally without deep DKIM/SPF/DMARC knowledge, or your magic login links will permanently go directly into your users' spam folders).*
