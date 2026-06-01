-- ============================================================
--  Platform roles: is_platform_owner + is_superuser
-- ============================================================
--
--  is_platform_owner  — exactly ONE user globally (the person who set up Rooiam)
--  is_superuser       — platform admins (many, up to max_platform_admins limit)
--
--  The platform owner is also a superuser (both flags = true).
--  Regular platform admins have is_superuser = true, is_platform_owner = false.
--
--  Workspace-level ownership/admin is handled by member_roles (already exists).

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_platform_owner boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_superuser      boolean NOT NULL DEFAULT false;

-- Enforce at most one platform owner at the DB level.
CREATE UNIQUE INDEX IF NOT EXISTS users_one_platform_owner
    ON users (is_platform_owner)
    WHERE is_platform_owner = true;

-- ── Migrate existing superuser_email setting → is_platform_owner + is_superuser ──
--
-- If someone already completed setup, their email is in system_settings.
-- Find that user and promote them. Safe to run even if the setting doesn't exist.

UPDATE users
SET
    is_platform_owner = true,
    is_superuser      = true
WHERE id IN (
    SELECT u.id
    FROM users u
    JOIN user_emails e ON e.user_id = u.id AND e.is_primary = true
    WHERE e.email = (
        SELECT value FROM system_settings WHERE key = 'superuser_email'
    )
    LIMIT 1
);

-- ── Platform governance limits ────────────────────────────────────────────────

INSERT INTO system_settings (key, value) VALUES
    ('max_platform_admins',  '10'),
    ('max_workspace_admins', '10')
ON CONFLICT (key) DO NOTHING;
