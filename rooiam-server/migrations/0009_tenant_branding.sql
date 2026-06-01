ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS login_display_name text,
    ADD COLUMN IF NOT EXISTS brand_color text;
