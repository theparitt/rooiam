# Mission 1: The Docker Magic ✨

**Mission Goal**: Get the entire Rooiam ecosystem running in 2 minutes using Docker, and change your first brand color.

---

## 🛠️ Mission Tools (What you need)

Install these first:
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (For Windows/Mac)
- **OR** Docker Engine with `docker compose` (For Linux)

> 💡 **What is Docker?** Think of it as a "Pre-packed Lunchbox." You don't need to cook (install) everything yourself; the lunchbox has the server, database, and all 6 websites ready to use inside **Containers** (mini-boxes).

---

## 📦 Step 1: Start the Magic

Open a terminal and run:

```bash
git clone https://github.com/theparitt/rooiam
cd rooiam
docker compose -f docker-compose.demo.yml up --build
```

**Wait for it!** You will see a lot of text scrolling by. When it stops, your machine is online.

### 🗺️ The Map of Your Apps
Once it's running, open these in your browser:

- `http://localhost:5171` — **Admin Dashboard** (The Platform Center) 👑
- `http://localhost:5172` — **App Login** (The User Portal) 👥
- `http://localhost:5174` — **Downstream Demo** (A Sample App) 🎮
- `http://localhost:5175` — **Docs** (This site!) 📖
- `http://localhost:5176` — **The Book** (The IAM Textbook) 📚
- `http://localhost:8025` — **Mailhog** (Email Inbox) 📧
- `http://localhost:9001` — **MinIO** (Store photos here) 📂

---

## 🎯 MISSION PRACTICE: Change Your First Color

Let's prove you can control the machine:

1.  Open the Admin Dashboard: `http://localhost:5171`
2.  Login as `admin@rooiam.demo`
3.  Click on **Organizations** in the sidebar.
4.  Find **RooChoco** and click it.
5.  Change the **Brand Color** (e.g., set it to `#FF69B4` for Hot Pink!).
6.  Click **Save**.
7.  Now open the App Login: `http://localhost:5172/?org=roochoco`
8.  **Look!** The buttons and logo background are now your new color.

**Mission Accomplished!** 🏆

---

## 🛑 Step 2: Stop and Clean Up

When you are finished "playing," stop the magic so your computer doesn't get tired:

```bash
docker compose -f docker-compose.demo.yml down
```

### Next Mission:
Ready to understand *why* there are so many pieces? 👉 [**Mission 2: The Map of Apps**](./02_the_map_of_apps.md)
