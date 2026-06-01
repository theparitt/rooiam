-- OIDC signing key rotation support.
-- Stores RSA key pairs in the DB. The active key is used to sign new tokens.
-- Old keys remain in the table during the rollover window so existing tokens remain valid.

CREATE TABLE oidc_signing_keys (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kid text NOT NULL UNIQUE,
    private_key_pem text NOT NULL,
    public_key_pem text NOT NULL,
    is_active boolean NOT NULL DEFAULT false,
    retired_at timestamptz,  -- set when rotated away; old key removed after rollover_hours
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_oidc_signing_keys_active ON oidc_signing_keys(is_active) WHERE is_active = true;
CREATE INDEX idx_oidc_signing_keys_retired ON oidc_signing_keys(retired_at) WHERE retired_at IS NOT NULL;

-- System setting: how many hours to keep an old key in JWKS after rotation (default 24h)
INSERT INTO system_settings (key, value) VALUES ('signing_key_rollover_hours', '24') ON CONFLICT DO NOTHING;
