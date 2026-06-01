CREATE TABLE IF NOT EXISTS user_passkeys
(
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
    credential_id text NOT NULL UNIQUE,
    public_key text NOT NULL,
    sign_count bigint NOT NULL DEFAULT 0,
    transports jsonb NOT NULL DEFAULT '[]'::jsonb,
    aaguid uuid,
    name text NOT NULL,
    last_used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_passkeys_user_id
    ON user_passkeys (user_id);

CREATE TABLE IF NOT EXISTS webauthn_challenges
(
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid REFERENCES users ( id ) ON DELETE CASCADE,
    purpose text NOT NULL,
    challenge_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_user_id
    ON webauthn_challenges (user_id);

CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_purpose_expires_at
    ON webauthn_challenges (purpose, expires_at);
