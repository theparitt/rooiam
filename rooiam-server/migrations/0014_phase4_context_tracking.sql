ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS login_app_name TEXT,
    ADD COLUMN IF NOT EXISTS login_workspace_slug TEXT;
