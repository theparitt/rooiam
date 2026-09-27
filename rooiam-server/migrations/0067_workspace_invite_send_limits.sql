-- Shared across server replicas and API keys so one workspace cannot turn
-- invitations into an unbounded email sender.
CREATE TABLE organization_invite_daily_limits (
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    day date NOT NULL,
    sends integer NOT NULL,
    PRIMARY KEY (organization_id, day)
);

CREATE TABLE organization_invite_recipient_cooldowns (
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email citext NOT NULL,
    next_allowed_at timestamptz NOT NULL,
    PRIMARY KEY (organization_id, email)
);
