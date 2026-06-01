# Security Model: Attack Patterns & Defenses

> This document describes Rooiam's threat model, the attack patterns we defend against,
> and the security architecture behind Account Recovery, Rate Limiting, and Login Alert features.
> It is written for platform operators, workspace administrators, and developers integrating Rooiam.

---

## 1. Rooiam's Identity Anchor

Rooiam is **passwordless-first**. This means the primary proof of identity is:

| Method | Identity Anchor | Verification Provider |
|---|---|---|
| Magic Link | Email ownership (you clicked the link in your inbox) | Rooiam (SMTP delivery) |
| Google OAuth | Email verified by Google | Google |
| Microsoft OAuth | Email verified by Microsoft | Microsoft |
| Passkey | Cryptographic device key | User's device / platform authenticator |

There are **no passwords stored**. This eliminates the largest single attack vector in traditional IAM (credential stuffing, breach replay, weak passwords).

---

## 2. Threat Model — Attack Patterns We Defend Against

### 2.1 Email Compromise Attack

**Scenario:** An attacker gains access to the victim's inbox (e.g., phishing, mail server breach, SIM swap of recovery email).

**What they can do:**
- Receive a Magic Link → log in to any workspace that does not require MFA
- Attempt email-based account recovery to bypass MFA

**Rooiam's defenses:**
- MFA (TOTP) acts as the second factor for high-security workspaces — email access alone is not enough
- Suspicious login alert is sent to the same email (but note: if attacker has the email, this alert goes to them too)
- Rate limiting prevents rapid magic link request spamming
- Cooling period (24h) after account recovery blocks immediate sensitive actions
- Audit trail records all login events with IP and device

**Residual risk:** If attacker has full inbox control and no MFA is required by the workspace, they can log in. This is an organizational policy decision — high-security workspaces should enforce MFA.

---

### 2.2 Device Theft Attack

**Scenario:** An attacker physically steals a user's phone or laptop. The TOTP app is on that device.

**What they can do:**
- Use the TOTP app to pass MFA — if they also know the email or have a session
- Attempt to use a logged-in browser session if the device is unlocked

**Rooiam's defenses:**
- Session revocation — victim can immediately revoke all sessions from another device
- Platform/workspace admins can force-revoke all sessions for a user
- Backup codes are separate from the device (if user saved them)
- Cooling period after recovery prevents immediate account changes

**What to do if this happens:**
1. Sign in on another device
2. Go to Sessions → Revoke all sessions
3. Remove the stolen device's passkey if registered
4. Contact workspace admin if you cannot sign in

---

### 2.3 Backup Code Theft Attack

**Scenario:** An attacker finds the user's backup codes (screenshot, printed copy, unencrypted file).

**What they can do:**
- Use a backup code during login to bypass TOTP

**Rooiam's defenses:**
- Backup codes are **single-use** — consumed after one use
- Each use is logged in the audit trail with IP and timestamp
- User receives a security alert when backup codes are used
- If attacker uses all codes, user will be alerted and can regenerate

**Best practice for users:** Store backup codes in a password manager or encrypted vault, not as a screenshot.

---

### 2.4 Social Engineering Attack (Admin Impersonation)

**Scenario:** An attacker contacts a workspace admin claiming to be a locked-out user and asks for MFA to be disabled.

**What they can do:**
- If the admin acts without verification, gain unauthorized access

**Rooiam's defenses:**
- Admin must **re-authenticate** before disabling MFA for any user
- All admin actions are logged in the audit trail with actor identity
- Security alert is sent to the target user's email when MFA is reset by admin
- Admins should verify identity out-of-band (video call, internal HR system)
- Cooling period (24h) before sensitive actions are allowed after admin reset

---

### 2.5 Brute Force / Magic Link Spam Attack

**Scenario:** An attacker sends thousands of magic link requests to a victim's email, either to flood the inbox or to find a weak rate limit window.

**What they can do:**
- Flood victim's inbox (annoyance/phishing cover)
- Try to race a magic link before it becomes invalid
- Attempt to discover valid email addresses via response timing

**Rooiam's defenses:**
- **Rate limiting** (Platform Floor + Workspace Tighten model — see Section 4)
- Magic links expire in 15 minutes and are single-use
- Consistent response time for both valid and invalid emails (no timing oracle)
- 429 responses include `Retry-After` header

---

### 2.6 Session Hijacking Attack

**Scenario:** An attacker intercepts or steals a session cookie (XSS, network sniff).

**What they can do:**
- Make authenticated API calls as the victim

**Rooiam's defenses:**
- Sessions are stored server-side (Redis); cookies are opaque references
- `HttpOnly` + `Secure` + `SameSite=Lax` cookie flags
- Session revocation invalidates the server-side record immediately
- Suspicious login detection flags sessions from new IPs

---

## 3. Account Recovery Architecture

### 3.1 Recovery Tiers

Recovery is structured as three tiers in increasing escalation:

```
Tier 1: Backup Codes            → Self-service, zero trust, instant
Tier 2: Email Magic Link        → Self-service, 24h cooling period, alert sent
Tier 3: Admin Manual Override   → Human review, admin re-auth required, alert sent
```

### 3.2 Tier 1 — Backup Codes

- Generated at TOTP enrollment time (10 codes, shown once)
- Stored as bcrypt hashes server-side
- Each code is single-use — consumed and invalidated after use
- No expiry, but regeneration invalidates all previous codes
- Recovery codes bypass TOTP but not the session/identity check
- After login via backup code → user is prompted to re-enroll TOTP
- Audit log: `auth.mfa.backup_code.used` with IP and timestamp

**User experience:**
1. At TOTP challenge → "Use a backup code instead"
2. Enter any valid backup code
3. Code is consumed → user is logged in
4. Immediately prompted: "You should re-enroll your authenticator app"

---

### 3.3 Tier 2 — Email Magic Link Recovery

Applies when: user lost TOTP device **AND** lost backup codes, but still controls primary email.

**Why email is valid identity proof:**
Since Rooiam's primary auth method is Magic Link (email ownership = identity), proving email ownership via a recovery magic link is consistent with the platform's trust model. A user who can receive an email at their primary address is, by definition, who they claim to be within Rooiam's identity model.

**Flow:**
1. TOTP challenge page → "Lost your authenticator? Recover via email"
2. Rooiam sends a recovery magic link to the primary email
3. Link is **single-use**, expires in **30 minutes** (shorter than login links)
4. User clicks link → TOTP is suspended for this session only
5. User is immediately forced to **re-enroll TOTP** — cannot skip
6. Security alert email sent: *"Account recovery was used at [time] from [IP/device]. If this wasn't you, contact your workspace admin immediately."*
7. **24-hour cooling period** on sensitive actions: email change, passkey changes, admin operations

**Constraints when workspace has `require_mfa: true`:**
- Email recovery grants a **re-enrollment window only** — not full access
- Until TOTP is re-enrolled, the user cannot access protected workspace resources
- Admin can monitor who has used email recovery in the audit log

**Defense against attacker with email access:**
- Attacker with email access in an MFA-required workspace still cannot access the workspace without completing TOTP re-enrollment
- The security alert email immediately notifies the legitimate user
- Cooling period blocks sensitive changes for 24h, giving time to respond

---

### 3.4 Tier 3 — Admin Manual Override

For: users who have lost email access AND lost TOTP AND lost backup codes (or organizational policy requires admin-controlled recovery).

**Flow:**
1. User contacts workspace admin (out-of-band: Slack, HR system, video call)
2. Admin verifies identity independently (Rooiam does not mandate the method — this is organizational policy)
3. Admin in Rooiam workspace console → Members → [User] → "Disable MFA"
4. Admin must **complete a step-up re-authentication** before the action is allowed
5. MFA is disabled for the target user
6. Security alert email is sent to the target user
7. Audit log: `admin.user.mfa_disabled` with admin identity, IP, and timestamp
8. Same 24-hour cooling period applies

**Why admin re-auth is required:**
Prevents a social-engineered admin from being a single point of failure. Even if an attacker convinces the admin conversationally, the admin must physically authenticate again before the action applies.

---

## 4. Rate Limiting Architecture

Rooiam uses a **layered rate limiting model** for magic link requests:

### Model: Platform Floor + Workspace Tighten

```
Platform Admin sets the MINIMUM protection floor:
  - Default: 5 magic link requests per 10 minutes per email
  - This cannot be loosened by workspace owners

Workspace Owner can set a STRICTER limit for their workspace:
  - Example: 3 requests per 10 minutes (stricter → allowed)
  - Example: 10 requests per 10 minutes (looser than platform → rejected)
```

### Rate Limit Response

When a user hits the rate limit:
- HTTP `429 Too Many Requests` is returned
- Response includes `Retry-After` header with seconds until the window resets
- The login widget shows: *"Too many sign-in attempts. Please wait X minutes before trying again."*
- The message does NOT indicate whether the email is valid (prevents email enumeration)

### Implementation

- Rate limit state is stored in Redis with key: `ratelimit:magic:{workspace_id}:{email_hash}`
- Uses a sliding window counter
- Workspace-specific limits are stored in workspace settings
- Platform floor is stored in platform session policy settings

### Settings Location

| Setting | Where | Who Can Change |
|---|---|---|
| Platform floor (default 5/10min) | Platform Admin → Session Policy | Platform Admin only |
| Workspace override (must be ≤ floor) | Workspace Owner → Login Policy | Workspace Owner / Admin |

---

## 5. Suspicious Login Detection

A suspicious login is detected when a successful authentication occurs from a **new device or IP** that has not been seen for this user-workspace combination before.

### Detection Criteria

A login is flagged as suspicious if **any** of the following differ from the last known login:
- IP address (significant subnet change, not just minor ISP rotation)
- User-agent string (new browser or OS)
- Country (if IP geolocation is available)

### Security Alert Email

When a suspicious login is detected, Rooiam sends a security alert email to the user's primary email containing:
- Time and date of the login
- IP address
- Device / browser detected
- Workspace accessed
- A link to revoke all sessions immediately
- Contact information for workspace admin

**Template:** Uses the same branded HTML template as Magic Links — recognizable, not phishing-like.

### User Actions After Receiving Alert

If the login was legitimate:
- No action required

If the login was NOT the user:
1. Click "Revoke all sessions" link in the email
2. Contact workspace admin
3. Admin can force-revoke all sessions and disable MFA for re-enrollment

### Opt-out Consideration

Suspicious login alerts are **on by default**. Users cannot opt out of security alerts — this is intentional. Allowing opt-out would let an attacker (who has account access) disable the alert system.

---

## 6. Defense in Depth Summary

| Threat | Rate Limit | MFA | Recovery Policy | Session Revoke | Alert Email | Audit Log |
|---|---|---|---|---|---|---|
| Email compromise | ✅ | ✅ | Tier 2 cooling | ✅ | ✅ | ✅ |
| Device theft | ✅ | — | Tier 1/2 | ✅ | ✅ | ✅ |
| Backup code theft | ✅ | ✅ | — | ✅ | ✅ | ✅ |
| Social engineering admin | — | ✅ (re-auth) | Tier 3 cooling | ✅ | ✅ | ✅ |
| Magic link spam | ✅ | — | — | — | — | ✅ |
| Session hijack | — | — | — | ✅ | ✅ | ✅ |

No single defense is sufficient. The layers are designed so that an attacker who bypasses one layer immediately hits another.

---

## 7. Edge Case: Total Account Lockout

**Scenario:** User has lost email access, lost TOTP device, lost all backup codes.

This is the hardest case. At this point:
- Tier 1 (backup codes) — not available
- Tier 2 (email recovery) — not available (email lost)
- Only Tier 3 (admin override) remains

**Process:**
1. User contacts workspace admin
2. Admin verifies identity out-of-band (video call with ID)
3. Admin disables MFA
4. Admin or IT team restores email access first (this is outside Rooiam's scope — it is an organizational process)
5. Once email is restored, user can log in via Magic Link and re-enroll MFA

**Who can help if there is no workspace admin or the admin is also locked out:**
- Platform admin (Rooiam operator) can intervene at the platform level
- This is an organizational emergency procedure — document it in your org's security runbook

---

## 8. Recommended Workspace Security Policies

| Policy | Recommended Setting | Why |
|---|---|---|
| Require MFA | Yes (for sensitive workspaces) | Email compromise alone not sufficient |
| MFA rate limit | 5 attempts / 10 min (or tighter) | Prevent TOTP brute force |
| Magic link rate limit | 3–5 requests / 10 min | Prevent inbox flooding |
| Session duration | 24–72 hours (not "forever") | Limit session hijack window |
| Passkey enabled | Yes | Strongest auth factor, phishing-resistant |
| Backup codes | Required at MFA enrollment | Ensure Tier 1 recovery is always available |
