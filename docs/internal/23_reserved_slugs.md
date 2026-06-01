# Reserved Workspace Slugs

Workspace slugs become the first path segment of every portal URL:

```
https://auth.example.com/{slug}/overview
https://auth.example.com/{slug}/audit-logs
```

If a slug collides with a path segment that the rooiam-app router or the Rooiam
server already owns, the SPA will route to the wrong page and the workspace will
be unreachable.  The slug is therefore validated against a blocklist in **two
places** that must stay in sync.

---

## Where the check lives

| Location | File | Symbol |
|---|---|---|
| **Server (authoritative)** | `rooiam-server/src/modules/organization/service.rs` | `RESERVED_SLUGS` constant inside `create_tenant()` |
| **Browser (fast feedback)** | `rooiam-app/src/pages/PortalHome.tsx` + `rooiam-app/src/lib/portal-sections.ts` | `RESERVED_WORKSPACE_SLUGS` constant used by `createWorkspace()` |

The server check is the authoritative gate.  The browser check only exists to
show an error immediately without a round-trip.  Both lists must always contain
the same values.

---

## Current reserved slugs

### rooiam-app SPA routing keywords

These are valid values for the `:context` path parameter in App.tsx.  A workspace
slug that matches one of these would shadow the route for every user.

| Slug | Route it owns | Why it is reserved |
|---|---|---|
| `tenant` | `/tenant/:section` | Tenant-scoped views: workspaces list, tenant audit logs, tenant access policy |
| `me` | `/me/:section` | User-scoped views: profile, my-access (sessions & active orgs) |
| `app` | `/app` | Legacy redirect kept so old bookmarks and OIDC redirect_uris still work |

### rooiam-app auth-flow routes

These are top-level pages that exist outside the `:context` catch-all.

| Slug | Route it owns | Why it is reserved |
|---|---|---|
| `verify` | `/verify` | Magic-link token verification page.  Reached by clicking an email link. |
| `success` | `/success` | Post-authentication success / OIDC redirect landing page |
| `oauth` | `/oauth/callback` | OAuth2 authorization-code callback receiver (Google, Microsoft) |

### Server-side path prefixes

These are not SPA routes but could collide if the SPA and the API server are
served from the same origin (common in single-domain deployments).

| Slug | Path | Why it is reserved |
|---|---|---|
| `api` | `/api/*` | Reserved for a future `/api/` gateway prefix; currently no route but keeping it prevents future confusion |
| `admin` | `/admin/*` | Reserved to avoid any future `/admin/` path colliding with a workspace portal |
| `health` | `/health` | Server health-check endpoint used by load balancers and uptime monitors |

---

## How to update the list

### Adding a new reserved slug

1. Add the slug to `RESERVED_SLUGS` in `service.rs`.
2. Add the same slug (same string, same order) to `RESERVED_WORKSPACE_SLUGS` in `PortalHome.tsx` support code under `src/lib/portal-sections.ts`.
3. Add a row to the table above with the route it owns and the reason.
4. If the slug was previously a valid workspace slug for any existing tenant, write
   a migration note — existing workspaces are **not** retroactively affected, only
   new creation is blocked.

### Removing a reserved slug

Only remove a slug if the route it protected has been deleted **permanently**.
Even then, consider keeping it reserved: old OIDC redirect_uris and bookmarks
may still reference the old path, and a workspace being created with that slug
would silently break those links for its members.

---

## Why two places instead of one?

The server is the correct enforcement point.  The browser check is purely UX —
it lets the form show an inline error without a network round-trip.  Keeping them
in sync manually is cheap; introducing a shared JSON file or build-time code
generation would add complexity for minimal gain.

If the two lists ever diverge, the server wins.  A user who bypasses the browser
check will get a `400 Validation` error from the API with the same message.
