ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS login_surface TEXT;

ALTER TABLE magic_links
    ADD COLUMN IF NOT EXISTS surface TEXT;

INSERT INTO system_settings (key, value)
VALUES
    ('tenant_session_duration_days', '7'),
    ('tenant_magic_link_expiry_minutes', '15'),
    ('tenant_idle_timeout_minutes', '0')
ON CONFLICT (key) DO NOTHING;
