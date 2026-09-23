-- Explicit opt-in for each workspace; the platform switch is still required.
ALTER TABLE organizations ADD COLUMN allow_device_login BOOLEAN NOT NULL DEFAULT FALSE;
