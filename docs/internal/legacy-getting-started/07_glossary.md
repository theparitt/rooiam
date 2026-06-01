# 📖 Glossary of Terms (The Dictionary) 📚

If you find a word you don't know in the Mission Guides, look for it here!

---

## 🖥️ The Hardware & Network

### 🏢 Port (e.g. 5171, 5172, 5174)

Think of your computer as a big **Apartment Building**. Each app lives in a different "Apartment Number" or **Port**. If you go to the wrong door, nobody is home.

### 🏠 Localhost

This means "This Computer." When you open `http://localhost`, you are telling your browser to look inside your own machine, not on the internet.

### 🪄 Terminal / CLI

The black screen where you type text commands. It is like being a wizard—you type the spell (the command) and the computer does the work.

---

## 💾 The Storage

### 🗄️ Database (PostgreSQL)

A super-organized digital filing cabinet. It is where we save your user name, your profile picture, and your "Boss" status.

### 📝 Redis

A "Quick Note" or sticky note on your desk. It is used for things the computer needs to remember *super fast*, like "Is this user currently logged in?"

### 📦 MinIO / S3

A big digital box where we put your photos and file uploads.

---

## 🧠 The Architecture (The "How It Works")

### 🧠 API / Server

The "Brain" of the app. It does all the math, checks your password, and talks to the database. It doesn't have a screen of its own.

### 🎭 Frontend / UI

The "Face" of the app. This is the website you see in Chrome or Safari with buttons and colors. It talks to the Brain (the API) to get data.

### 🏢 Multi-tenant

This just means "One app, many bosses." Like an apartment building (the app) where different families (the tenants) live separately and can't see each other's rooms.

---

## 🛠️ The Developer Tools

### 📋 Environment Variable (.env)

A "Settings List" for your app. It tells the app: "The database is at this door number" and "Your name is Rooiam."

### 🍱 Docker

A magic lunchbox. Instead of cooking every meal (installing every tool) yourself, Docker gives you a pre-packed lunchbox that just works.

### 🏗️ Cargo

The "Builder" for Rust (our programming language).

### 🧩 NPM

The "Lego Box" for our websites. It downloads all the pieces we need to build a UI.
