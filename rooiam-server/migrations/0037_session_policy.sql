-- Configurable session and magic link durations.
-- Defaults match the previously hardcoded values.
INSERT INTO system_settings (key, value) VALUES
    ('session_duration_days',      '7'),
    ('magic_link_expiry_minutes',  '15')
ON CONFLICT (key) DO NOTHING;
