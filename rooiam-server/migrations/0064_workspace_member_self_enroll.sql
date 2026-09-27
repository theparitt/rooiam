-- Existing owner keys gain this deliberately narrow, token-bound operation.
-- Custom/restricted grants and workspace_admin keys are left unchanged.
UPDATE tenant_api_keys
SET allowed_permissions = array_append(allowed_permissions, 'members.enroll')
WHERE permission_preset IN ('owner_full', 'workspace_owner')
  AND 'members.remove' = ANY(allowed_permissions)
  AND NOT ('members.enroll' = ANY(allowed_permissions));
