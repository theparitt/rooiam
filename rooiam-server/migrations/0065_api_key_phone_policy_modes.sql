-- 0.7: keep the existing all-keys boolean for older clients while allowing
-- owners to require phone confirmation only for full-access owner keys.
ALTER TABLE workspace_api_key_phone_policies
    ADD COLUMN mode TEXT NOT NULL DEFAULT 'off';

UPDATE workspace_api_key_phone_policies
SET mode = CASE WHEN required THEN 'all_keys' ELSE 'off' END;

ALTER TABLE workspace_api_key_phone_policies
    ADD CONSTRAINT workspace_api_key_phone_policy_mode_check
    CHECK (mode IN ('off', 'owner_keys', 'all_keys'));
