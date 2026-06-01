ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS icon_container VARCHAR(16) NOT NULL DEFAULT 'square',
    ADD COLUMN IF NOT EXISTS login_logo_container VARCHAR(16) NOT NULL DEFAULT 'square',
    ADD COLUMN IF NOT EXISTS login_logo_size VARCHAR(16) NOT NULL DEFAULT 'medium';

-- Copy existing logo_container into both new shape fields
UPDATE organizations SET icon_container = logo_container, login_logo_container = logo_container;
