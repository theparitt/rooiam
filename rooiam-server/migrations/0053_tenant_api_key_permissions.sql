ALTER TABLE tenant_api_keys
ADD COLUMN IF NOT EXISTS permission_preset text NOT NULL DEFAULT 'owner_full';

ALTER TABLE tenant_api_keys
ADD COLUMN IF NOT EXISTS allowed_permissions text[] NOT NULL DEFAULT ARRAY[
  'workspace.read',
  'branding.read',
  'branding.write',
  'auth_config.read',
  'auth_config.write',
  'clients.read',
  'clients.create',
  'clients.update',
  'clients.status',
  'clients.rotate_secret',
  'clients.delete',
  'members.read',
  'members.role_update',
  'members.remove',
  'invites.read',
  'invites.create',
  'invites.delete',
  'activity.read',
  'effective_policy.read'
];
