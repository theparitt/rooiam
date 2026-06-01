# Mission 7: Production Setup 🏰

**Mission Goal**: Prepare your machine for the real world with SMTP, SSL, and OAuth.

---

## 🛠️ Mission Tools (The Fortress)

A "Production" setup is for when you want to put Rooiam on a real server (like AWS, DigitalOcean, or Azure) so users can log in from anywhere in the world.

### 💡 What is Production?

It means your app is hardened, secure, and uses real email servers instead of "Mailhog."

---

## 🏃 Step 1: Secure Your Machine

To go live, you need to change these settings in your `.env`:

1. **POSTGRES_PASSWORD**: Use a long, random string!
2. **SERVER_PUBLIC_URL**: Use your real domain name (like `https://api.myapp.com`).
3. **ROOIAM_ALLOWED_ORIGINS**: List all your public website URLs.

### 📧 Step 2: Set Up Real Email (SMTP)

Open your Admin Dashboard (`http://localhost:5171`) and go to **Settings > SMTP**.

- **Server Host**: (e.g., `smtp.gmail.com` or `mailcow.mycompany.com`)
- **Server Port**: (`587` or `465`)
- **Security**: (`STARTTLS` or `None`)

> 💡 **What is SMTP?** It's like "Sending a Letter." It tells your Rooiam machine which post office to use to mail out your Magic Links.

---

## 🎯 MISSION PRACTICE: Test Your Setup

Before you go live, you must test your security settings:

1. **Start the Machine**: Either via `docker compose -f docker-compose.prod.yml` or your manual setup.
2. **Verify the Port**: Open your production-style Admin Dashboard.
3. **The Test**: Try sending a real Magic Link email to your own email address.
4. **Success**: If you see the email in your inbox (and not in Mailhog!), your machine is live!

**Mission Accomplished!** 🏆 You are now a Rooiam Operator.

---

## End of Mastery

You have completed the entire Mastery Course! You can now build, run, and manage any Rooiam machine. 🚀💎

**Read next**:
- [The Rooiam Textbook](../../rooiam-book/next.config.mjs) (Deep dive)
- [Infrastructure Reference](../production/01_platform_setup.md)
