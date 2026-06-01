-- Operator access policy hierarchy.
--
-- Defines what each operator level requires of the level below it when logging in.
--
-- Levels:
--   platform_to_admin   — Platform Owner sets; enforced when platform admins log in to admin console
--   admin_to_tenant     — Platform Admin sets; enforced when tenant owners/admins log in to tenant portal
--   tenant_to_workspace — Tenant Owner sets; enforced when workspace admins log in (Phase 2)
--
-- organization_id: NULL = global platform-scoped policy for this level.
--                  Non-NULL = per-org override (Phase 2 feature).
--
-- Hierarchy rule: child can only tighten, never loosen — enforced in application logic.
-- End-user workspace login is NOT governed by this table; it is tenant-controlled freely.

CREATE TYPE operator_policy_level AS ENUM (
    'platform_to_admin',
    'admin_to_tenant',
    'tenant_to_workspace'
);

CREATE TABLE operator_policies (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level                   operator_policy_level NOT NULL,
    -- NULL = global for this level. Non-NULL = per-org override (Phase 2).
    organization_id         UUID REFERENCES organizations(id) ON DELETE CASCADE,

    -- Auth method gates (true = allowed, false = blocked)
    allow_magic_link        BOOLEAN NOT NULL DEFAULT TRUE,
    allow_google            BOOLEAN NOT NULL DEFAULT TRUE,
    allow_microsoft         BOOLEAN NOT NULL DEFAULT TRUE,
    allow_passkey           BOOLEAN NOT NULL DEFAULT TRUE,

    -- MFA requirement
    require_mfa             BOOLEAN NOT NULL DEFAULT FALSE,

    -- IP policy (empty = unrestricted)
    ip_allowlist            TEXT NOT NULL DEFAULT '',
    ip_blocklist            TEXT NOT NULL DEFAULT '',

    -- Email domain policy (empty = unrestricted)
    allowed_email_domains   TEXT NOT NULL DEFAULT '',
    blocked_email_domains   TEXT NOT NULL DEFAULT '',

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One global row per level
CREATE UNIQUE INDEX operator_policies_global_level_unique
    ON operator_policies (level)
    WHERE organization_id IS NULL;

-- One per-org row per level per org
CREATE UNIQUE INDEX operator_policies_org_level_unique
    ON operator_policies (level, organization_id)
    WHERE organization_id IS NOT NULL;

CREATE INDEX operator_policies_org_id_idx
    ON operator_policies (organization_id)
    WHERE organization_id IS NOT NULL;

-- Seed default rows (maximally permissive — no logins blocked by default)
INSERT INTO operator_policies (level, organization_id)
VALUES
    ('platform_to_admin', NULL),
    ('admin_to_tenant',   NULL)
ON CONFLICT DO NOTHING;
