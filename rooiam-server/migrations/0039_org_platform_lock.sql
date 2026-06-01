-- Platform admins can lock a workspace into suspended state.
-- When platform_locked = true:
--   - status is always 'suspended' (enforced by app logic)
--   - tenant admins cannot change status back to 'active'
-- When platform_locked = false:
--   - tenant admins can freely set status to 'active' or 'suspended'

ALTER TABLE organizations
    ADD COLUMN platform_locked BOOLEAN NOT NULL DEFAULT false;
