-- Phase 3: Advanced tenant policies
-- allowed_email_domains  – comma-separated list of allowed email domains (empty = unrestricted)
-- max_session_age_hours  – if set, sessions older than this are rejected at middleware
-- require_mfa_for_admins – require MFA for workspace owners/admins even when require_mfa is off

ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS allowed_email_domains TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS max_session_age_hours  INTEGER,
    ADD COLUMN IF NOT EXISTS require_mfa_for_admins BOOLEAN NOT NULL DEFAULT FALSE;
