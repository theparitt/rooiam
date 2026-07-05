ALTER TABLE user_trusted_devices
    ADD COLUMN IF NOT EXISTS attestation_format TEXT,
    ADD COLUMN IF NOT EXISTS attestation_key_id TEXT,
    ADD COLUMN IF NOT EXISTS attestation_app_id TEXT,
    ADD COLUMN IF NOT EXISTS attestation_environment TEXT,
    ADD COLUMN IF NOT EXISTS attestation_statement TEXT,
    ADD COLUMN IF NOT EXISTS attestation_status TEXT NOT NULL DEFAULT 'missing',
    ADD COLUMN IF NOT EXISTS attestation_received_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS attestation_verified_at TIMESTAMPTZ;
