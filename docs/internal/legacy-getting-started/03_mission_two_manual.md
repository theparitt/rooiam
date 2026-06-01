# Mission 3: The Developer Build 👨‍💻

**Mission Goal**: Install all the tools (Postgres, Redis, Rust, Node) on your own machine and build the Rooiam "Brain" manually.

---

## 🛠️ Mission Tools (The Essentials)

Install these on your computer first:

1. PostgreSQL 14+: The big filing cabinet (Database).
2. Redis: The quick sticky note (Session storage).
3. Rust Toolchain: The language we use to build the brain.
4. Node.js 18+ & npm: The tools we use to build the face (Frontend).

> 💡 **What is a Database?** Think of it as a "Smart Spreadsheet." It saves everyone's password and organization name so they don't get lost when you restart your computer.

---

## 🏃 Step 1: Install your "Builders"

Before you start, make sure your computer has the tools:

```bash
psql --version
redis-server --version
cargo --version
node --version
npm --version
```

If you see a version for each, you are ready to build!

---

## 📂 Step 2: Clone and Configure

```bash
git clone https://github.com/theparitt/rooiam
cd rooiam
```

Now, we need to tell the app how to find the database. Create a file named `.env` in the `rooiam-server/` folder and paste this inside:

```env
ROOIAM_DATABASE_URL=postgres://rooiam:yourpassword@127.0.0.1:5432/rooiam
ROOIAM_REDIS_URL=redis://127.0.0.1:6379
ROOIAM_ALLOWED_ORIGINS=http://localhost:5171,http://localhost:5172,http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176
ROOIAM_ENABLE_DEMO_SEED=true
ROOIAM_STORAGE_ROOT=./storage
ROOIAM_PUBLIC_MEDIA_BASE=/media
```

💡 **Tip:** Change `yourpassword` to the password you set when you installed PostgreSQL!

---

## 🧱 Step 3: Run the Database "Migration"

Rooiam needs to organize its filing cabinet (Postgres). Run these commands:

```bash
cd rooiam-server
cargo install sqlx-cli --no-default-features --features postgres
sqlx migrate run --database-url "$ROOIAM_DATABASE_URL"
```

> 💡 **What is a "Migration"?** It's like telling your computer: "Go to the database and create a table for Users and another one for Organizations." Without this, the server won't know where to save your data!

---

## 🎯 MISSION PRACTICE: Run the "Brain"

1. Start the Server:

   ```bash
   cd rooiam-server
   SQLX_OFFLINE=true cargo run
   ```

2. When it says `DEMO MODE ENABLED`, the brain is online.
3. **The Test**: Open another terminal and run `curl http://localhost:5170/health`.
4. If it says `{"status":"ok"}`, you have successfully built a manual machine!

**Mission Accomplished!** 🏆 You have successfully built it.

---

## Next Mission

Ready to understand "Who can do what" in the system? 👉 [**Mission 4: Identity & Roles**](./04_mastering_identity_and_roles.md)
