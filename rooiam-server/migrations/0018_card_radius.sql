ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS card_radius VARCHAR(16) NOT NULL DEFAULT 'rounded';
