# End-User Account Center

This page documents every feature a regular end-user (workspace member) can access inside `rooiam-app` — the portal at `http://localhost:5172`.

These are **user-self-service** features. None of them require platform or workspace admin access.

---

## Where to Find It

Log in as any workspace member. After login you land inside the portal.

The sidebar on the left shows all sections available to you:

| Section | Route | What it is |
| :--- | :--- | :--- |
| My Profile | `/portal/profile` | Display name and avatar |
| My Account | `/portal/account` | Linked sign-in providers (Google/Microsoft) |
| My Security | `/portal/security` | Passkeys and TOTP MFA |
| My Sessions | `/portal/sessions` | Active sessions across devices |
| My Audit Logs | `/portal/audit` | Personal event history |

---

## Sign-In Methods

Before you reach the portal, you sign in. Which methods appear depends on the workspace configuration set by the workspace owner.

| Method | How it works |
| :--- | :--- |
| **Magic Link** | Enter your email → receive a one-time link → click it |
| **Google** | Redirect to Google OAuth → return authenticated |
| **Microsoft** | Redirect to Microsoft OAuth → return authenticated |
| **Passkey** | Uses your device biometrics (Face ID, Touch ID, Windows Hello, PIN) |

A workspace can restrict these. For example, MooPizza in the demo only allows Magic Link and Passkey — Google is disabled at the workspace level.

---

## My Profile

**File**: `PortalMyProfile.tsx`

What a user can do:

- **Display name** — edit inline, saves automatically after a short debounce (600ms). No save button needed.
- **Avatar** — upload any image file. The server validates file type and size. The same max size limit applies as workspace branding uploads.
- **Remove avatar** — reverts to the default Rooiam icon.

What is not here:

- Email change is a separate workspace-admin-controlled flow, not available in this panel.
- No username/handle separate from display name.

> 💡 In demo mode, the form input is still editable but the save is locked. A warning banner says "Personal account changes are locked in demo mode."

---

## My Account (Linked Providers)

**File**: `PortalMyAccount.tsx`

A user can link or unlink OAuth providers (Google, Microsoft) to their Rooiam identity.

**How linking works:**

1. Click **Link Google** or **Link Microsoft**.
2. You are redirected to Google/Microsoft OAuth.
3. On return, a `link_result=success` query param is parsed and the linked status updates.

**How unlinking works:**

1. Click **Unlink** on a linked provider card.
2. A `DELETE` call is sent to the server immediately.
3. If successful, the provider card shows "Not linked."

**Important constraint shown in the UI:**

> For security, linking and unlinking requires a recent sign-in. If your session is older than 10 minutes, sign out and sign in again first.

**What the panel also shows:**

- Primary email on the account
- Whether magic link is available for this identity
- Number of registered passkeys
- Whether TOTP is enabled

---

## My Security

**File**: `PortalMySecurity.tsx`

Two tabs: **Passkeys** and **TOTP MFA**.

### Passkeys

- **Register a passkey**: Enter a device name, click "Add Passkey." The browser opens the WebAuthn prompt (Face ID, fingerprint, Windows Hello, etc.).
- **Passkey list**: Each registered passkey shows its name, registration date, and last used date.
- **Remove a passkey**: One click. No confirmation dialog.
- **Pagination**: If you have more passkeys than the page size, pagination controls appear.

### TOTP MFA

Three states the panel can be in:

**State A — Not enrolled:**

- Shows a single "Set Up TOTP" button.

**State B — In progress (challenge started):**

- QR code displayed for scanning with an authenticator app (Google Authenticator, Authy, 1Password, etc.).
- Raw TOTP secret shown as text (for apps that cannot scan QR codes).
- Raw `otpauth://` URI also shown.
- Verification code input — user enters the 6-digit code from their app.
- "Enable TOTP" button confirms the enrollment.

**State C — Enrolled:**

- Shows "TOTP MFA is enabled."
- Shows remaining backup codes count.
- **Regenerate Backup Codes** — generates a fresh set of single-use codes, shown once in a highlighted amber box. Store them somewhere safe.
- **Disable TOTP** — disables the authenticator requirement.

> 💡 Backup codes are shown once after regeneration. They are not shown again. Store them in a password manager or printed somewhere safe.

---

## My Sessions

**File**: `PortalMySessions.tsx`

Shows all active sessions for your account across browsers and devices.

**Current session** — highlighted in green. Shows:
- User-agent (browser/device string)
- IP address
- Login date
- Last active timestamp
- Which app and workspace context the session belongs to

**Other active sessions** — shows all other sessions. For each you can:
- **Revoke** — immediately terminates that one session
- **Revoke All Others** — terminates every session except the current one

Revocation is immediate. No confirmation dialog.

> 💡 Use this if you forgot to sign out on a shared computer, or if you think someone else has access to your account.

---

## My Audit Logs

**File**: `PortalMyAuditLogs.tsx`

A personal event stream. Shows **your account actions only** — not tenant or workspace history.

Events recorded include:

- Sign-in attempts (success and failed)
- MFA events (enrolled, disabled, backup codes regenerated)
- Linked account events (linked/unlinked Google or Microsoft)
- Passkey events (registered, removed)
- Session events (revoked)

Each event shows:
- Timestamp
- Action name (color-coded: green = success, red = failed, blue = other)
- Target type and ID
- IP address

Paginated with configurable page size (default 25).

---

## What Is Still In Progress or Not Yet Available

The following features have partial server-side support but the end-user UI is not yet complete or polished:

| Feature | Status | Notes |
| :--- | :--- | :--- |
| **Email change request** | Partial | Server flow exists. The end-user verification landing in the downstream app needs improvement. |
| **Security alerts** | Not started | Suspicious login, new device login notifications. Strong for enterprise positioning. |
| **Passkey rename** | Not started | Passkeys can be removed but not renamed after registration. |
| **Lost authenticator / recovery flow** | Partial | Backup codes exist. A clearer "I lost my phone" guided recovery flow is not yet built. |
| **Sign out everywhere confirmation** | Partial | "Revoke all others" exists but no confirmation dialog or summary shown before action. |

---

## Demo Mode Restrictions

When `ROOIAM_ENABLE_DEMO_SEED=true` and the user is logged in as a demo account, personal changes are locked:

- **My Profile**: Form is editable but saving is blocked (warning shown).
- **My Account**: Linking and unlinking is blocked (warning shown).
- **My Security**: Passkey registration, TOTP enrollment, and disable are all blocked (warning shown).
- **My Sessions**: Revocation works (not blocked in demo mode).
- **My Audit Logs**: Fully visible, no restrictions.

---

## Demo Accounts to Test With

Use any of these to explore the account center pages:

| Email | Workspace | Role |
| :--- | :--- | :--- |
| `minmin@lovechocolate.user` | RooChoco | End user (member only) |
| `lulu@softmallow.user` | MintMallow | End user |
| `mozza@cheesetown.user` | MooPizza | End user |
| `rooroo@sweetfactory.demo` | RooChoco | Workspace Owner (also sees admin panels) |

Login URL pattern: `http://localhost:5172/?org=roochoco`

Replace `roochoco` with `mintmallow`, `moopizza`, `berryburger`, or `melonhoneytoast` to access different workspaces.
