ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS logo_container VARCHAR(16) NOT NULL DEFAULT 'square';
