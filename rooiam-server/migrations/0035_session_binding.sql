-- Session binding: store a fingerprint at session creation time.
-- The fingerprint encodes device class (mobile/desktop) + IP /24 subnet.
-- Middleware logs auth.session.binding_mismatch when the fingerprint changes.
ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS session_fingerprint TEXT;
