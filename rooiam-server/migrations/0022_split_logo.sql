ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS icon_url TEXT NULL,
    ADD COLUMN IF NOT EXISTS login_logo_url TEXT NULL;

-- Copy existing logo_url into both new fields
UPDATE organizations SET icon_url = logo_url, login_logo_url = logo_url WHERE logo_url IS NOT NULL;
