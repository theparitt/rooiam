ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS button_style VARCHAR(16) NOT NULL DEFAULT 'filled';
