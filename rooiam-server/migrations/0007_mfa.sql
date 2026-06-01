CREATE TABLE IF NOT EXISTS user_mfa_methods
(
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
    method_type text NOT NULL,
    secret_encrypted text NOT NULL,
    is_primary boolean NOT NULL DEFAULT true,
    verified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE ( user_id, method_type )
);

CREATE INDEX IF NOT EXISTS idx_user_mfa_methods_user_id
    ON user_mfa_methods (user_id);

CREATE TABLE IF NOT EXISTS mfa_challenges
(
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
    session_id uuid REFERENCES sessions ( id ) ON DELETE CASCADE,
    method_type text NOT NULL,
    purpose text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mfa_challenges_user_id
    ON mfa_challenges (user_id);

CREATE INDEX IF NOT EXISTS idx_mfa_challenges_purpose_expires_at
    ON mfa_challenges (purpose, expires_at);
