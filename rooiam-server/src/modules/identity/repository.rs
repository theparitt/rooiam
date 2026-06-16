use sqlx::PgPool;
use uuid::Uuid;

use super::models::User;
use crate::shared::error::AppError;

#[derive(Debug, Clone)]
pub struct WebauthnUserIdentity {
    pub id: Uuid,
    pub email: String,
    pub display_name: String,
}

#[derive(Clone)]
pub struct IdentityRepository {
    pool: PgPool,
}

impl IdentityRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Retrieve the core user profile details by ID
    pub async fn get_user_by_id(&self, user_id: Uuid) -> Result<User, AppError> {
        let user = sqlx::query_as::<sqlx::Postgres, User>(
            r#"
            SELECT
                u.id,
                e.email,
                u.display_name,
                u.avatar_url,
                u.status,
                u.is_platform_owner,
                u.is_superuser,
                u.created_at,
                u.updated_at,
                u.last_login_ip,
                u.last_login_ua_hash
            FROM users u
            LEFT JOIN user_emails e ON e.user_id = u.id AND e.is_primary = true
            WHERE u.id = $1
            "#,
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".into()))?;

        Ok(user)
    }

    /// Update limited profile details like display_name and avatar_url
    pub async fn update_user_profile(
        &self,
        user_id: Uuid,
        display_name: Option<String>,
        avatar_url: Option<String>,
    ) -> Result<User, AppError> {
        let updated_user = sqlx::query_as::<sqlx::Postgres, User>(
            r#"
            UPDATE users AS u
            SET display_name = COALESCE($2, u.display_name),
                avatar_url = CASE
                    WHEN $3 = '' THEN NULL
                    ELSE COALESCE($3, u.avatar_url)
                END,
                updated_at = NOW()
            FROM user_emails e
            WHERE u.id = $1
              AND e.user_id = u.id
              AND e.is_primary = true
            RETURNING
                u.id,
                e.email,
                u.display_name,
                u.avatar_url,
                u.status,
                u.is_platform_owner,
                u.is_superuser,
                u.created_at,
                u.updated_at,
                u.last_login_ip,
                u.last_login_ua_hash
            "#,
        )
        .bind(user_id)
        .bind(display_name)
        .bind(avatar_url)
        .fetch_optional(&self.pool)
        .await?
        .ok_or_else(|| AppError::NotFound("User not found".into()))?;

        Ok(updated_user)
    }

    pub async fn get_user_id_by_email(&self, email: &str) -> Result<Option<Uuid>, AppError> {
        let rec = sqlx::query("SELECT user_id FROM user_emails WHERE email = $1")
            .bind(email)
            .fetch_optional(&self.pool)
            .await?;

        use sqlx::Row;
        Ok(rec.map(|r| r.get("user_id")))
    }

    pub async fn get_webauthn_identity(
        &self,
        user_id: Uuid,
    ) -> Result<WebauthnUserIdentity, AppError> {
        let row = sqlx::query(
            r#"
            SELECT u.id, e.email, COALESCE(u.display_name, split_part(e.email::text, '@', 1)) AS display_name
            FROM users u
            JOIN user_emails e ON e.user_id = u.id AND e.is_primary = true
            WHERE u.id = $1
            "#
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?
        .ok_or_else(|| AppError::NotFound("Primary email not found for user".into()))?;

        use sqlx::Row;
        Ok(WebauthnUserIdentity {
            id: row.get("id"),
            email: row.get("email"),
            display_name: row.get("display_name"),
        })
    }

    pub async fn create_user_with_email(&self, email: &str) -> Result<Uuid, AppError> {
        let mut tx = self.pool.begin().await?;

        let rec = sqlx::query("INSERT INTO users DEFAULT VALUES RETURNING id")
            .fetch_one(&mut *tx)
            .await?;

        use sqlx::Row;
        let user_id: Uuid = rec.get("id");

        sqlx::query(
            "INSERT INTO user_emails (user_id, email, is_primary, is_verified, verified_at) VALUES ($1, $2, true, true, NOW())"
        )
        .bind(user_id)
        .bind(email)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

        Ok(user_id)
    }

    pub async fn get_user_id_by_external_identity(
        &self,
        provider: &str,
        provider_user_id: &str,
    ) -> Result<Option<Uuid>, AppError> {
        let rec = sqlx::query(
            "SELECT user_id FROM external_identities WHERE provider = $1 AND provider_user_id = $2",
        )
        .bind(provider)
        .bind(provider_user_id)
        .fetch_optional(&self.pool)
        .await?;

        use sqlx::Row;
        Ok(rec.map(|r| r.get("user_id")))
    }

    pub async fn list_external_identities_by_user_id(
        &self,
        user_id: Uuid,
    ) -> Result<Vec<super::models::ExternalIdentity>, AppError> {
        let identities = sqlx::query_as::<_, super::models::ExternalIdentity>(
            r#"
            SELECT id, user_id, provider, provider_user_id, email, profile_json, created_at
            FROM external_identities
            WHERE user_id = $1
            ORDER BY provider ASC, created_at ASC
            "#,
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(identities)
    }

    pub async fn delete_external_identity_for_user(
        &self,
        user_id: Uuid,
        provider: &str,
    ) -> Result<u64, AppError> {
        let result =
            sqlx::query("DELETE FROM external_identities WHERE user_id = $1 AND provider = $2")
                .bind(user_id)
                .bind(provider)
                .execute(&self.pool)
                .await?;

        Ok(result.rows_affected())
    }

    pub async fn get_primary_email_by_user_id(
        &self,
        user_id: Uuid,
    ) -> Result<Option<String>, AppError> {
        sqlx::query_scalar("SELECT email FROM user_emails WHERE user_id = $1 AND is_primary = true")
            .bind(user_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(Into::into)
    }

    pub async fn create_user_with_external_identity(
        &self,
        provider: &str,
        provider_user_id: &str,
        email: Option<String>,
        email_verified: bool,
        name: Option<String>,
        avatar_url: Option<String>,
    ) -> Result<Uuid, AppError> {
        let mut tx = self.pool.begin().await?;

        let rec = sqlx::query(
            "INSERT INTO users (display_name, avatar_url) VALUES ($1, $2) RETURNING id",
        )
        .bind(name)
        .bind(avatar_url)
        .fetch_one(&mut *tx)
        .await?;

        use sqlx::Row;
        let user_id: Uuid = rec.get("id");

        if let Some(e) = email.clone() {
            // Best effort to link email. If email already exists, this might fail,
            // but normally we check by email first before calling this.
            sqlx::query(
                "INSERT INTO user_emails (user_id, email, is_primary, is_verified, verified_at) VALUES ($1, $2, true, $3, CASE WHEN $3 THEN NOW() ELSE NULL END) ON CONFLICT DO NOTHING"
            )
            .bind(user_id)
            .bind(&e)
            .bind(email_verified)
            .execute(&mut *tx)
            .await?;
        }

        sqlx::query(
            "INSERT INTO external_identities (user_id, provider, provider_user_id, email) VALUES ($1, $2, $3, $4)"
        )
        .bind(user_id)
        .bind(provider)
        .bind(provider_user_id)
        .bind(email)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

        Ok(user_id)
    }

    pub async fn link_external_identity(
        &self,
        user_id: Uuid,
        provider: &str,
        provider_user_id: &str,
        email: Option<String>,
    ) -> Result<(), AppError> {
        sqlx::query(
            "INSERT INTO external_identities (user_id, provider, provider_user_id, email) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING"
        )
        .bind(user_id)
        .bind(provider)
        .bind(provider_user_id)
        .bind(email)
        .execute(&self.pool)
        .await?;

        Ok(())
    }
}
