-- Consolidate Features into 0050 to resolve previous migration blockers.
DO $$
BEGIN
    -- 1. Split Rate Limiting (Admin vs Staff)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'magic_link_rate_limit_override') THEN
        ALTER TABLE organizations RENAME COLUMN magic_link_rate_limit_override TO magic_link_rate_limit_admin_override;
    ELSE
        ALTER TABLE organizations ADD COLUMN IF NOT EXISTS magic_link_rate_limit_admin_override INTEGER;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'magic_link_rate_window_override') THEN
        ALTER TABLE organizations RENAME COLUMN magic_link_rate_window_override TO magic_link_rate_window_admin_override;
    ELSE
        ALTER TABLE organizations ADD COLUMN IF NOT EXISTS magic_link_rate_window_admin_override INTEGER;
    END IF;
    
    ALTER TABLE organizations ADD COLUMN IF NOT EXISTS magic_link_rate_limit_staff_override INTEGER;
    ALTER TABLE organizations ADD COLUMN IF NOT EXISTS magic_link_rate_window_staff_override INTEGER;

    -- 2. Anti-Fraud Tracking
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ua_hash TEXT;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_fraud_tracking ON users (last_login_ip, last_login_ua_hash);
