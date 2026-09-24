-- 0.3: opt-in phone confirmation for one Rooiam-owned action.
-- The policy is independent of the phone login method.
CREATE TABLE workspace_api_key_phone_policies (
    org_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    required BOOLEAN NOT NULL DEFAULT FALSE,
    version BIGINT NOT NULL DEFAULT 1,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE workspace_action_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    requester_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requester_session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    browser_proof_hash TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action = 'workspace.api_key.create'),
    protocol_version SMALLINT NOT NULL DEFAULT 1 CHECK (protocol_version = 1),
    label TEXT NOT NULL,
    permission_preset TEXT NOT NULL CHECK (permission_preset IN ('workspace_owner', 'workspace_admin')),
    allowed_permissions TEXT[] NOT NULL,
    key_expires_at TIMESTAMPTZ,
    payload_digest TEXT NOT NULL,
    policy_version BIGINT NOT NULL,
    display_code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'cancelled', 'consumed')),
    approved_device_id UUID REFERENCES user_trusted_devices(id) ON DELETE SET NULL,
    decided_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ,
    resulting_key_id UUID REFERENCES tenant_api_keys(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX workspace_action_approvals_requester_idx
    ON workspace_action_approvals (requester_session_id, created_at DESC);
CREATE INDEX workspace_action_approvals_expiry_idx
    ON workspace_action_approvals (expires_at)
    WHERE status IN ('pending', 'approved');
