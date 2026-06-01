# Mission 2: The Map of Apps 🗺️

**Mission Goal**: Understand why Rooiam has 5 different websites and learn to navigate between them like a Pro.

---

## 🏗️ Mission Architecture: The Brain vs. The Face

When you run Rooiam, there are **6 main apps** running at the same time. Each lives behind a different **Port** (think of them as "Apartment Numbers" on your computer).

### 🧠 The Brain: Port 5170 (rooiam-server)
- **What is it?** This is the **Rust API**. It handles all the logic, checks passwords, and talks to the database.
- **Can I see it?** Only as pure text! Visit `http://localhost:5170/health` to see if the brain is thinking.

> 💡 **What is an API?** Think of it as the "Brain" of the app. It's smart but has no face. The website you see (the Face) has to talk to the API (the Brain) to get things done.

---

### 🧥 The Faces: The Frontends

| Port | App Name | Who uses it? | Mission Goal |
| :--- | :--- | :--- | :--- |
| **5171** | `rooiam-admin` | **The Platform Boss** 👑 | Manage every company (Tenant) and system-wide SMTP. |
| **5172** | `rooiam-app` | **The Tenant Owner** 👥 | Manage *one* company’s brand, members, and login methods. |
| **5173** | `rooiam-landing` | **The Public** 🚪 | The "Front Door" marketing site where customers learn about your app. |
| **5174** | `rooiam-demo` | **A Sample User** 🎮 | See how Rooiam integrates into a real app (e-commerce, game, etc.). |
| **5175** | `rooiam-docs` | **The Developer** 📖 | You! Read this site to learn how everything works. |
| **5176** | `rooiam-book` | **The Student** 📚 | Read the deep architecture "Textbook" on IAM design. |

---

## 🎯 MISSION PRACTICE: Switch Your Identity

Let's test if you understand the differences between the Port "Apartments":

1.  **Platform Mode (5171)**: Open the Admin Dashboard: `http://localhost:5171`. This is where all the "Tenants" are listed.
2.  **Tenant Mode (5172)**: Open the App Portal: `http://localhost:5172/?org=roochoco`. This is where *one* tenant (RooChoco) manages its own settings.
3.  **User Mode (5174)**: Open the Demo App: `http://localhost:5174/?org=roochoco`. This is where a *Standard User* (like Fondue) would log in to buy chocolate.

**Mission Accomplished!** 🏆 You now know your way around the Rooiam building.

---

### Next Mission:
Ready to build the brain manually without Docker? 👉 [**Mission 3: The Developer Build**](./03_mission_two_manual.md)
