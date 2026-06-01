use sqlx::PgPool;
use uuid::Uuid;
use chrono::{DateTime, Utc};
use crate::shared::error::AppError;
use super::models::Session;

const USER_SESSION_LIST_LIMIT: i64 = 100;

#[derive(Clone)]
pub struct SessionRepository {
    pool: PgPool,
}

impl SessionRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Store a newly generated session into the Postgres backend safely
    pub async fn create_session(
        &self,
        session_id: Uuid,
        user_id: Uuid,
        session_secret_hash: &str,
        expires_at: DateTime<Utc>,
        current_org_id: Option<Uuid>,
        login_surface: Option<&str>,
        login_app_name: Option<&str>,
        login_workspace_slug: Option<&str>,
        user_agent: Option<&str>,
        ip: Option<std::net::IpAddr>,
    ) -> Result<Session, AppError> {
        let fingerprint = crate::shared::session_fingerprint::compute(user_agent, ip);
        let session = sqlx::query_as::<sqlx::Postgres, Session>(
            r#"
            INSERT INTO sessions (id, user_id, current_org_id, login_surface, login_app_name, login_workspace_slug, session_secret_hash, expires_at, user_agent, ip, session_fingerprint)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING id, user_id, current_org_id, login_surface, login_app_name, login_workspace_slug, session_secret_hash, user_agent, ip, last_seen_at, expires_at, revoked_at, created_at, session_fingerprint
            "#,
        )
        .bind(session_id)
        .bind(user_id)
        .bind(current_org_id)
        .bind(login_surface)
        .bind(login_app_name)
        .bind(login_workspace_slug)
        .bind(session_secret_hash)
        .bind(expires_at)
        .bind(user_agent)
        .bind(ip)
        .bind(&fingerprint)
        .fetch_one(&self.pool)
        .await?;

        Ok(session)
    }

    /// Retrieve an unrevoked, non-expired session for authentication middleware.
    /// Also returns the user's is_superuser flag so the middleware can apply
    /// the correct IP policy without an extra round-trip.
    pub async fn get_valid_session(
        &self,
        session_id: Uuid,
    ) -> Result<(Session, bool), AppError> {
        let row = sqlx::query(
            r#"
            SELECT s.id, s.user_id, s.current_org_id, s.login_surface, s.login_app_name, s.login_workspace_slug, s.session_secret_hash, s.user_agent, s.ip, s.last_seen_at, s.expires_at, s.revoked_at, s.created_at, s.session_fingerprint,
                   u.is_superuser
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.id = $1
              AND s.revoked_at IS NULL
              AND s.expires_at > NOW()
              AND u.status = 'active'
            "#,
        )
        .bind(session_id)
        .fetch_optional(&self.pool)
        .await?
        .ok_or(AppError::Unauthorized)?;

        use sqlx::Row;
        let session = Session {
            id: row.get("id"),
            user_id: row.get("user_id"),
            current_org_id: row.get("current_org_id"),
            login_surface: row.get("login_surface"),
            login_app_name: row.get("login_app_name"),
            login_workspace_slug: row.get("login_workspace_slug"),
            session_secret_hash: row.get("session_secret_hash"),
            user_agent: row.get("user_agent"),
            ip: row.get("ip"),
            last_seen_at: row.get("last_seen_at"),
            expires_at: row.get("expires_at"),
            revoked_at: row.get("revoked_at"),
            created_at: row.get("created_at"),
            session_fingerprint: row.get("session_fingerprint"),
        };
        let is_superuser: bool = row.get("is_superuser");

        Ok((session, is_superuser))
    }

    pub async fn ensure_user_active(&self, user_id: Uuid) -> Result<(), AppError> {
        let status = sqlx::query_scalar::<_, Option<String>>(
            "SELECT status FROM users WHERE id = $1"
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?
        .flatten()
        .ok_or_else(|| AppError::NotFound("User not found".into()))?;

        if status != "active" {
            return Err(AppError::Forbidden("This account is not active.".into()));
        }

        Ok(())
    }

    pub async fn revoke_session(&self, session_id: Uuid) -> Result<(), AppError> {
        sqlx::query(
            "UPDATE sessions SET revoked_at = NOW() WHERE id = $1"
        )
        .bind(session_id)
        .execute(&self.pool)
        .await?;

        // Cascade: revoke any OIDC refresh tokens issued for this session
        sqlx::query(
            "UPDATE oauth_refresh_tokens SET revoked_at = NOW() WHERE session_id = $1 AND revoked_at IS NULL"
        )
        .bind(session_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn revoke_sessions_by_user_id(&self, user_id: Uuid, except_session_id: Option<Uuid>) -> Result<u64, AppError> {
        let affected = if let Some(except_session_id) = except_session_id {
            sqlx::query(
                "UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW() AND id != $2"
            )
            .bind(user_id)
            .bind(except_session_id)
            .execute(&self.pool)
            .await?
            .rows_affected()
        } else {
            sqlx::query(
                "UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()"
            )
            .bind(user_id)
            .execute(&self.pool)
            .await?
            .rows_affected()
        };

        // Cascade: revoke OIDC refresh tokens for all revoked sessions
        sqlx::query(
            "UPDATE oauth_refresh_tokens SET revoked_at = NOW() \
             WHERE user_id = $1 AND revoked_at IS NULL \
             AND (session_id IS NULL OR session_id != $2)"
        )
        .bind(user_id)
        .bind(except_session_id)
        .execute(&self.pool)
        .await?;

        Ok(affected)
    }

    pub async fn touch_session(
        &self,
        session_id: Uuid,
        user_agent: Option<&str>,
        ip: Option<std::net::IpAddr>,
    ) -> Result<(), AppError> {
        sqlx::query(
            r#"
            UPDATE sessions
            SET last_seen_at = NOW(),
                user_agent = COALESCE($2, user_agent),
                ip = COALESCE($3, ip)
            WHERE id = $1
            "#
        )
        .bind(session_id)
        .bind(user_agent)
        .bind(ip)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    /// Fetch user-agents of recent active sessions (excluding the given session), used for suspicious login detection.
    pub async fn get_recent_session_user_agents(
        &self,
        user_id: Uuid,
        exclude_session_id: Uuid,
    ) -> Result<Vec<Option<String>>, AppError> {
        let rows: Vec<(Option<String>,)> = sqlx::query_as(
            r#"
            SELECT user_agent FROM sessions
            WHERE user_id = $1
              AND id != $2
              AND expires_at > NOW()
            ORDER BY created_at DESC
            LIMIT 20
            "#,
        )
        .bind(user_id)
        .bind(exclude_session_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(|(ua,)| ua).collect())
    }

    /// Revoke the oldest active sessions for a user in a given org context, keeping only `keep` most recent.
    pub async fn revoke_oldest_sessions_for_org(
        &self,
        user_id: Uuid,
        org_id: Uuid,
        keep: i64,
    ) -> Result<u64, AppError> {
        let affected = sqlx::query(
            r#"
            UPDATE sessions SET revoked_at = NOW()
            WHERE id IN (
                SELECT id FROM sessions
                WHERE user_id = $1
                  AND current_org_id = $2
                  AND revoked_at IS NULL
                  AND expires_at > NOW()
                ORDER BY created_at ASC
                LIMIT GREATEST(0, (
                    SELECT COUNT(*) FROM sessions
                    WHERE user_id = $1
                      AND current_org_id = $2
                      AND revoked_at IS NULL
                      AND expires_at > NOW()
                ) - $3)
            )
            "#,
        )
        .bind(user_id)
        .bind(org_id)
        .bind(keep)
        .execute(&self.pool)
        .await?
        .rows_affected();

        // Cascade: revoke OIDC refresh tokens for sessions that were just revoked
        sqlx::query(
            "UPDATE oauth_refresh_tokens SET revoked_at = NOW() \
             WHERE revoked_at IS NULL AND session_id IN ( \
                SELECT id FROM sessions WHERE user_id = $1 AND current_org_id = $2 AND revoked_at IS NOT NULL \
             )"
        )
        .bind(user_id)
        .bind(org_id)
        .execute(&self.pool)
        .await?;

        Ok(affected)
    }

    pub async fn get_sessions_by_user_id(&self, user_id: Uuid) -> Result<Vec<Session>, AppError> {
        let sessions = sqlx::query_as::<sqlx::Postgres, Session>(
            r#"
            SELECT id, user_id, current_org_id, login_surface, login_app_name, login_workspace_slug, session_secret_hash, user_agent, ip, last_seen_at, expires_at, revoked_at, created_at, session_fingerprint
            FROM sessions
            WHERE user_id = $1
              AND revoked_at IS NULL
              AND expires_at > NOW()
            ORDER BY last_seen_at DESC
            LIMIT $2
            "#,
        )
        .bind(user_id)
        .bind(USER_SESSION_LIST_LIMIT)
        .fetch_all(&self.pool)
        .await?;

        Ok(sessions)
    }
}
