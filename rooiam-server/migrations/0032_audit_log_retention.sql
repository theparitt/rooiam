-- Configurable audit log retention policy.
-- audit_log_retention_days: NULL means keep forever (default).
-- The background pruning task reads this setting on startup and runs daily.
INSERT INTO system_settings (key, value, updated_at)
VALUES ('audit_log_retention_days', 'null', NOW())
ON CONFLICT (key) DO NOTHING;
