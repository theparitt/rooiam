-- Email change verification tokens.
-- When a user requests an email change, a token is stored here and emailed to the new address.
-- The change is only committed once the token is verified.

CREATE TABLE email_change_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    old_email text NOT NULL,
    new_email text NOT NULL,
    token_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_change_tokens_user_id ON email_change_tokens(user_id);
CREATE INDEX idx_email_change_tokens_token_hash ON email_change_tokens(token_hash);

-- Policy snapshots — store last 10 auth policy versions per org for one-click restore.
CREATE TABLE org_policy_snapshots (
    id bigserial PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    snapshot jsonb NOT NULL,
    created_by uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_org_policy_snapshots_org ON org_policy_snapshots(organization_id, created_at DESC);

-- Owner transfer requests — explicit handoff with confirmation.
CREATE TABLE owner_transfer_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    from_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    accepted_at timestamptz,
    cancelled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_owner_transfer_org ON owner_transfer_requests(organization_id);
