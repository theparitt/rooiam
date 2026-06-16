CREATE TABLE IF NOT EXISTS user_trusted_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_label TEXT NOT NULL,
    platform TEXT NOT NULL,
    device_token_hash TEXT NOT NULL UNIQUE,
    device_public_key TEXT,
    push_token TEXT,
    last_seen_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS user_trusted_devices_user_id_idx
    ON user_trusted_devices(user_id);

CREATE INDEX IF NOT EXISTS user_trusted_devices_active_user_id_idx
    ON user_trusted_devices(user_id)
    WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS device_login_intents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    public_id UUID NOT NULL UNIQUE,
    browser_binding_hash TEXT NOT NULL,
    nonce_hash TEXT NOT NULL,
    workspace_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    oauth_client_id UUID REFERENCES oauth_clients(id) ON DELETE SET NULL,
    redirect_uri TEXT,
    surface TEXT,
    display_code TEXT NOT NULL,
    match_number SMALLINT NOT NULL,
    decoy_numbers SMALLINT[] NOT NULL DEFAULT '{}',
    approved_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_device_id UUID REFERENCES user_trusted_devices(id) ON DELETE SET NULL,
    status TEXT NOT NULL,
    status_reason TEXT,
    requester_ip TEXT,
    requester_user_agent TEXT,
    approved_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS device_login_intents_public_id_idx
    ON device_login_intents(public_id);

CREATE INDEX IF NOT EXISTS device_login_intents_workspace_id_idx
    ON device_login_intents(workspace_id);

CREATE INDEX IF NOT EXISTS device_login_intents_expires_at_idx
    ON device_login_intents(expires_at);
