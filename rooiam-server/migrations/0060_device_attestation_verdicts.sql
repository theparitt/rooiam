ALTER TABLE user_trusted_devices
    ADD COLUMN IF NOT EXISTS attestation_status_reason TEXT;
