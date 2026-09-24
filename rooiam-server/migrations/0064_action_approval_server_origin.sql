-- Bind action-v1 signatures to the trusted server origin. Migration 0063 was
-- already applied in the local certification database; never rewrite it.
ALTER TABLE workspace_action_approvals
    ADD COLUMN server_origin TEXT NOT NULL DEFAULT '';

-- Requests created by the earlier draft did not bind an origin. They cannot
-- be approved under the final v1 contract and must not remain executable.
UPDATE workspace_action_approvals
SET status = 'cancelled', decided_at = NOW()
WHERE status IN ('pending', 'approved');
