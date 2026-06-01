CREATE TABLE IF NOT EXISTS account_deletion_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_deletion_tokens_user_id ON account_deletion_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_account_deletion_tokens_token_hash ON account_deletion_tokens (token_hash);
