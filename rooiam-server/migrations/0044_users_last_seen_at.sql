-- Add last_seen_at to users table for member activity tracking.
-- This column was included in the initial schema design but was missing
-- from the database due to a migration gap. Defaults to now() for existing users.

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();
