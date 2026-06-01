use sqlx::PgPool;
use uuid::Uuid;
use chrono::{DateTime, Utc};
use crate::shared::error::AppError;
use super::models::MagicLink;

#[derive(Clone)]
pub struct AuthRepository {
    pub pool: PgPool,
}

impl AuthRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Stores the secure magic link transaction into the database
    pub async fn create_magic_link(
        &self,
        email: &str,
        token_hash: &str,
        expires_at: DateTime<Utc>,
        redirect_uri: Option<String>,
        surface: Option<String>,
    ) -> Result<MagicLink, AppError> {
        let link = sqlx::query_as::<sqlx::Postgres, MagicLink>(
            r#"
            INSERT INTO magic_links (email, token_hash, purpose, redirect_uri, surface, expires_at)
            VALUES ($1, $2, 'login', $3, $4, $5)
            RETURNING id, email, token_hash, purpose, redirect_uri, surface, code_challenge, code_challenge_method, expires_at, used_at, created_at
            "#,
        )
        .bind(email)
        .bind(token_hash)
        .bind(redirect_uri)
        .bind(surface)
        .bind(expires_at)
        .fetch_one(&self.pool)
        .await?;

        Ok(link)
    }

    /// Fetches an unused, non-expired magic link token
    pub async fn get_valid_magic_link(
        &self,
        token_hash: &str,
    ) -> Result<MagicLink, AppError> {
        let link = sqlx::query_as::<sqlx::Postgres, MagicLink>(
            r#"
            SELECT id, email, token_hash, purpose, redirect_uri, surface, code_challenge, code_challenge_method, expires_at, used_at, created_at
            FROM magic_links
            WHERE token_hash = $1 
              AND used_at IS NULL
              AND expires_at > NOW()
            "#,
        )
        .bind(token_hash)
        .fetch_optional(&self.pool)
        .await?
        .ok_or_else(|| AppError::Validation("Token is invalid or expired".into()))?;

        Ok(link)
    }

    /// Mark the link as redeemed securely to prevent replay attacks
    pub async fn mark_magic_link_used(&self, id: Uuid) -> Result<(), AppError> {
        sqlx::query(
            "UPDATE magic_links SET used_at = NOW() WHERE id = $1"
        )
        .bind(id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }
}
