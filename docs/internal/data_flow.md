# Rooiam Data Flow & Security Models

This document illustrates the critical paths of data during sensitive authentication workflows.

## 1. Magic Link Authentication Flow
The goal is to provide a frictionless login experience while preventing token scraping or replay attacks.

1. **Client Request**: User submits email to `POST /v1/auth/magic-link/start`.
2. **Token Generation**: Secure `OsRng` generates a 64-character randomized string (The Secret).
3. **Hashing**: The Secret is hashed via SHA-256. Only the *Hash* is stored in the `magic_links` Postgres table.
4. **Dispatch**: The raw Secret is emailed to the user as a clickable link to the frontend verify page.
5. **Redemption**: 
   - The frontend verify page sends `POST /v1/auth/magic-link/verify` with `{ "token": "TheSecret" }`.
   - `rooiam-server` re-hashes `TheSecret` and matches it against Postgres.
   - Once verified, the row is marked `used` immediately (single-use constraint).
6. **Session Instantiation**: A Session is created, and the user receives a secure HTTP cookie.
7. **Redirect**: The API returns the original `redirect_uri` (if provided) so the frontend can send the user back to the target app.

## 2. Opaque Session Lifecycle
Unlike stateless JWTs which are susceptible to XSS if stored in `localStorage`, Rooiam uses secure, stateful Opaque Sessions.

1. **Instantiation**: Upon login, Rooiam creates a session ID plus a random secret and formats them as `rooiam_sid=<session_uuid>.<raw_secret>`.
2. **Storage**: The plain `rooiam_sid` is sent to the client as an `HttpOnly`, `Secure`, `SameSite=Lax` cookie. 
3. **Database**: A hash of the `rooiam_sid` is saved in the `sessions` PostgreSQL table along with device metadata and an expiry date.
4. **Verification Middleware**: On every protected API request:
   - Actix middleware extracts the cookie.
   - Hashes the secret portion and checks the backing Postgres session row.
   - If valid, injects `ActiveSession` state into the request context.
5. **Revocation**: If a user clicks "Log out all devices", the DB simply deletes/invalidates the session hashes. The client cookies instantly become useless.

## 3. Organizational Switching (B2B RBAC)
When a user accesses tenant-specific data:
1. They invoke `POST /v1/orgs/switch` with a target `org_id`.
2. The server verifies membership in `organization_members`.
3. The server updates the current session row in Postgres to point the `current_org_id` context to the target.
4. Subsequent requests automatically filter SQL scopes strictly to that `org_id`.
