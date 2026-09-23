-- One installation key must not be enrolled under multiple identities.
-- Existing duplicate keys must be explicitly resolved by the operator before upgrade.
CREATE UNIQUE INDEX user_trusted_devices_public_key_unique
    ON user_trusted_devices(device_public_key) WHERE device_public_key IS NOT NULL;
