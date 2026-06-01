-- Tenant API keys scoped to an organization.
-- Keys are used for server-to-server calls on behalf of a workspace.
-- The raw key value is shown once at creation; only the SHA-256 hash is stored.

CREATE TABLE tenant_api_keys (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Human-readable label (e.g. "CI pipeline", "Backend service")
    label       TEXT NOT NULL,

    -- SHA-256 hex hash of the raw key (never stored in plaintext)
    key_hash    TEXT NOT NULL UNIQUE,

    -- First 8 chars of the raw key, for display/identification only
    key_prefix  TEXT NOT NULL,

    -- Optional expiry (NULL = never expires)
    expires_at  TIMESTAMPTZ,

    -- Revoked flag: revoked keys are immediately rejected
    revoked     BOOLEAN NOT NULL DEFAULT FALSE,

    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

CREATE INDEX idx_tenant_api_keys_org_id ON tenant_api_keys(org_id);
CREATE INDEX idx_tenant_api_keys_key_hash ON tenant_api_keys(key_hash);
