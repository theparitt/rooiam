-- Keep terminal invitation outcomes for workspace integrations. Existing used
-- invitations are accepted; an expired pending invitation is reported as
-- expired even before a later resend updates its stored status.
ALTER TABLE organization_invites
    ADD COLUMN status text NOT NULL DEFAULT 'pending',
    ADD COLUMN responded_at timestamptz,
    ADD COLUMN accepted_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE organization_invites
    ADD CONSTRAINT organization_invites_status_check
    CHECK (status IN ('pending', 'accepted', 'declined', 'revoked', 'expired'));

UPDATE organization_invites
SET status = 'accepted', responded_at = used_at
WHERE used_at IS NOT NULL;

ALTER TABLE organization_invites
    DROP CONSTRAINT organization_invites_organization_id_email_key;

CREATE UNIQUE INDEX organization_invites_one_pending_email_idx
    ON organization_invites (organization_id, email)
    WHERE status = 'pending';

CREATE INDEX organization_invites_history_idx
    ON organization_invites (organization_id, created_at DESC);
