-- Add tenant_portal_require_mfa to organizations.
-- Controls whether workspace owners/admins must complete MFA when signing
-- into the root tenant portal (distinct from workspace end-user MFA).

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS tenant_portal_require_mfa BOOLEAN NOT NULL DEFAULT FALSE;
