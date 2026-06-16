use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use rand::{rngs::OsRng, RngCore};
use rsa::{pkcs8::DecodePublicKey, traits::PublicKeyParts, RsaPublicKey};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

use crate::bootstrap::config::AppConfig;
use crate::shared::client_policy::{
    effective_client_policy, is_client_type_allowed, load_platform_client_governance,
    load_tenant_client_policy,
};
use crate::shared::error::AppError;

/// Load the effective access token TTL (minutes) and refresh token TTL (days) for an org.
/// Uses the org's override if set, falling back to the platform system_settings value.
async fn effective_token_ttls(db: &PgPool, org_id: Option<Uuid>) -> (i64, i64) {
    let platform_at: i64 = sqlx::query_scalar::<_, i64>(
        "SELECT value::bigint FROM system_settings WHERE key = 'oidc_access_token_ttl_minutes'",
    )
    .fetch_optional(db)
    .await
    .ok()
    .flatten()
    .unwrap_or(60);

    let platform_rt: i64 = sqlx::query_scalar::<_, i64>(
        "SELECT value::bigint FROM system_settings WHERE key = 'refresh_token_ttl_days'",
    )
    .fetch_optional(db)
    .await
    .ok()
    .flatten()
    .unwrap_or(30);

    let Some(oid) = org_id else {
        return (platform_at, platform_rt);
    };

    let row = sqlx::query!(
        "SELECT oidc_access_token_ttl_minutes, refresh_token_ttl_days FROM organizations WHERE id = $1",
        oid
    )
    .fetch_optional(db).await.ok().flatten();

    let at = row
        .as_ref()
        .and_then(|r| r.oidc_access_token_ttl_minutes)
        .map(|v| v as i64)
        .unwrap_or(platform_at);

    let rt = row
        .as_ref()
        .and_then(|r| r.refresh_token_ttl_days)
        .map(|v| v as i64)
        .unwrap_or(platform_rt);

    (at, rt)
}

pub struct OIDCService {
    db: PgPool,
    config: Arc<AppConfig>,
}

#[derive(Serialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub token_type: String,
    pub expires_in: i64,
    pub refresh_token: Option<String>,
    pub id_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccessTokenClaims {
    pub iss: String,
    pub sub: String,
    pub aud: String,
    pub exp: i64,
    pub iat: i64,
    pub sid: String,
    #[serde(default)]
    pub scopes: Vec<String>,
}

#[derive(sqlx::FromRow)]
pub struct OAuthClientInternal {
    pub id: Uuid,
    pub client_id: String,
    pub client_secret_hash: Option<String>,
    pub app_type: String,
    pub status: String,
    pub is_first_party: bool,
    pub org_id: Option<Uuid>,
}

enum SigningMaterial {
    Hmac {
        secret: Vec<u8>,
    },
    Rsa {
        kid: String,
        private_key_pem: String,
        public_key_pem: String,
    },
}

impl OIDCService {
    pub fn new(db: PgPool, config: Arc<AppConfig>) -> Self {
        Self { db, config }
    }

    pub async fn get_client(&self, client_id: &str) -> Result<OAuthClientInternal, AppError> {
        let client = sqlx::query_as::<_, OAuthClientInternal>(
            "SELECT id, client_id, client_secret_hash, app_type, status, is_first_party, org_id FROM oauth_clients WHERE client_id = $1"
        )
        .bind(client_id)
        .fetch_optional(&self.db)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to load OAuth client '{}': {}", client_id, e)))?;

        let client = client.ok_or_else(|| AppError::Validation("Invalid client_id".into()))?;
        if client.status != "active" {
            return Err(AppError::Validation("Client is suspended.".into()));
        }
        if let Some(org_id) = client.org_id {
            let platform = load_platform_client_governance(&self.db).await?;
            let tenant = load_tenant_client_policy(&self.db, org_id).await?;
            let effective = effective_client_policy(&platform, &tenant);
            if !effective.allow_client_management
                || !is_client_type_allowed(&effective, &client.app_type)
            {
                return Err(AppError::Validation(
                    "Client is disabled by workspace or platform policy".into(),
                ));
            }
        }

        Ok(client)
    }

    pub async fn validate_redirect_uri(
        &self,
        client_id: Uuid,
        uri: &str,
    ) -> Result<bool, AppError> {
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM oauth_client_redirect_uris WHERE oauth_client_id = $1 AND redirect_uri = $2)"
        )
        .bind(client_id)
        .bind(uri)
        .fetch_one(&self.db)
        .await
        .unwrap_or(false);

        Ok(exists)
    }

    pub fn validate_client_secret(
        &self,
        client: &OAuthClientInternal,
        secret: &str,
    ) -> Result<(), AppError> {
        let hash = client
            .client_secret_hash
            .as_deref()
            .ok_or_else(|| AppError::Validation("Client has no secret configured".into()))?;

        // Verify with Argon2id. Argon2 uses constant-time comparison internally.
        // New clients are hashed with Argon2id (PHC string format starting with "$argon2id$").
        // Legacy clients hashed with SHA-256 (hex string) are no longer supported — regenerate.
        use argon2::{password_hash::PasswordHash, Argon2, PasswordVerifier};
        let parsed = PasswordHash::new(hash)
            .map_err(|_| AppError::Validation("Invalid client_secret".into()))?;
        Argon2::default()
            .verify_password(secret.as_bytes(), &parsed)
            .map_err(|_| AppError::Validation("Invalid client_secret".into()))
    }

    pub async fn create_authorization_code(
        &self,
        client_id: Uuid,
        user_id: Uuid,
        session_id: Uuid,
        redirect_uri: &str,
        scopes: Vec<String>,
        code_challenge: Option<&str>,
        code_challenge_method: Option<&str>,
        nonce: Option<&str>,
    ) -> Result<String, AppError> {
        let mut bytes = [0u8; 32];
        OsRng.fill_bytes(&mut bytes);
        let raw_code = URL_SAFE_NO_PAD.encode(bytes);

        let mut hasher = Sha256::new();
        hasher.update(raw_code.as_bytes());
        let code_hash = hex::encode(hasher.finalize());

        let expires_at = Utc::now() + Duration::minutes(5); // auth codes are short-lived

        sqlx::query(
            r#"
            INSERT INTO oauth_authorization_codes
            (code_hash, oauth_client_id, user_id, session_id, redirect_uri, scopes, code_challenge, code_challenge_method, nonce, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            "#
        )
        .bind(&code_hash)
        .bind(client_id)
        .bind(user_id)
        .bind(session_id)
        .bind(redirect_uri)
        .bind(&scopes)
        .bind(code_challenge)
        .bind(code_challenge_method)
        .bind(nonce)
        .bind(expires_at)
        .execute(&self.db)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to create authorization code: {}", e)))?;

        Ok(raw_code)
    }

    pub async fn exchange_code_for_tokens(
        &self,
        plain_code: &str,
        client_id: Uuid,
        req_redirect_uri: &str,
        code_verifier: Option<&str>,
    ) -> Result<TokenResponse, AppError> {
        let mut hasher = Sha256::new();
        hasher.update(plain_code.as_bytes());
        let code_hash = hex::encode(hasher.finalize());

        let mut tx = self.db.begin().await.map_err(|e| {
            AppError::Internal(format!(
                "Failed to start authorization code exchange transaction: {}",
                e
            ))
        })?;

        let code_record = sqlx::query!(
            r#"
            SELECT id, oauth_client_id, user_id, session_id, scopes, redirect_uri, code_challenge, code_challenge_method, expires_at, used_at, nonce
            FROM oauth_authorization_codes
            WHERE code_hash = $1
            FOR UPDATE
            "#,
            code_hash
        )
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to load authorization code: {}", e)))?
        .ok_or_else(|| AppError::Validation("Invalid authorization code".into()))?;

        if code_record.oauth_client_id != client_id {
            return Err(AppError::Validation("Code issued to another client".into()));
        }

        if code_record.redirect_uri != req_redirect_uri {
            return Err(AppError::Validation("Redirect URI mismatch".into()));
        }

        if code_record.used_at.is_some() {
            return Err(AppError::Validation(
                "Authorization code already used".into(),
            ));
        }

        if Utc::now() > code_record.expires_at {
            return Err(AppError::Validation("Authorization code expired".into()));
        }

        // PKCE verification
        if let Some(challenge_method) = code_record.code_challenge_method {
            if challenge_method == "S256" {
                let verifier = code_verifier
                    .ok_or_else(|| AppError::Validation("Missing 'code_verifier'".into()))?;
                let mut pkce_hasher = Sha256::new();
                pkce_hasher.update(verifier.as_bytes());
                let computed_challenge = URL_SAFE_NO_PAD.encode(pkce_hasher.finalize());

                if Some(computed_challenge) != code_record.code_challenge {
                    return Err(AppError::Validation("Invalid PKCE code_verifier".into()));
                }
            } else if challenge_method == "plain" {
                let verifier = code_verifier
                    .ok_or_else(|| AppError::Validation("Missing 'code_verifier'".into()))?;
                if Some(verifier.to_string()) != code_record.code_challenge {
                    return Err(AppError::Validation("Invalid PKCE code_verifier".into()));
                }
            }
        }

        // Mark as used
        sqlx::query("UPDATE oauth_authorization_codes SET used_at = now() WHERE id = $1")
            .bind(code_record.id)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                AppError::Internal(format!("Failed to mark authorization code as used: {}", e))
            })?;

        // Generate Access Token (JWT for this example, signed with JWT_SECRET)
        // In a real OIDC server, we'd use RSA keys instead of symmetric, but this works for MVP.
        let now = Utc::now();
        let (public_client_id, client_org_id): (String, Option<uuid::Uuid>) =
            sqlx::query_as("SELECT client_id, org_id FROM oauth_clients WHERE id = $1")
                .bind(client_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| {
                    AppError::Internal(format!(
                        "Failed to load OAuth client metadata during token exchange: {}",
                        e
                    ))
                })?;

        let (at_ttl_minutes, rt_ttl_days) = effective_token_ttls(&self.db, client_org_id).await;
        let expiration = now + Duration::minutes(at_ttl_minutes);

        crate::modules::audit::service::AuditService::new(self.db.clone())
            .log(crate::modules::audit::service::AuditEvent {
                actor_user_id: Some(code_record.user_id),
                organization_id: client_org_id,
                action: "oauth.token.issued".into(),
                target_type: "oauth_client".into(),
                target_id: Some(client_id.to_string()),
                ip: None,
                user_agent: None,
                metadata: serde_json::json!({ "scopes": code_record.scopes }),
            })
            .await;

        let claims = AccessTokenClaims {
            iss: self.config.server.issuer_url.clone(),
            sub: code_record.user_id.to_string(),
            aud: public_client_id.clone(),
            exp: expiration.timestamp(),
            iat: now.timestamp(),
            sid: code_record.session_id.to_string(),
            scopes: code_record.scopes.clone(),
        };

        let access_token = encode_oidc_token(&self.config, &claims, "access token")?;

        // Generate ID token if 'openid' scope was requested.
        // Include email/profile claims when the matching scopes were also requested,
        // so relying parties that don't call userinfo get the claims they need.
        let mut id_token = None;
        if code_record.scopes.iter().any(|s| s == "openid") {
            let include_email = code_record.scopes.iter().any(|s| s == "email");
            let include_profile = code_record.scopes.iter().any(|s| s == "profile");

            #[derive(Serialize)]
            struct IdClaims {
                iss: String,
                sub: String,
                aud: String,
                exp: i64,
                iat: i64,
                #[serde(skip_serializing_if = "Option::is_none")]
                nonce: Option<String>,
                #[serde(skip_serializing_if = "Option::is_none")]
                email: Option<String>,
                #[serde(skip_serializing_if = "Option::is_none")]
                email_verified: Option<bool>,
                #[serde(skip_serializing_if = "Option::is_none")]
                name: Option<String>,
                #[serde(skip_serializing_if = "Option::is_none")]
                picture: Option<String>,
            }

            let (email, email_verified, name, picture) = if include_email || include_profile {
                #[derive(sqlx::FromRow)]
                struct UserProfile {
                    display_name: Option<String>,
                    avatar_url: Option<String>,
                    email: Option<String>,
                    is_verified: Option<bool>,
                }
                let profile = sqlx::query_as::<_, UserProfile>(
                    r#"
                    SELECT u.display_name, u.avatar_url, e.email, e.is_verified
                    FROM users u
                    LEFT JOIN user_emails e ON e.user_id = u.id AND e.is_primary = true
                    WHERE u.id = $1
                    "#,
                )
                .bind(code_record.user_id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| {
                    AppError::Internal(format!("Failed to load user profile for ID token: {}", e))
                })?;

                match profile {
                    Some(p) => (
                        if include_email { p.email } else { None },
                        if include_email {
                            Some(p.is_verified.unwrap_or(false))
                        } else {
                            None
                        },
                        if include_profile {
                            p.display_name
                        } else {
                            None
                        },
                        if include_profile { p.avatar_url } else { None },
                    ),
                    None => (None, None, None, None),
                }
            } else {
                (None, None, None, None)
            };

            let id_claims = IdClaims {
                iss: self.config.server.issuer_url.clone(),
                sub: code_record.user_id.to_string(),
                aud: public_client_id,
                exp: expiration.timestamp(),
                iat: now.timestamp(),
                nonce: code_record.nonce,
                email,
                email_verified,
                name,
                picture,
            };

            id_token = Some(encode_oidc_token(&self.config, &id_claims, "id token")?);
        }

        // Generate Refresh Token
        let mut rt_bytes = [0u8; 32];
        OsRng.fill_bytes(&mut rt_bytes);
        let refresh_token = URL_SAFE_NO_PAD.encode(rt_bytes);

        let mut rt_hasher = Sha256::new();
        rt_hasher.update(refresh_token.as_bytes());
        let rt_hash = hex::encode(rt_hasher.finalize());
        let rt_expires_at = now + Duration::days(rt_ttl_days);

        sqlx::query(
            r#"
            INSERT INTO oauth_refresh_tokens (token_hash, family_id, oauth_client_id, user_id, session_id, scopes, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            "#
        )
        .bind(&rt_hash)
        .bind(Uuid::new_v4()) // New family ID for fresh token
        .bind(client_id)
        .bind(code_record.user_id)
        .bind(code_record.session_id)
        .bind(&code_record.scopes)
        .bind(rt_expires_at)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to store refresh token during code exchange: {}", e)))?;

        tx.commit().await.map_err(|e| {
            AppError::Internal(format!(
                "Failed to commit authorization code exchange: {}",
                e
            ))
        })?;

        Ok(TokenResponse {
            access_token,
            token_type: "Bearer".to_string(),
            expires_in: at_ttl_minutes * 60,
            refresh_token: Some(refresh_token),
            id_token,
        })
    }

    /// Exchange a refresh token for a new access token + rotated refresh token.
    /// Implements token rotation with family-level revocation on reuse detection.
    pub async fn exchange_refresh_token(
        &self,
        plain_refresh_token: &str,
        client_id: Uuid,
    ) -> Result<TokenResponse, AppError> {
        let mut rt_hasher = Sha256::new();
        rt_hasher.update(plain_refresh_token.as_bytes());
        let token_hash = hex::encode(rt_hasher.finalize());

        let mut tx = self.db.begin().await.map_err(|e| {
            AppError::Internal(format!(
                "Failed to start refresh token exchange transaction: {}",
                e
            ))
        })?;

        #[derive(sqlx::FromRow)]
        struct RefreshTokenRecord {
            id: Uuid,
            family_id: Uuid,
            oauth_client_id: Uuid,
            user_id: Uuid,
            session_id: Uuid,
            scopes: Vec<String>,
            expires_at: chrono::DateTime<Utc>,
            revoked_at: Option<chrono::DateTime<Utc>>,
        }
        let record = sqlx::query_as::<_, RefreshTokenRecord>(
            r#"
            SELECT id, family_id, oauth_client_id, user_id, session_id, scopes, expires_at, revoked_at
            FROM oauth_refresh_tokens
            WHERE token_hash = $1
            "#
        )
        .bind(&token_hash)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to load refresh token: {}", e)))?
        .ok_or_else(|| AppError::Validation("Invalid refresh token".into()))?;

        // Reuse detection: if already revoked, revoke the entire family (all tokens from the same
        // authorization grant) to contain the damage from a stolen token.
        if record.revoked_at.is_some() {
            sqlx::query(
                "UPDATE oauth_refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL"
            )
            .bind(record.family_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to revoke reused refresh token family: {}", e)))?;
            tx.commit().await.map_err(|e| {
                AppError::Internal(format!(
                    "Failed to commit refresh token family revocation: {}",
                    e
                ))
            })?;
            return Err(AppError::Validation(
                "Refresh token already used — all tokens in this session have been revoked".into(),
            ));
        }

        if record.oauth_client_id != client_id {
            return Err(AppError::Validation(
                "Refresh token issued to another client".into(),
            ));
        }

        if Utc::now() > record.expires_at {
            return Err(AppError::Validation("Refresh token expired".into()));
        }

        // Rotate: revoke the old token
        sqlx::query("UPDATE oauth_refresh_tokens SET revoked_at = now() WHERE id = $1")
            .bind(record.id)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                AppError::Internal(format!(
                    "Failed to revoke the previous refresh token: {}",
                    e
                ))
            })?;

        // Issue new access token
        let now = Utc::now();
        let (public_client_id, client_org_id): (String, Option<uuid::Uuid>) =
            sqlx::query_as("SELECT client_id, org_id FROM oauth_clients WHERE id = $1")
                .bind(client_id)
                .fetch_one(&mut *tx)
                .await
                .map_err(|e| {
                    AppError::Internal(format!(
                        "Failed to load OAuth client metadata during refresh token exchange: {}",
                        e
                    ))
                })?;

        let (at_ttl_minutes, rt_ttl_days) = effective_token_ttls(&self.db, client_org_id).await;
        let expiration = now + Duration::minutes(at_ttl_minutes);

        let claims = AccessTokenClaims {
            iss: self.config.server.issuer_url.clone(),
            sub: record.user_id.to_string(),
            aud: public_client_id.clone(),
            exp: expiration.timestamp(),
            iat: now.timestamp(),
            sid: record.session_id.to_string(),
            scopes: record.scopes.clone(),
        };
        let access_token = encode_oidc_token(&self.config, &claims, "access token")?;

        // Issue rotated refresh token (same family, points back to old token)
        let mut new_rt_bytes = [0u8; 32];
        OsRng.fill_bytes(&mut new_rt_bytes);
        let new_refresh_token = URL_SAFE_NO_PAD.encode(new_rt_bytes);
        let mut new_rt_hasher = Sha256::new();
        new_rt_hasher.update(new_refresh_token.as_bytes());
        let new_rt_hash = hex::encode(new_rt_hasher.finalize());
        let new_rt_expires = now + Duration::days(rt_ttl_days);

        sqlx::query(
            r#"
            INSERT INTO oauth_refresh_tokens
                (token_hash, family_id, oauth_client_id, user_id, session_id, scopes, expires_at, rotated_from_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            "#
        )
        .bind(&new_rt_hash)
        .bind(record.family_id)
        .bind(client_id)
        .bind(record.user_id)
        .bind(record.session_id)
        .bind(&record.scopes)
        .bind(new_rt_expires)
        .bind(record.id)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to store rotated refresh token: {}", e)))?;

        crate::modules::audit::service::AuditService::new(self.db.clone())
            .log(crate::modules::audit::service::AuditEvent {
                actor_user_id: Some(record.user_id),
                organization_id: client_org_id,
                action: "oauth.token.refreshed".into(),
                target_type: "oauth_client".into(),
                target_id: Some(client_id.to_string()),
                ip: None,
                user_agent: None,
                metadata: serde_json::json!({ "scopes": record.scopes }),
            })
            .await;

        tx.commit().await.map_err(|e| {
            AppError::Internal(format!("Failed to commit refresh token exchange: {}", e))
        })?;

        Ok(TokenResponse {
            access_token,
            token_type: "Bearer".to_string(),
            expires_in: at_ttl_minutes * 60,
            refresh_token: Some(new_refresh_token),
            id_token: None, // ID tokens are not re-issued on refresh per OIDC spec
        })
    }

    /// Revoke a refresh token for the given client.
    /// Returns Ok(()) even when the token does not exist, matching OAuth revocation semantics.
    pub async fn revoke_refresh_token(
        &self,
        plain_refresh_token: &str,
        client_id: Uuid,
    ) -> Result<(), AppError> {
        let mut rt_hasher = Sha256::new();
        rt_hasher.update(plain_refresh_token.as_bytes());
        let token_hash = hex::encode(rt_hasher.finalize());

        let mut tx = self.db.begin().await.map_err(|e| {
            AppError::Internal(format!(
                "Failed to start refresh token revocation transaction: {}",
                e
            ))
        })?;

        #[derive(sqlx::FromRow)]
        struct RefreshTokenRecord {
            id: Uuid,
            oauth_client_id: Uuid,
            revoked_at: Option<chrono::DateTime<Utc>>,
        }

        let record = sqlx::query_as::<_, RefreshTokenRecord>(
            r#"
            SELECT id, oauth_client_id, revoked_at
            FROM oauth_refresh_tokens
            WHERE token_hash = $1
            "#,
        )
        .bind(&token_hash)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| {
            AppError::Internal(format!(
                "Failed to load refresh token for revocation: {}",
                e
            ))
        })?;

        let Some(record) = record else {
            tx.commit().await.map_err(|e| {
                AppError::Internal(format!(
                    "Failed to commit empty refresh token revocation: {}",
                    e
                ))
            })?;
            return Ok(());
        };

        if record.oauth_client_id != client_id {
            tx.commit().await.map_err(|e| {
                AppError::Internal(format!(
                    "Failed to commit foreign-client refresh token revocation: {}",
                    e
                ))
            })?;
            return Ok(());
        }

        if record.revoked_at.is_none() {
            sqlx::query("UPDATE oauth_refresh_tokens SET revoked_at = now() WHERE id = $1")
                .bind(record.id)
                .execute(&mut *tx)
                .await
                .map_err(|e| {
                    AppError::Internal(format!("Failed to revoke refresh token: {}", e))
                })?;
        }

        tx.commit().await.map_err(|e| {
            AppError::Internal(format!("Failed to commit refresh token revocation: {}", e))
        })?;
        Ok(())
    }

    pub async fn introspect_refresh_token(
        &self,
        plain_refresh_token: &str,
        client_id: Uuid,
    ) -> Result<serde_json::Value, AppError> {
        let mut rt_hasher = Sha256::new();
        rt_hasher.update(plain_refresh_token.as_bytes());
        let token_hash = hex::encode(rt_hasher.finalize());

        #[derive(sqlx::FromRow)]
        struct RefreshTokenRecord {
            oauth_client_id: Uuid,
            user_id: Uuid,
            session_id: Uuid,
            scopes: Vec<String>,
            expires_at: chrono::DateTime<Utc>,
            revoked_at: Option<chrono::DateTime<Utc>>,
        }

        let record = sqlx::query_as::<_, RefreshTokenRecord>(
            r#"
            SELECT oauth_client_id, user_id, session_id, scopes, expires_at, revoked_at
            FROM oauth_refresh_tokens
            WHERE token_hash = $1
            "#,
        )
        .bind(&token_hash)
        .fetch_optional(&self.db)
        .await
        .map_err(|e| {
            AppError::Internal(format!(
                "Failed to load refresh token for introspection: {}",
                e
            ))
        })?;

        let Some(record) = record else {
            return Ok(json!({ "active": false }));
        };

        if record.oauth_client_id != client_id
            || record.revoked_at.is_some()
            || Utc::now() > record.expires_at
        {
            return Ok(json!({ "active": false }));
        }

        let (public_client_id,): (String,) =
            sqlx::query_as("SELECT client_id FROM oauth_clients WHERE id = $1")
                .bind(client_id)
                .fetch_one(&self.db)
                .await
                .map_err(|e| {
                    AppError::Internal(format!(
                        "Failed to load OAuth client during token introspection: {}",
                        e
                    ))
                })?;

        Ok(json!({
            "active": true,
            "client_id": public_client_id,
            "sub": record.user_id.to_string(),
            "scope": record.scopes.join(" "),
            "token_type": "refresh_token",
            "exp": record.expires_at.timestamp(),
            "iat": serde_json::Value::Null,
            "sid": record.session_id.to_string(),
        }))
    }

    pub fn introspect_access_token(
        &self,
        token: &str,
        client_public_id: &str,
    ) -> Result<serde_json::Value, AppError> {
        let claims = match self.validate_access_token(token) {
            Ok(value) => value,
            Err(AppError::Unauthorized) => return Ok(json!({ "active": false })),
            Err(err) => return Err(err),
        };

        if claims.aud != client_public_id {
            return Ok(json!({ "active": false }));
        }

        Ok(json!({
            "active": true,
            "client_id": claims.aud,
            "sub": claims.sub,
            "scope": claims.scopes.join(" "),
            "token_type": "access_token",
            "exp": claims.exp,
            "iat": claims.iat,
            "sid": claims.sid,
        }))
    }

    pub fn validate_access_token(&self, token: &str) -> Result<AccessTokenClaims, AppError> {
        let mut validation = Validation::new(signing_algorithm(&self.config));
        validation.validate_aud = false;
        validation.set_issuer(&[self.config.server.issuer_url.as_str()]);

        let claims = match oidc_signing_material(&self.config)? {
            SigningMaterial::Rsa { public_key_pem, .. } => {
                let decoding_key =
                    DecodingKey::from_rsa_pem(public_key_pem.as_bytes()).map_err(|e| {
                        AppError::Internal(format!("Invalid OIDC public key PEM: {}", e))
                    })?;
                decode::<AccessTokenClaims>(token, &decoding_key, &validation)
                    .map_err(|_| AppError::Unauthorized)?
                    .claims
            }
            SigningMaterial::Hmac { secret } => {
                let decoding_key = DecodingKey::from_secret(&secret);
                decode::<AccessTokenClaims>(token, &decoding_key, &validation)
                    .map_err(|_| AppError::Unauthorized)?
                    .claims
            }
        };

        Ok(claims)
    }

    pub async fn userinfo(&self, token: &str) -> Result<serde_json::Value, AppError> {
        let claims = self.validate_access_token(token)?;
        let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?;

        let record = sqlx::query!(
            r#"
            SELECT
                u.id,
                u.display_name,
                u.avatar_url,
                e.email as "email?",
                e.is_verified as "email_verified?"
            FROM users u
            LEFT JOIN user_emails e
                ON e.user_id = u.id
               AND e.is_primary = true
            WHERE u.id = $1
            "#,
            user_id
        )
        .fetch_optional(&self.db)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to load userinfo profile: {}", e)))?
        .ok_or(AppError::Unauthorized)?;

        let include_email = claims.scopes.iter().any(|scope| scope == "email");
        let include_profile = claims.scopes.iter().any(|scope| scope == "profile");

        let mut payload = serde_json::Map::new();
        payload.insert(
            "sub".into(),
            serde_json::Value::String(record.id.to_string()),
        );

        if include_email {
            if let Some(email) = record.email {
                payload.insert("email".into(), serde_json::Value::String(email));
            }
            payload.insert(
                "email_verified".into(),
                serde_json::Value::Bool(record.email_verified.unwrap_or(false)),
            );
        }

        if include_profile {
            if let Some(name) = record.display_name {
                payload.insert("name".into(), serde_json::Value::String(name));
            }
            if let Some(picture) = record.avatar_url {
                payload.insert("picture".into(), serde_json::Value::String(picture));
            }
        }

        Ok(serde_json::Value::Object(payload))
    }
}

pub fn oidc_signing_alg(config: &AppConfig) -> &'static str {
    match oidc_signing_material(config) {
        Ok(SigningMaterial::Rsa { .. }) => "RS256",
        _ => "HS256",
    }
}

pub fn oidc_jwks(config: &AppConfig) -> Result<Vec<serde_json::Value>, AppError> {
    match oidc_signing_material(config)? {
        SigningMaterial::Rsa {
            kid,
            public_key_pem,
            ..
        } => {
            let public_key = RsaPublicKey::from_public_key_pem(&public_key_pem)
                .map_err(|e| AppError::Internal(format!("Invalid OIDC public key PEM: {}", e)))?;

            Ok(vec![serde_json::json!({
                "kty": "RSA",
                "use": "sig",
                "kid": kid,
                "alg": "RS256",
                "n": URL_SAFE_NO_PAD.encode(public_key.n().to_bytes_be()),
                "e": URL_SAFE_NO_PAD.encode(public_key.e().to_bytes_be()),
            })])
        }
        SigningMaterial::Hmac { .. } => Ok(Vec::new()),
    }
}

/// Build JWKS from DB-managed signing keys (active + not-yet-expired retired keys).
/// Falls back to `oidc_jwks` (config-based) when no DB keys exist.
pub async fn oidc_jwks_from_db(
    db: &sqlx::PgPool,
    config: &AppConfig,
) -> Result<Vec<serde_json::Value>, AppError> {
    let rollover_hours: i64 = sqlx::query_scalar(
        "SELECT value::bigint FROM system_settings WHERE key = 'signing_key_rollover_hours'",
    )
    .fetch_optional(db)
    .await
    .ok()
    .flatten()
    .unwrap_or(24);

    #[derive(sqlx::FromRow)]
    struct KeyRow {
        kid: String,
        public_key_pem: String,
    }

    let rows = sqlx::query_as::<_, KeyRow>(
        r#"
        SELECT kid, public_key_pem
        FROM oidc_signing_keys
        WHERE is_active = true
           OR (retired_at IS NOT NULL AND retired_at > NOW() - ($1 || ' hours')::interval)
        ORDER BY is_active DESC, created_at DESC
        "#,
    )
    .bind(rollover_hours)
    .fetch_all(db)
    .await
    .map_err(|e| {
        AppError::Internal(format!(
            "Failed to load OIDC signing keys from the database: {}",
            e
        ))
    })?;

    if rows.is_empty() {
        // No DB keys — fall back to config-based keys
        return oidc_jwks(config);
    }

    let mut keys = Vec::new();
    for row in rows {
        if let Ok(public_key) = RsaPublicKey::from_public_key_pem(&row.public_key_pem) {
            keys.push(serde_json::json!({
                "kty": "RSA",
                "use": "sig",
                "kid": row.kid,
                "alg": "RS256",
                "n": URL_SAFE_NO_PAD.encode(public_key.n().to_bytes_be()),
                "e": URL_SAFE_NO_PAD.encode(public_key.e().to_bytes_be()),
            }));
        }
    }

    Ok(keys)
}

fn signing_algorithm(config: &AppConfig) -> Algorithm {
    match oidc_signing_material(config) {
        Ok(SigningMaterial::Rsa { .. }) => Algorithm::RS256,
        _ => Algorithm::HS256,
    }
}

fn encode_oidc_token<T: Serialize>(
    config: &AppConfig,
    claims: &T,
    token_kind: &str,
) -> Result<String, AppError> {
    match oidc_signing_material(config)? {
        SigningMaterial::Rsa {
            kid,
            private_key_pem,
            ..
        } => {
            let mut header = Header::new(Algorithm::RS256);
            header.kid = Some(kid);
            let encoding_key = EncodingKey::from_rsa_pem(private_key_pem.as_bytes())
                .map_err(|e| AppError::Internal(format!("Invalid OIDC private key PEM: {}", e)))?;
            encode(&header, claims, &encoding_key)
                .map_err(|e| AppError::Internal(format!("Failed to issue {}: {}", token_kind, e)))
        }
        SigningMaterial::Hmac { secret } => {
            let header = Header::new(Algorithm::HS256);
            let encoding_key = EncodingKey::from_secret(&secret);
            encode(&header, claims, &encoding_key)
                .map_err(|e| AppError::Internal(format!("Failed to issue {}: {}", token_kind, e)))
        }
    }
}

fn oidc_signing_material(config: &AppConfig) -> Result<SigningMaterial, AppError> {
    match (
        config.oidc.private_key_pem.as_ref(),
        config.oidc.public_key_pem.as_ref(),
    ) {
        (Some(private_key_pem), Some(public_key_pem))
            if !private_key_pem.trim().is_empty() && !public_key_pem.trim().is_empty() =>
        {
            Ok(SigningMaterial::Rsa {
                kid: config.oidc.key_id.clone(),
                private_key_pem: private_key_pem.clone(),
                public_key_pem: public_key_pem.clone(),
            })
        }
        _ => {
            if config
                .oidc
                .signing_secret
                .starts_with("dev-oidc-signing-secret-")
            {
                tracing::warn!("ROOIAM_OIDC_PRIVATE_KEY_* is not set; falling back to HS256 development signing");
            }
            Ok(SigningMaterial::Hmac {
                secret: config.oidc.signing_secret.as_bytes().to_vec(),
            })
        }
    }
}
