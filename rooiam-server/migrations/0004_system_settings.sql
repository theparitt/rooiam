-- System settings table for storing runtime configuration
CREATE TABLE IF NOT EXISTS system_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Track whether initial setup has been completed
INSERT INTO system_settings (key, value) VALUES ('setup_completed', 'false')
ON CONFLICT (key) DO NOTHING;
