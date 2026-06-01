-- Rename status value 'paused' → 'suspended' across all tables.
-- This is a data migration only — no column changes, just value updates.

-- Users
UPDATE users SET status = 'suspended' WHERE status = 'paused';

-- Organizations
UPDATE organizations SET status = 'suspended' WHERE status = 'paused';

-- Organization members
UPDATE organization_members SET status = 'suspended' WHERE status = 'paused';

-- OAuth clients (also update CHECK constraint)
UPDATE oauth_clients SET status = 'suspended' WHERE status = 'paused';
ALTER TABLE oauth_clients DROP CONSTRAINT IF EXISTS oauth_clients_status_check;
ALTER TABLE oauth_clients ADD CONSTRAINT oauth_clients_status_check CHECK (status IN ('active', 'suspended'));
