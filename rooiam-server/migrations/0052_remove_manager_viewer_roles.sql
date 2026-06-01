-- Remove manager and viewer roles — only owner, admin, member are valid workspace roles.
DELETE FROM role_permissions WHERE role_id IN (
    SELECT id FROM roles WHERE code IN ('manager', 'viewer')
);

-- Re-assign any members who had manager → admin, viewer → member
UPDATE member_roles
SET role_id = (SELECT id FROM roles WHERE code = 'admin')
WHERE role_id = (SELECT id FROM roles WHERE code = 'manager');

UPDATE member_roles
SET role_id = (SELECT id FROM roles WHERE code = 'member')
WHERE role_id = (SELECT id FROM roles WHERE code = 'viewer');

DELETE FROM roles WHERE code IN ('manager', 'viewer');
