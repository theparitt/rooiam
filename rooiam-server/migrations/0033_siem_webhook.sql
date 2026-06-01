-- SIEM webhook: when set, audit events are POSTed to this URL in a fire-and-forget task.
-- Leave as empty string to disable.
INSERT INTO system_settings (key, value, updated_at)
VALUES ('siem_webhook_url', '', NOW())
ON CONFLICT (key) DO NOTHING;

-- Optional shared secret sent as X-Rooiam-Signature header (HMAC-SHA256 of payload).
INSERT INTO system_settings (key, value, updated_at)
VALUES ('siem_webhook_secret', '', NOW())
ON CONFLICT (key) DO NOTHING;
