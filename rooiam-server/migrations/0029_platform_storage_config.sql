-- Platform-level storage configuration.
-- Supports two backends:
--   "local"  — files written to a path on the server's local disk
--   "minio"  — files stored in an S3-compatible MinIO bucket
--
-- The active backend is selected by `storage_backend`.
-- Only the settings for the chosen backend are used at runtime.
-- MinIO secret key is stored as plain text in system_settings (same
-- treatment as smtp_password / oauth secrets) — encrypt the DB volume
-- or use Vault at the infrastructure level if you need secret-at-rest.

INSERT INTO system_settings (key, value, updated_at) VALUES
    ('storage_backend',         'local',  NOW()),
    ('storage_local_path',      '',       NOW()),
    ('storage_minio_endpoint',  '',       NOW()),
    ('storage_minio_bucket',    '',       NOW()),
    ('storage_minio_region',    '',       NOW()),
    ('storage_minio_access_key','',       NOW()),
    ('storage_minio_secret_key','',       NOW()),
    ('storage_minio_use_ssl',   'true',   NOW())
ON CONFLICT (key) DO NOTHING;
