CREATE TABLE IF NOT EXISTS user_mfa_backup_codes
(
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
    code_hash text NOT NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_mfa_backup_codes_user_id
    ON user_mfa_backup_codes (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_mfa_backup_codes_hash
    ON user_mfa_backup_codes (user_id, code_hash);
