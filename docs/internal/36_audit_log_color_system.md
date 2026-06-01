# Audit Log Color & Tone System

**Last updated:** 2026-03-25

This document describes the 12-tone color and icon system used for audit log event badges across all audit log pages in Rooiam.

---

## Overview

Every audit log event badge is colored and given an icon based on its **tone** — a semantic category derived from the action string. The same 12-tone system is implemented in two places:

| File | Used by |
|---|---|
| `rooiam-admin/src/lib/audit-style.ts` | All admin console audit log pages |
| `rooiam-app/src/lib/audit-events.ts` | All portal (app) audit log pages |

Both files use identical tone logic so badges look the same in both UIs.

---

## Tone Reference Table

| Tone | Tailwind color | Badge appearance | Icon | Triggered by |
|---|---|---|---|---|
| `login` | **teal** | `bg-teal-50 text-teal-700 border-teal-200` | LogIn | `*.login.success` |
| `logout` | **slate** (neutral) | `bg-slate-100 text-slate-500 border-slate-300` | LogOut | `*.logout.success` |
| `failed` | **rose** (soft red) | `bg-rose-50 text-rose-700 border-rose-200` | ServerCrash | `*.failed`, `*.blocked`, `*.suspicious`, `*.binding_mismatch` |
| `delete` | **red** (strong) | `bg-red-100 text-red-700 border-red-300` | Trash2 | `*.deleted`, `*.removed`, `*.revoked`, `*.disabled`, `*.rejected`, `account.deletion`, `account.deleted` |
| `create` | **emerald** | `bg-emerald-50 text-emerald-700 border-emerald-200` | Plus | `*.created`, `*.registered`, `*.enrolled`, `*.invited`, `*.accepted`, `*.sent`, `*.requested` |
| `modify` | **sky** | `bg-sky-50 text-sky-700 border-sky-200` | Pencil | `*.updated`, `*.changed`, `*.restored`, `*.rotated`, `*.renamed`, `*_transfer.*`, `role_changed`, `*.reauth_required` |
| `workspace` | **indigo** | `bg-indigo-50 text-indigo-700 border-indigo-200` | Building2 | `workspace.*` namespace |
| `admin` | **amber** | `bg-amber-50 text-amber-700 border-amber-200` | Shield | `admin.*`, `platform.*` namespaces |
| `oauth` | **violet** | `bg-violet-50 text-violet-700 border-violet-200` | Key | `oauth.*`, `token.issued`, `token.refreshed` |
| `mfa` | **cyan** | `bg-cyan-50 text-cyan-700 border-cyan-200` | Fingerprint | `auth.mfa.*`, `auth.passkey.*` |
| `identity` | **purple** | `bg-purple-50 text-purple-700 border-purple-200` | User | `identity.*`, `user.*`, `sessions.revoked`, `session.*` |
| `info` | **blue** | `bg-blue-50 text-blue-700 border-blue-200` | Info | Catch-all — anything not matched above |

---

## Color Rationale

The color choices follow a deliberate semantic logic:

- **Teal** (login) — distinctive, positive, calm. Immediately recognisable as a sign-in event.
- **Slate** (logout) — neutral and de-emphasised. Logouts are expected, routine events.
- **Rose** (failed) — soft red. Warning without alarm — failed attempts are common noise, not critical.
- **Red** (delete) — stronger than rose. Destructive actions (delete, revoke, disable) need clear visual weight.
- **Emerald** (create) — positive green. Creation and enrollment are generally good events.
- **Sky** (modify) — light blue. Routine changes — not harmful but worth tracking.
- **Indigo** (workspace) — brand color of Rooiam. Workspace events are the core product domain.
- **Amber** (admin) — elevated privilege indicator. Operator and platform actions stand out without being alarmist.
- **Violet** (oauth) — distinctive purple. OAuth token flow is a separate auth path from session login.
- **Cyan** (mfa) — security factor events. Bright, security-associated color.
- **Purple** (identity) — user profile and account management. Distinct from workspace (indigo) and oauth (violet).
- **Blue** (info) — neutral catch-all for anything not yet categorised.

---

## Priority Order

`actionTone()` / `actionStatusTone()` evaluates rules in this order:

1. `login.success` → login
2. `logout.success` → logout
3. Failure suffixes (`.failed`, `.blocked`, `.suspicious`, `.binding_mismatch`) → failed
4. Destructive suffixes (`.deleted`, `.removed`, `.revoked`, `.disabled`, `.rejected`, `account.deleted`) → delete
5. `admin.*` / `platform.*` namespace → admin
6. `oauth.*` / token events → oauth
7. `auth.mfa.*` / `auth.passkey.*` → mfa
8. `workspace.*` namespace → workspace
9. `identity.*` / `user.*` / session events → identity
10. Creation suffixes (`.created`, `.registered`, `.enrolled`, `.invited`, `.accepted`, `.sent`, `.requested`) → create
11. Modification suffixes (`.updated`, `.changed`, `.restored`, `.rotated`, `.renamed`, `_transfer.*`, `role_changed`, `.reauth_required`) → modify
12. Fallback → info

Priority matters when an action string could match multiple rules. For example:
- `workspace.member.removed` → matches both `workspace.*` (#8) and `.removed` (#4). But rule #4 (delete) wins because it comes earlier.
- `auth.mfa.verified` → matches `auth.mfa.*` (#7). Does NOT match `.failed` (#3). Result: mfa.

---

## Adding a New Tone

1. Add the tone name to the `ActionTone` union type in both `audit-style.ts` and `audit-events.ts`
2. Add a Tailwind class string to `TONE_STYLES` in `audit-style.ts`
3. Add an icon to `TONE_ICONS` in `audit-style.ts` (use `React.createElement` — it's a `.ts` not `.tsx` file)
4. Mirror the style and icon in `PortalAuditEventTableRow.tsx` in `rooiam-app`
5. Add the matching rule in `actionTone()` in `audit-style.ts` and `actionStatusTone()` in `audit-events.ts`
6. Update this document

---

## Filter Dropdown Categories

All audit log pages include a filter dropdown that maps to the `action` query parameter. The backend uses `LIKE '%value%'` matching, so any action namespace prefix works.

### Common filter values used across pages

| Option label | Filter value | Matches |
|---|---|---|
| All events | `all` | (no filter) |
| ✓ Success | `success` | any `*.success` action |
| ✗ Failed / Blocked | `failed` | any `*.failed` or `*.blocked` |
| ⚠ Suspicious | `suspicious` | any `*.suspicious` |
| Auth — sign-in | `auth.login` | `auth.login.*` |
| Auth — sign-out | `auth.logout` | `auth.logout.*` |
| Auth — magic link | `auth.magic_link` | `auth.magic_link.*` |
| MFA | `auth.mfa` | `auth.mfa.*` |
| Passkeys | `auth.passkey` | `auth.passkey.*` |
| OAuth / social login | `oauth.` | `oauth.*` |
| Members | `workspace.member` | workspace member events |
| Invites | `workspace.invite` | workspace invite events |
| Workspace access policy | `workspace.auth_policy` | access policy changes |
| Workspace (all) | `workspace.` | all `workspace.*` events |
| Apps / OAuth clients | `oauth_client` | app registration events |
| API keys | `api_key` | API key create/revoke events |
| Identity / profile | `identity.` | `identity.*` events |
| User account | `user.` | `user.*` events |
| Admin / platform | `admin.` | `admin.*` + `platform.*` events |
