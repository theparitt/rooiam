# Mission 6: Troubleshooting 101 🛠️

**Mission Goal**: Fix common mistakes when setting up your Rooiam machine.

---

## 🛠️ Mission Tools (The Toolkit)

If something doesn't work, don't panic! Most errors follow a pattern.

### 💡 Error: "Connection Refused" (Database)

- **What it means**: The "Brain" (server) tried to talk to the "Filing Cabinet" (Postgres), but the cabinet is locked (or doesn't exist).
- **How to fix**:
    1. Make sure PostgreSQL is started.
    2. Check your `.env` password. It must match your PostgreSQL password!
    3. Run `psql -U postgres` to see if you can log in manually.

### 💡 Error: "Port Already in Use" (Error 98)

- **What it means**: You are trying to open a "Door" (Port like 5171), but another app is already standing in the doorway!
- **How to fix**:
    1. Did you forget to close an old terminal window? Look for a hidden terminal running `cargo run` or `npm dev`.
    2. Close the old window or restart your computer to clear all ports.

### 💡 Error: "Command not found: cargo"

- **What it means**: You're trying to build the app but haven't installed the language tool (Rust) yet!
- **How to fix**: Go back to [Mission 3: The Developer Build](./03_mission_two_manual.md) and install the Rust toolchain.

---

## 🎯 MISSION PRACTICE: Reset Your Machine

Let's see if you can "Repair" a messy database by wiping it and starting fresh:

1. **Start the Machine**: Either via `docker compose` (Mission 1) or `cargo run` (Mission 3).
2. **Run the Repair Command**: Run `bash reset_rooiam_db.sh` in the terminal.
3. **The Test**: Does it say `Resetting Database... Done`?
4. **Confirm**: Now try to login to `admin@rooiam.demo` again. Your machine should be brand-new and ready for a fresh start!

**Mission Accomplished!** 🏆 You are now a Rooiam Mechanic.

---

## Next Mission

Ready to go beyond your own machine into the real world? 👉 [**Mission 7: Production Setup**](./07_production_setup.md)
