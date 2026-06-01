ALTER TABLE oauth_clients
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

UPDATE oauth_clients
SET status = 'active'
WHERE status IS NULL;

ALTER TABLE oauth_clients
    DROP CONSTRAINT IF EXISTS oauth_clients_status_check;

ALTER TABLE oauth_clients
    ADD CONSTRAINT oauth_clients_status_check
    CHECK (status IN ('active', 'paused'));
