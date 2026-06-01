# Mission 5: The Identity Lab 🧪

**Mission Goal**: Test your roles, tenants, and permissions by switching between 15+ pre-seeded characters.

---

## 🛠️ Mission Tools (The Security Badge)

To explore these features, you must have `ROOIAM_ENABLE_DEMO_SEED=true` in your `.env`.

> 💡 **What is RBAC?** It's like a "Security Badge." If your badge says **Boss**, you can access everything. If your badge says **Guest**, you can only see the lobby.

---

## 👤 The Identity Map

When you boot Rooiam in "Demo Mode," we create these characters for you:

### 1. Platform Administration

These accounts have global access to manage all tenants (companies).

| Email | Name | Role | Access |
| :--- | :--- | :--- | :--- |
| `owner@rooiam.demo` | Roo Owner | Platform Owner | Full system control |
| `admin@rooiam.demo` | Roo Admin | Platform Admin | System-wide settings |

---

### 2. Tenant (Organization) Admins

These characters manage specific companies (RooChoco, MintMallow, etc.).

| Company | Email | Name | Role |
| :--- | :--- | :--- | :--- |
| **RooChoco** | `rooroo@sweetfactory.demo` | rooroo | **Owner** |
| **RooChoco** | `fondue@honeychoco.demo` | Fondue | **Admin** |
| **MintMallow** | `peppermint@mintmallow.demo` | Peppermint | **Admin** |
| **MooPizza** | `mozza@cheesetown.user` | Mozza | **Customer** |

---

## 🎯 MISSION PRACTICE: Test Your Badge

Let's see if you can log in as a "User" and try to play "Boss" (and fail!).

1. **Start the Machine**: Either via `docker compose` (Mission 1) or `cargo run` (Mission 3).
2. **Open the App Login**: `http://localhost:5172/?org=roochoco`.
3. **Try to Login as a "User"**: Enter `minmin@lovechocolate.user`.
4. **The Test**: Click on **Settings** in the sidebar. Can you change the company's brand color? (No! Because your "Badge" doesn't have permissions).
5. **Try to Login as a "Boss"**: Now logout and re-login as `rooroo@sweetfactory.demo`.
6. **The Success**: Now you *can* change the branding, invite members, and delete apps. Your "Badge" has changed!

**Mission Accomplished!** 🏆 You have mastered the identity boundary.

---

## Next Mission

Did something break? Let's fix it like a pro. 👉 [**Mission 6: Troubleshooting 101**](./06_troubleshooting_101.md)
