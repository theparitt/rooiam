UPDATE tenant_api_keys
SET permission_preset = 'workspace_owner'
WHERE permission_preset = 'owner_full';

ALTER TABLE tenant_api_keys
ALTER COLUMN permission_preset SET DEFAULT 'workspace_owner';
