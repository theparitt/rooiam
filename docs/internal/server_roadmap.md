# Rooiam V1 Fullstack - Detailed Roadmap

This roadmap outlines the complete architecture and step-by-step feature development for the core server, the control plane admin console, and the hosted user gateway.

---

## 🛠️ PART 1: `rooiam-server` (Rust Modular Monolith)

### 📌 Phase 1: Project Setup & Core Infrastructure (✅ Complete)
- [x] **1. Initialize Project & Structure**
  - [x] Create project with `cargo init`.
  - [x] Set up strict modular directories: `bootstrap`, `http`, `modules`, `infra`, `shared`.
  - [x] Add dependencies to `Cargo.toml` (`actix-web`, `sqlx`, `tokio`, `redis`, `jsonwebtoken`, `argon2`, etc.).
- [x] **2. Environment Configuration (`src/bootstrap/config.rs`)**
  - [x] Implement `AppConfig` parsing structured env vars (`ROOIAM_` prefixed) for DB, Redis, and Server configurations.
  - [x] Create `.env` template using structured `ROOIAM_` environment variables.
- [x] **3. App State & Global Services (`src/bootstrap/state.rs`)**
  - [x] Establish `AppState` encapsulating the Postgres `PgPool` and `RedisClient`.
  - [x] Ensure automated migration execution during app boot logic.
- [x] **4. Error Handling Pipeline (`src/shared/error.rs`)**
  - [x] Define a unified `AppError` wrapping SQLx and Redis errors transparently.
  - [x] Implement Actix `ResponseError` mapping to standardized, secure HTTP JSON error payloads (hiding DB stack traces).
- [x] **5. Central Router (`src/bootstrap/router.rs`)**
  - [x] Boot `actix_web::HttpServer` injecting state securely.
  - [x] Route `/v1` api scopes and basic `/health` checks.

### 🗄️ Phase 2: Database Schema & Migrations (v1) (✅ Partially Complete)
- [x] **1. Core Identity & Auth Tables**
  - [x] `users`, `user_emails`, `external_identities` (Google/Microsoft linking rules).
  - [x] `magic_links` logic tables.
  - [x] `sessions` table (safely persisting hashed opaque secrets).
- [x] **2. Multi-tenant & RBAC Tables**
  - [x] `organizations`, `organization_members`.
  - [x] `roles`, `permissions`, `role_permissions`, `member_roles`.
- [x] **3. OAuth / OIDC Provider Tables**
  - [x] `oauth_clients`, `oauth_client_redirect_uris`.
  - [x] `oauth_authorization_codes`, `oauth_refresh_tokens`.
- [x] **4. Platform Tables**
  - [x] `audit_logs` (for robust append-only tracking of security events).
- [ ] **5. Run & Test Migrations**
  - [ ] Connect to the configured `ROOIAM_DATABASE_URL` and strictly build the DB.
  - [ ] Generate the `.sqlx` cache for compile-time query checking via `cargo sqlx prepare`.

### 🔒 Phase 3: Core Authentication Flow (Magic Link & Opaque Sessions)
- [ ] **1. Magic Link Email Flow (`src/modules/auth`)**
  - [ ] Build `AuthService::start_magic_link`.
    - Generate cryptographically secure tokens.
    - Rate limit dispatching requests via short-lived Redis keys.
    - Hash token before DB storage into the `magic_links` table.
    - Dispatch email containing link (Mock standard-output testing first, SES/Resend later).
- [x] **2. Magic Link Verification & Login (`src/modules/auth`)**
  - [x] Build `AuthService::verify_magic_link`.
    - Hash incoming token from user's URL and strictly enforce expiry/usage rules.
    - Find or provisionally register user seamlessly.
    - Mark link as used, insert `audit_logs` log the authentication event securely.
- [x] **3. Session Management & Middlewares (`src/modules/session`)**
  - [x] Implement `SessionService::create_session`.
  - [x] Generate opaque session string (`rooiam_sid`), store matching hash permanently in Postgres.
  - [x] Define HTTP middleware `RequireSession` in `src/http/middleware/` to intercept client requests, read cookies, and cross-reference with DB hashes/Redis caches.
  - [x] Set strict `HttpOnly`, `Secure`, `SameSite=Lax` browser HTTP response headers.

### 👥 Phase 4: Social Login & Identity Portal
- [x] **1. Google Auth Flow (`src/modules/oauth`)**
  - [x] `GET /v1/oauth/login?provider=google` - Generate state/nonce, build secure OAuth redirect URL for the client.
  - [x] `GET /v1/oauth/google/callback` - Receive authorization code, fetch user profile payload.
- [x] **2. Microsoft Auth Flow (`src/modules/oauth`)**
  - [x] `GET /v1/oauth/login?provider=microsoft`
  - [x] `GET /v1/oauth/microsoft/callback`
- [x] **3. Account Linking logic**
  - [x] Systematically match existing emails safely (verified checks), register inside `external_identities`.
  - [x] Generate the opaque session cookie natively passing control back to the portal app context.
- [x] **4. User Identity API (`src/modules/identity`)**
  - [x] `GET /v1/identity/me` - Resolve user ID from session context, inject struct profile information.
  - [x] `PATCH /v1/identity/me/profile` - Modify standard user details seamlessly.
  - [x] `GET /v1/identity/me/sessions` - List active cross-device sessions associated with user account.
  - [x] `DELETE /v1/identity/me/sessions/{id}` - Action to explicitly revoke stray session secrets remotely.

### 🏢 Phase 5: Organizations & RBAC
- [x] **1. Organization Core (`src/modules/organization`)**
  - [x] `POST /orgs` - Tenant generation (Instantiating user designated formally as `owner` of contextual space).
  - [x] `GET /orgs` - Retrieve organizational workspaces assigned to current identity scope.
  - [x] `POST /orgs/switch` - Fluidly switch active `current_org_id` context bound cleanly entirely within the current session's runtime DB footprint.
- [x] **2. Team Memberships**
  - [x] `POST /orgs/{org_id}/invites` - Distribute time-sensitive invitations bound uniquely via email hashes.
  - [x] `GET /orgs/{org_id}/members` - Expose contextual roster lookups.
- [x] **3. Abstract Authorizations (`src/modules/rbac`)**
  - [x] Role to Permission matrix evaluations.
  - [x] Guard against cross-tenant data requests natively filtering SQL scopes by injected `org_id` contexts tightly.

### ⚙️ Phase 6: OIDC Provider & Admin API Console
- [~] **1. OAuth Client Registry (`src/modules/clients`)**
  - [x] `GET /v1/clients` - List the active user's OAuth clients.
  - [x] `POST /v1/clients` - Create client apps with generated client IDs and optional client secrets for web apps.
  - [ ] Secret rotation and broader client administration remain to be implemented.
- [~] **2. OIDC APIs**
  - [x] Authorization endpoint: `GET /v1/oidc/authorize`
  - [x] Token exchange endpoint: `POST /v1/oidc/token`
  - [x] Redirect URI validation and PKCE-aware code exchange logic exist in the current service.
  - [ ] Discovery endpoint: `GET /.well-known/openid-configuration`
  - [ ] JWKS public key store: `GET /.well-known/jwks.json`
  - [ ] Consent UI for third-party clients
  - [ ] Identity claims endpoint: `GET /oauth/userinfo`
- [~] **3. Internal Admin Operations (`src/modules/admin`)**
  - [x] Expose system-wide `audit_logs` streams.
  - [x] Expose system-wide user and organization listings for superusers.
  - [ ] Force account lockouts (`POST /admin/users/{user_id}/disable`, or revoking all sessions immediately).

---

## 💻 PART 2: `rooiam-admin` (Control Plane & Dev Console)

### 🎨 Phase 1: Foundation & Styling
- [ ] Set up Tailwind CSS, React-Router, and a state manager (Zustand). 
- [ ] Add the graphic SVGs from `\art` to dictate the dark-mode developer UI styling.
- [ ] Establish centralized HTTP fetch interceptors calling the Rust back-end.

### 📊 Phase 2: Platform Analytics & Dashboard
- [ ] Build key stat panels: Daily active users, authentication success rates, active session counts.
- [ ] Organization growth and multi-tenant performance tracking.

### 👥 Phase 3: User & Helpdesk Management
- [ ] Provide visually searchable, paginated tables of all authenticated Users.
- [ ] Add actions to inspect detailed user profiles.
- [ ] Implement forceful remote session revocation and user suspension controls.

### 🔑 Phase 4: Client Application Settings (OAuth)
- [ ] Build forms for developers to register new "Applications/Clients".
- [ ] Securely generate, read, and reset OAuth `Client Id` and `Client Secret` pairs.
- [ ] Configure authorized redirect URIs.

### 📜 Phase 5: Compliance Visibility
- [ ] Render out deeply segmented `audit_logs` so developers can trace IP, event triggers, and permission escalations dynamically.

---

## 📱 PART 3: `rooiam-app` (Hosted Auth Gateway)

### 🚪 Phase 1: The Login Portal
- [ ] Implement a highly polished Hosted UI gateway. (e.g., "Enter your email" -> "Check your email for the magic link.")
- [ ] Implement the Magic Link validation listener `GET /verify?token=xyz` mapping browser flow back to primary 3rd party apps seamlessly.
- [ ] Establish social SSO buttons (Google, Microsoft) securely forwarding state parameters.

### ⚙️ Phase 2: The End-User Settings Portal
- [ ] Create a "My Account" page where users control their digital identity autonomously.
- [ ] UI to list Active Sessions with simple "Revoke Device" buttons.
- [ ] UI to implicitly link/unlink social accounts.

### 🏢 Phase 3: Organization / B2B Sandbox
- [ ] A functional reference screen demonstrating Organization management.
- [ ] Sending out team invites, modifying RBAC permissions safely from a clean client perimeter, proving the headless API capabilities.
