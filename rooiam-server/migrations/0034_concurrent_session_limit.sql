-- Per-workspace concurrent session limit.
-- NULL means unlimited (default).
-- When a new session is created and this limit is exceeded,
-- the oldest active session for that user in the workspace is revoked.
ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS max_concurrent_sessions INTEGER;
