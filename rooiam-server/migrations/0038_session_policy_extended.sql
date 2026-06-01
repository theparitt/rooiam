-- Extend session policy with OIDC token lifetimes and idle timeout.
-- Platform-wide defaults in system_settings; per-org overrides on organizations table.

-- Platform defaults
INSERT INTO system_settings (key, value) VALUES
    ('oidc_access_token_ttl_minutes', '60'),
    ('refresh_token_ttl_days',        '30'),
    ('idle_timeout_minutes',          '0')
ON CONFLICT (key) DO NOTHING;

-- Per-org overrides (NULL = inherit platform default)
ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS magic_link_expiry_minutes  INTEGER,
    ADD COLUMN IF NOT EXISTS oidc_access_token_ttl_minutes INTEGER,
    ADD COLUMN IF NOT EXISTS refresh_token_ttl_days     INTEGER,
    ADD COLUMN IF NOT EXISTS idle_timeout_minutes       INTEGER;
