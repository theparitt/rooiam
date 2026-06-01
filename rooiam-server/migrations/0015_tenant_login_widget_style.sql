ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS login_title TEXT,
    ADD COLUMN IF NOT EXISTS login_subtitle TEXT,
    ADD COLUMN IF NOT EXISTS widget_radius TEXT NOT NULL DEFAULT 'rounded',
    ADD COLUMN IF NOT EXISTS widget_shadow TEXT NOT NULL DEFAULT 'soft',
    ADD COLUMN IF NOT EXISTS login_method_order TEXT[] NOT NULL DEFAULT ARRAY['magic_link', 'passkey', 'google', 'microsoft'];
