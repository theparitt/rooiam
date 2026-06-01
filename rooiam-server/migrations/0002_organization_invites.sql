-- organization_invites
CREATE TABLE IF NOT EXISTS organization_invites
(
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id uuid NOT NULL REFERENCES organizations ( id ) ON DELETE CASCADE,
    email citext NOT NULL,
    token_hash text NOT NULL UNIQUE,
    inviter_user_id uuid NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE ( organization_id, email )
);
