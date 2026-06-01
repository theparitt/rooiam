INSERT INTO oauth_client_allowed_embed_origins (oauth_client_id, origin)
SELECT DISTINCT
    r.oauth_client_id,
    substring(r.redirect_uri from '^[A-Za-z][A-Za-z0-9+.-]*://[^/]+') AS origin
FROM oauth_client_redirect_uris r
WHERE substring(r.redirect_uri from '^[A-Za-z][A-Za-z0-9+.-]*://[^/]+') IS NOT NULL
ON CONFLICT (oauth_client_id, origin) DO NOTHING;
