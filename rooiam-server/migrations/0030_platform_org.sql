-- Add is_platform_org flag to organizations
ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS is_platform_org boolean NOT NULL DEFAULT false;

-- Only one platform org allowed
CREATE UNIQUE INDEX IF NOT EXISTS organizations_one_platform_org
    ON organizations (is_platform_org)
    WHERE is_platform_org = true;
