-- Seed basic permissions
INSERT INTO permissions (code, description) VALUES
    ('org:update', 'Can update organization settings'),
    ('org:delete', 'Can delete the organization'),
    ('members:read', 'Can view members'),
    ('members:invite', 'Can invite new members'),
    ('members:remove', 'Can remove members'),
    ('roles:manage', 'Can manage custom roles and assign them');

-- Seed System Roles (no organization_id required)
-- We use a fixed UUID or just insert and look up by code for role_permissions
INSERT INTO roles (id, code, name, is_system) VALUES
    ('00000000-0000-0000-0000-000000000001', 'owner', 'Owner', true),
    ('00000000-0000-0000-0000-000000000002', 'admin', 'Admin', true),
    ('00000000-0000-0000-0000-000000000003', 'member', 'Member', true);

-- Assign permissions to Owner (All)
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000001', id FROM permissions;

-- Assign permissions to Admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000002', id FROM permissions WHERE code IN (
    'org:update', 'members:read', 'members:invite', 'members:remove'
);

-- Assign permissions to Member
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000003', id FROM permissions WHERE code IN (
    'members:read'
);
