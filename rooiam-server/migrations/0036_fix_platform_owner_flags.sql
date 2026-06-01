-- Fix platform owner created via setup wizard having is_platform_owner/is_superuser = false.
-- The setup handler previously only stored superuser_email in system_settings but never set
-- the flags on the users row. This backfills anyone who went through setup already.
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
)
AND is_platform_owner = false;
