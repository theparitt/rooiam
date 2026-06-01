ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS card_border_width VARCHAR(8) NOT NULL DEFAULT '1px',
    ADD COLUMN IF NOT EXISTS card_border_color VARCHAR(32) NULL;
