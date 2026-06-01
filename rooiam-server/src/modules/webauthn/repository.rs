use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use crate::shared::error::AppError;

use super::models::{UserPasskey, WebauthnChallenge};

#[derive(Clone)]
pub struct WebauthnRepository {
    pool: PgPool,
}

pub struct NewPasskey {
    pub user_id: Uuid,
    pub credential_id: String,
    pub public_key: String,
    pub sign_count: i64,
    pub transports: serde_json::Value,
    pub aaguid: Option<Uuid>,
    pub name: String,
    pub credential: serde_json::Value,
}

impl WebauthnRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub fn pool(&self) -> &PgPool {
        &self.pool
    }

    pub async fn list_passkeys_by_user_id(&self, user_id: Uuid) -> Result<Vec<UserPasskey>, AppError> {
        let passkeys = sqlx::query_as::<_, UserPasskey>(
            r#"
            SELECT id, user_id, credential_id, public_key, sign_count, transports, aaguid, name, credential, last_used_at, created_at
            FROM user_passkeys
            WHERE user_id = $1
            ORDER BY created_at DESC
            "#,
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(passkeys)
    }

    pub async fn create_passkey(&self, input: NewPasskey) -> Result<UserPasskey, AppError> {
        let passkey = sqlx::query_as::<_, UserPasskey>(
            r#"
            INSERT INTO user_passkeys (user_id, credential_id, public_key, sign_count, transports, aaguid, name, credential)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id, user_id, credential_id, public_key, sign_count, transports, aaguid, name, credential, last_used_at, created_at
            "#,
        )
        .bind(input.user_id)
        .bind(input.credential_id)
        .bind(input.public_key)
        .bind(input.sign_count)
        .bind(input.transports)
        .bind(input.aaguid)
        .bind(input.name)
        .bind(input.credential)
        .fetch_one(&self.pool)
        .await?;

        Ok(passkey)
    }

    pub async fn get_passkey_by_credential_id(&self, credential_id: &str) -> Result<Option<UserPasskey>, AppError> {
        let passkey = sqlx::query_as::<_, UserPasskey>(
            r#"
            SELECT id, user_id, credential_id, public_key, sign_count, transports, aaguid, name, credential, last_used_at, created_at
            FROM user_passkeys
            WHERE credential_id = $1
            "#,
        )
        .bind(credential_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(passkey)
    }

    pub async fn update_passkey_usage(&self, credential_id: &str, sign_count: i64) -> Result<(), AppError> {
        sqlx::query(
            r#"
            UPDATE user_passkeys
            SET sign_count = $2, last_used_at = NOW()
            WHERE credential_id = $1
            "#,
        )
        .bind(credential_id)
        .bind(sign_count)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn update_passkey_after_auth(
        &self,
        credential_id: &str,
        credential: serde_json::Value,
        sign_count: i64,
    ) -> Result<(), AppError> {
        let serialized = serde_json::to_string(&credential)
            .map_err(|e| AppError::Internal(format!("Failed to serialize stored passkey: {}", e)))?;

        sqlx::query(
            r#"
            UPDATE user_passkeys
            SET credential = $2,
                public_key = $3,
                sign_count = $4,
                last_used_at = NOW()
            WHERE credential_id = $1
            "#,
        )
        .bind(credential_id)
        .bind(credential)
        .bind(serialized)
        .bind(sign_count)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn delete_passkey(&self, user_id: Uuid, passkey_id: Uuid) -> Result<bool, AppError> {
        let deleted = sqlx::query(
            "DELETE FROM user_passkeys WHERE id = $1 AND user_id = $2",
        )
        .bind(passkey_id)
        .bind(user_id)
        .execute(&self.pool)
        .await?
        .rows_affected();

        Ok(deleted > 0)
    }

    pub async fn rename_passkey(&self, passkey_id: Uuid, user_id: Uuid, new_name: &str) -> Result<(), AppError> {
        let rows = sqlx::query(
            "UPDATE user_passkeys SET name = $1 WHERE id = $2 AND user_id = $3",
        )
        .bind(new_name)
        .bind(passkey_id)
        .bind(user_id)
        .execute(&self.pool)
        .await?
        .rows_affected();

        if rows == 0 {
            return Err(AppError::NotFound("Passkey not found.".into()));
        }
        Ok(())
    }

    pub async fn create_challenge(
        &self,
        user_id: Option<Uuid>,
        purpose: &str,
        challenge_hash: &str,
        state: serde_json::Value,
        expires_at: DateTime<Utc>,
    ) -> Result<WebauthnChallenge, AppError> {
        let challenge = sqlx::query_as::<_, WebauthnChallenge>(
            r#"
            INSERT INTO webauthn_challenges (user_id, purpose, challenge_hash, state, expires_at)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, user_id, purpose, challenge_hash, state, expires_at, used_at, created_at
            "#,
        )
        .bind(user_id)
        .bind(purpose)
        .bind(challenge_hash)
        .bind(state)
        .bind(expires_at)
        .fetch_one(&self.pool)
        .await?;

        Ok(challenge)
    }

    pub async fn consume_challenge(&self, user_id: Uuid, challenge_id: Uuid, purpose: &str) -> Result<WebauthnChallenge, AppError> {
        let challenge = sqlx::query_as::<_, WebauthnChallenge>(
            r#"
            UPDATE webauthn_challenges
            SET used_at = NOW()
            WHERE id = $1
              AND user_id = $2
              AND purpose = $3
              AND used_at IS NULL
              AND expires_at > NOW()
            RETURNING id, user_id, purpose, challenge_hash, state, expires_at, used_at, created_at
            "#,
        )
        .bind(challenge_id)
        .bind(user_id)
        .bind(purpose)
        .fetch_optional(&self.pool)
        .await?
        .ok_or_else(|| AppError::Validation("WebAuthn challenge is invalid or expired".into()))?;

        Ok(challenge)
    }

    pub async fn peek_challenge_user_id(&self, challenge_id: Uuid, purpose: &str) -> Option<Uuid> {
        sqlx::query_scalar::<_, Uuid>(
            "SELECT user_id FROM webauthn_challenges WHERE id = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > NOW()"
        )
        .bind(challenge_id)
        .bind(purpose)
        .fetch_optional(&self.pool)
        .await
        .ok()
        .flatten()
    }

    pub async fn consume_challenge_by_id(&self, challenge_id: Uuid, purpose: &str) -> Result<WebauthnChallenge, AppError> {
        let challenge = sqlx::query_as::<_, WebauthnChallenge>(
            r#"
            UPDATE webauthn_challenges
            SET used_at = NOW()
            WHERE id = $1
              AND purpose = $2
              AND used_at IS NULL
              AND expires_at > NOW()
            RETURNING id, user_id, purpose, challenge_hash, state, expires_at, used_at, created_at
            "#,
        )
        .bind(challenge_id)
        .bind(purpose)
        .fetch_optional(&self.pool)
        .await?
        .ok_or_else(|| AppError::Validation("WebAuthn challenge is invalid or expired".into()))?;

        Ok(challenge)
    }
}
