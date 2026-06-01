use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use crate::shared::error::AppError;

use super::models::{MfaBackupCode, MfaChallenge, UserMfaMethod};

#[derive(Clone)]
pub struct MfaRepository {
    pool: PgPool,
}

impl MfaRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn get_totp_method(&self, user_id: Uuid) -> Result<Option<UserMfaMethod>, AppError> {
        let method = sqlx::query_as::<_, UserMfaMethod>(
            r#"
            SELECT id, user_id, method_type, secret_encrypted, is_primary, verified_at, created_at
            FROM user_mfa_methods
            WHERE user_id = $1 AND method_type = 'totp' AND verified_at IS NOT NULL
            "#,
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(method)
    }

    pub async fn upsert_totp_method(&self, user_id: Uuid, secret_encrypted: &str) -> Result<UserMfaMethod, AppError> {
        let method = sqlx::query_as::<_, UserMfaMethod>(
            r#"
            INSERT INTO user_mfa_methods (user_id, method_type, secret_encrypted, is_primary, verified_at)
            VALUES ($1, 'totp', $2, true, NOW())
            ON CONFLICT (user_id, method_type)
            DO UPDATE SET secret_encrypted = EXCLUDED.secret_encrypted,
                          is_primary = true,
                          verified_at = NOW()
            RETURNING id, user_id, method_type, secret_encrypted, is_primary, verified_at, created_at
            "#,
        )
        .bind(user_id)
        .bind(secret_encrypted)
        .fetch_one(&self.pool)
        .await?;

        Ok(method)
    }

    pub async fn delete_totp_method(&self, user_id: Uuid) -> Result<bool, AppError> {
        let deleted = sqlx::query("DELETE FROM user_mfa_methods WHERE user_id = $1 AND method_type = 'totp'")
            .bind(user_id)
            .execute(&self.pool)
            .await?
            .rows_affected();

        Ok(deleted > 0)
    }

    pub async fn create_challenge(
        &self,
        user_id: Uuid,
        session_id: Option<Uuid>,
        method_type: &str,
        purpose: &str,
        payload: serde_json::Value,
        expires_at: DateTime<Utc>,
    ) -> Result<MfaChallenge, AppError> {
        let challenge = sqlx::query_as::<_, MfaChallenge>(
            r#"
            INSERT INTO mfa_challenges (user_id, session_id, method_type, purpose, payload, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, user_id, session_id, method_type, purpose, payload, expires_at, used_at, created_at
            "#,
        )
        .bind(user_id)
        .bind(session_id)
        .bind(method_type)
        .bind(purpose)
        .bind(payload)
        .bind(expires_at)
        .fetch_one(&self.pool)
        .await?;

        Ok(challenge)
    }

    pub async fn get_valid_challenge(&self, challenge_id: Uuid, purpose: &str) -> Result<MfaChallenge, AppError> {
        let challenge = sqlx::query_as::<_, MfaChallenge>(
            r#"
            SELECT id, user_id, session_id, method_type, purpose, payload, expires_at, used_at, created_at
            FROM mfa_challenges
            WHERE id = $1
              AND purpose = $2
              AND used_at IS NULL
              AND expires_at > NOW()
            "#,
        )
        .bind(challenge_id)
        .bind(purpose)
        .fetch_optional(&self.pool)
        .await?
        .ok_or_else(|| AppError::Validation("MFA challenge is invalid or expired".into()))?;

        Ok(challenge)
    }

    pub async fn mark_challenge_used(&self, challenge_id: Uuid) -> Result<(), AppError> {
        sqlx::query("UPDATE mfa_challenges SET used_at = NOW() WHERE id = $1")
            .bind(challenge_id)
            .execute(&self.pool)
            .await?;

        Ok(())
    }

    pub async fn replace_backup_codes(&self, user_id: Uuid, code_hashes: &[String]) -> Result<(), AppError> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("DELETE FROM user_mfa_backup_codes WHERE user_id = $1")
            .bind(user_id)
            .execute(&mut *tx)
            .await?;

        for hash in code_hashes {
            sqlx::query(
                "INSERT INTO user_mfa_backup_codes (user_id, code_hash) VALUES ($1, $2)"
            )
            .bind(user_id)
            .bind(hash)
            .execute(&mut *tx)
            .await?;
        }

        tx.commit().await?;
        Ok(())
    }

    pub async fn count_remaining_backup_codes(&self, user_id: Uuid) -> Result<i64, AppError> {
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM user_mfa_backup_codes WHERE user_id = $1 AND used_at IS NULL"
        )
        .bind(user_id)
        .fetch_one(&self.pool)
        .await?;

        Ok(count)
    }

    pub async fn consume_backup_code(&self, user_id: Uuid, code_hash: &str) -> Result<Option<MfaBackupCode>, AppError> {
        let record = sqlx::query_as::<_, MfaBackupCode>(
            r#"
            UPDATE user_mfa_backup_codes
            SET used_at = NOW()
            WHERE user_id = $1
              AND code_hash = $2
              AND used_at IS NULL
            RETURNING id, user_id, code_hash, used_at, created_at
            "#
        )
        .bind(user_id)
        .bind(code_hash)
        .fetch_optional(&self.pool)
        .await?;

        Ok(record)
    }
}
