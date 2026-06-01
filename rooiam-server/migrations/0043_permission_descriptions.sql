-- Add plain-language descriptions to all system permissions.
-- The permissions table already has a `description` column; this migration populates it.

UPDATE permissions SET description = CASE code
    WHEN 'org:update'             THEN 'Update workspace name, branding, and general settings'
    WHEN 'org:delete'             THEN 'Delete this workspace permanently'
    WHEN 'org:transfer_ownership' THEN 'Transfer workspace ownership to another member'
    WHEN 'auth_policy:manage'     THEN 'Manage login methods, MFA requirements, and session policy'
    WHEN 'members:read'           THEN 'View the member list and member details'
    WHEN 'members:invite'         THEN 'Invite new members and manage pending invitations'
    WHEN 'members:remove'         THEN 'Remove members from the workspace'
    WHEN 'roles:manage'           THEN 'Create, edit, and delete custom roles; assign roles to members'
    WHEN 'audit_logs:read'        THEN 'View activity and audit logs for this workspace'
    WHEN 'clients:manage'         THEN 'Create and manage OAuth clients for this workspace'
    WHEN 'api_keys:manage'        THEN 'Create and revoke workspace API keys'
    ELSE description
END
WHERE description IS NULL OR description = '';
