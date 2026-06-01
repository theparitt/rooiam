CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";

-- users
CREATE TABLE IF NOT EXISTS users
(
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    display_name text,
    avatar_url text,
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- user_emails
CREATE TABLE IF NOT EXISTS user_emails
(
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
    email citext NOT NULL UNIQUE,
    is_primary boolean NOT NULL DEFAULT false,
    is_verified boolean NOT NULL DEFAULT false,
    verified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- external_identities
CREATE TABLE IF NOT EXISTS external_identities
(
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
    provider text NOT NULL,
    provider_user_id text NOT NULL,
    email citext,
    profile_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE ( provider, provider_user_id )
);

-- magic_links
CREATE TABLE IF NOT EXISTS magic_links
(
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    email citext NOT NULL,
    token_hash text NOT NULL UNIQUE,
    purpose text NOT NULL,
    redirect_uri text,
    code_challenge text,
    code_challenge_method text,
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- sessions
CREATE TABLE IF NOT EXISTS sessions
(
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
    current_org_id uuid,
    session_secret_hash text NOT NULL,
    user_agent text,
    ip inet,
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- organizations
CREATE TABLE IF NOT EXISTS organizations
(
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    logo_url text,
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- organization_members
CREATE TABLE IF NOT EXISTS organization_members
(
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id uuid NOT NULL REFERENCES organizations ( id ) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE ( organization_id, user_id )
);

-- roles
CREATE TABLE IF NOT EXISTS roles
(
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id uuid REFERENCES organizations ( id ) ON DELETE CASCADE,
    code text NOT NULL,
    name text NOT NULL,
    is_system boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE ( organization_id, code )
);

-- permissions
CREATE TABLE IF NOT EXISTS permissions
(
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    code text NOT NULL UNIQUE,
    description text
);

-- role_permissions
CREATE TABLE IF NOT EXISTS role_permissions
(
    role_id uuid NOT NULL REFERENCES roles ( id ) ON DELETE CASCADE,
    permission_id uuid NOT NULL REFERENCES permissions ( id ) ON DELETE CASCADE,
    PRIMARY KEY ( role_id, permission_id )
);

-- member_roles
CREATE TABLE IF NOT EXISTS member_roles
(
    member_id uuid NOT NULL REFERENCES organization_members ( id ) ON DELETE CASCADE,
    role_id uuid NOT NULL REFERENCES roles ( id ) ON DELETE CASCADE,
    PRIMARY KEY ( member_id, role_id )
);

-- oauth_clients
CREATE TABLE IF NOT EXISTS oauth_clients
(
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id text NOT NULL UNIQUE,
    client_secret_hash text,
    app_name text NOT NULL,
    app_type text NOT NULL,
    owner_user_id uuid REFERENCES users ( id ) ON DELETE SET NULL,
    is_first_party boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- oauth_client_redirect_uris
CREATE TABLE IF NOT EXISTS oauth_client_redirect_uris
(
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    oauth_client_id uuid NOT NULL REFERENCES oauth_clients ( id ) ON DELETE CASCADE,
    redirect_uri text NOT NULL,
    UNIQUE ( oauth_client_id, redirect_uri )
);

-- oauth_authorization_codes
CREATE TABLE IF NOT EXISTS oauth_authorization_codes
(
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    code_hash text NOT NULL UNIQUE,
    oauth_client_id uuid NOT NULL REFERENCES oauth_clients ( id ) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
    session_id uuid NOT NULL REFERENCES sessions ( id ) ON DELETE CASCADE,
    redirect_uri text NOT NULL,
    scopes text[] NOT NULL,
    code_challenge text,
    code_challenge_method text,
    nonce text,
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- oauth_refresh_tokens
CREATE TABLE IF NOT EXISTS oauth_refresh_tokens
(
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    token_hash text NOT NULL UNIQUE,
    family_id uuid NOT NULL,
    oauth_client_id uuid NOT NULL REFERENCES oauth_clients ( id ) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users ( id ) ON DELETE CASCADE,
    session_id uuid NOT NULL REFERENCES sessions ( id ) ON DELETE CASCADE,
    scopes text[] NOT NULL,
    expires_at timestamptz NOT NULL,
    rotated_from_id uuid REFERENCES oauth_refresh_tokens ( id ) ON DELETE SET NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- audit_logs
CREATE TABLE IF NOT EXISTS audit_logs
(
    id bigserial PRIMARY KEY,
    actor_user_id uuid,
    organization_id uuid,
    action text NOT NULL,
    target_type text NOT NULL,
    target_id text,
    ip inet,
    user_agent text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
