CREATE TABLE IF NOT EXISTS security_alert_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scope_type TEXT NOT NULL CHECK (scope_type IN ('platform', 'organization')),
    scope_id UUID NULL REFERENCES organizations(id) ON DELETE CASCADE,
    alert_key TEXT NOT NULL,
    reviewed_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (scope_type, scope_id, alert_key)
);

CREATE INDEX IF NOT EXISTS idx_security_alert_reviews_scope
    ON security_alert_reviews (scope_type, scope_id, reviewed_at DESC);
