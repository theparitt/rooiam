-- Add org_id to oauth_clients so clients can be scoped to a tenant organization
ALTER TABLE oauth_clients
    ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Tenant-level auth provider configuration (optional overrides for operator defaults)
-- Secrets are encrypted at rest using AES-256-GCM-SIV (same as TOTP secrets)
CREATE TABLE IF NOT EXISTS tenant_auth_config (
    org_id                  UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,

    -- Google OAuth override (optional)
    google_client_id        TEXT,
    google_client_secret    TEXT,   -- encrypted at rest

    -- Microsoft OAuth override (optional)
    microsoft_client_id     TEXT,
    microsoft_client_secret TEXT,   -- encrypted at rest
    microsoft_tenant_id     TEXT,

    -- SMTP override (optional)
    smtp_host               TEXT,
    smtp_port               INTEGER,
    smtp_user               TEXT,
    smtp_password           TEXT,   -- encrypted at rest
    smtp_from               TEXT,
    smtp_security           TEXT,   -- 'starttls' | 'tls' | 'none'

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
