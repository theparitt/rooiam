-- Platform-level IP policy dedicated to superuser/platform-admin access.
-- Previously, superusers were subject to tenant IP policy (based on current_org_id),
-- which is wrong — platform admins should be governed by platform rules, not tenant rules.
--
-- New system_settings keys:
--   platform_admin_ip_allowlist  — allowlist checked for is_superuser users only
--   platform_admin_ip_blocklist  — blocklist checked for is_superuser users only
--
-- The existing default_ip_allowlist / default_ip_blocklist continue to govern tenant users.

INSERT INTO system_settings (key, value, updated_at)
VALUES
    ('platform_admin_ip_allowlist', '', NOW()),
    ('platform_admin_ip_blocklist', '', NOW())
ON CONFLICT (key) DO NOTHING;
