# Mission 4: Identity & Roles 🧠

**Mission Goal**: Understand the "Chain of Command" in Rooiam and the Permission Matrix.

---

## 🏗️ The 3-Tiered Hierarchy

Rooiam is built to handle many companies in one system. We call this **Multi-Tenancy**.

### 👑 Tier 1: Platform Level (Global)

This is the machine itself.

- **Platform Owner**: The "God" role. Can delete everything and manage all settings.
- **Platform Admin**: The "Landlord." Can create new companies (Tenants) and manage global SMTP.

### 👥 Tier 2: Tenant / Workspace Level

This is a single company (like "RooChoco") living inside the machine.

- **Workspace Owner**: The "CEO." Can delete the company, manage billing, and invite others.
- **Workspace Admin**: The "Manager." Can invite members and change colors/branding.

### 🎮 Tier 3: End-User Level

These are the customers or employees who use the apps!

- **Customer / Member**: Can log in and use applications, but cannot change any system settings.

---

## 🛡️ The "Tighten-Only" Permission Matrix

Rooiam has a special code rule: **A sub-level can only make security STRICER, never looser than the parent.**

| Feature | Platform Policy | Tenant Policy | Final Result |
| :--- | :--- | :--- | :--- |
| **MFA Status** | **Required** | Optional | **Required** (Platform forces it) |
| **MFA Status** | Optional | **Required** | **Required** (Tenant chose it) |
| **Magic Links** | **Disabled** | Enabled | **Disabled** (Platform blocked it) |
| **Magic Links** | Enabled | **Disabled** | **Disabled** (Tenant doesn't want it) |

---

## 🎯 MISSION PRACTICE: Role Awareness

Before we log in, tell yourself who you are going to be:

1. If you use `admin@rooiam.demo`, you are at **Tier 1 (Global)**.
2. If you use `rooroo@sweetfactory.demo`, you are at **Tier 2 (Workspace Boss)**.
3. If you use `minmin@lovechocolate.user`, you are at **Tier 3 (Standard User)**.

**Mission Accomplished!** 🏆 You now understand the rules of the system.

---

### Next Mission

Ready to test these "Security Badges" in the field? 👉 [**Mission 5: The Identity Lab**](./05_the_identity_lab.md)
