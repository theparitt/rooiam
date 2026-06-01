ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS require_mfa BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO permissions (code, description) VALUES
    ('branding:manage', 'Can manage workspace branding'),
    ('auth_policy:manage', 'Can manage workspace sign-in policy'),
    ('activity:read', 'Can view workspace activity')
ON CONFLICT (code) DO NOTHING;

INSERT INTO roles (id, code, name, is_system) VALUES
    ('00000000-0000-0000-0000-000000000004', 'manager', 'Manager', true),
    ('00000000-0000-0000-0000-000000000005', 'viewer', 'Viewer', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000001', id
FROM permissions
WHERE code IN ('branding:manage', 'auth_policy:manage', 'activity:read')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000002', id
FROM permissions
WHERE code IN (
    'branding:manage',
    'auth_policy:manage',
    'activity:read',
    'members:read',
    'members:invite',
    'members:remove',
    'roles:manage'
)
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000004', id
FROM permissions
WHERE code IN ('members:read', 'members:invite', 'activity:read')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000005', id
FROM permissions
WHERE code IN ('members:read', 'activity:read')
ON CONFLICT DO NOTHING;
