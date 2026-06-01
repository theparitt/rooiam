CREATE TABLE IF NOT EXISTS oauth_client_allowed_embed_origins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    oauth_client_id UUID NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
    origin TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (oauth_client_id, origin)
);

CREATE INDEX IF NOT EXISTS idx_oauth_client_allowed_embed_origins_client
    ON oauth_client_allowed_embed_origins (oauth_client_id);
