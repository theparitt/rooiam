ALTER TABLE user_passkeys
    ADD COLUMN IF NOT EXISTS credential jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE webauthn_challenges
    ADD COLUMN IF NOT EXISTS state jsonb NOT NULL DEFAULT '{}'::jsonb;
