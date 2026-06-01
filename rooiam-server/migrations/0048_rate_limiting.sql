-- Add platform-wide magic link rate limits
INSERT INTO system_settings (key, value)
VALUES
    ('magic_link_rate_limit', '5'),
    ('magic_link_rate_window_seconds', '3600')
ON CONFLICT (key) DO NOTHING;

-- Add organization-level overrides
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS magic_link_rate_limit_override INTEGER;

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS magic_link_rate_window_override INTEGER;