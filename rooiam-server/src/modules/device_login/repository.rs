use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use crate::shared::error::AppError;

use super::models::{DeviceLoginIntent, UserTrustedDevice};

#[derive(Clone)]
pub struct DeviceLoginRepository {
    pub(crate) pool: PgPool,
}

pub struct NewDeviceLoginIntent<'a> {
    pub public_id: Uuid,
    pub browser_binding_hash: &'a str,
    pub nonce_hash: &'a str,
    pub workspace_id: Option<Uuid>,
    pub oauth_client_id: Option<Uuid>,
    pub redirect_uri: Option<&'a str>,
    pub surface: Option<&'a str>,
    pub display_code: &'a str,
    pub match_number: i16,
    pub decoy_numbers: &'a [i16],
    pub requester_ip: Option<&'a str>,
    pub requester_user_agent: Option<&'a str>,
    pub expires_at: DateTime<Utc>,
}

impl DeviceLoginRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn create_trusted_device(
        &self,
        user_id: Uuid,
        device_label: &str,
        platform: &str,
        device_token_hash: &str,
        device_public_key: Option<&str>,
    ) -> Result<UserTrustedDevice, AppError> {
        let device = sqlx::query_as::<_, UserTrustedDevice>(
            r#"
            INSERT INTO user_trusted_devices (
                user_id,
                device_label,
                platform,
                device_token_hash,
                device_public_key
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, user_id, device_label, platform, device_token_hash, device_public_key,
                      push_token, last_seen_at, last_used_at, revoked_at, created_at
            "#,
        )
        .bind(user_id)
        .bind(device_label)
        .bind(platform)
        .bind(device_token_hash)
        .bind(device_public_key)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| {
            let message = e.to_string();
            if message.contains("user_trusted_devices_device_token_hash_key") {
                AppError::Conflict("This trusted device is already registered.".into())
            } else {
                AppError::Internal(format!("Failed to create trusted device: {}", e))
            }
        })?;

        Ok(device)
    }

    pub async fn list_trusted_devices(
        &self,
        user_id: Uuid,
    ) -> Result<Vec<UserTrustedDevice>, AppError> {
        let devices = sqlx::query_as::<_, UserTrustedDevice>(
            r#"
            SELECT id, user_id, device_label, platform, device_token_hash, device_public_key,
                   push_token, last_seen_at, last_used_at, revoked_at, created_at
            FROM user_trusted_devices
            WHERE user_id = $1
            ORDER BY created_at DESC
            "#,
        )
        .bind(user_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to list trusted devices: {}", e)))?;

        Ok(devices)
    }

    pub async fn revoke_trusted_device(
        &self,
        user_id: Uuid,
        device_id: Uuid,
    ) -> Result<bool, AppError> {
        let rows = sqlx::query(
            r#"
            UPDATE user_trusted_devices
            SET revoked_at = NOW()
            WHERE id = $1
              AND user_id = $2
              AND revoked_at IS NULL
            "#,
        )
        .bind(device_id)
        .bind(user_id)
        .execute(&self.pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to revoke trusted device: {}", e)))?
        .rows_affected();

        Ok(rows > 0)
    }

    pub async fn get_active_trusted_device_by_token_hash(
        &self,
        user_id: Uuid,
        device_token_hash: &str,
    ) -> Result<Option<UserTrustedDevice>, AppError> {
        let device = sqlx::query_as::<_, UserTrustedDevice>(
            r#"
            SELECT id, user_id, device_label, platform, device_token_hash, device_public_key,
                   push_token, last_seen_at, last_used_at, revoked_at, created_at
            FROM user_trusted_devices
            WHERE user_id = $1
              AND device_token_hash = $2
              AND revoked_at IS NULL
            "#,
        )
        .bind(user_id)
        .bind(device_token_hash)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to load trusted device: {}", e)))?;

        Ok(device)
    }

    pub async fn create_device_login_intent(
        &self,
        input: NewDeviceLoginIntent<'_>,
    ) -> Result<DeviceLoginIntent, AppError> {
        let intent = sqlx::query_as::<_, DeviceLoginIntent>(
            r#"
            INSERT INTO device_login_intents (
                public_id,
                browser_binding_hash,
                nonce_hash,
                workspace_id,
                oauth_client_id,
                redirect_uri,
                surface,
                display_code,
                match_number,
                decoy_numbers,
                status,
                requester_ip,
                requester_user_agent,
                expires_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11, $12, $13)
            RETURNING id, public_id, browser_binding_hash, nonce_hash, workspace_id, oauth_client_id,
                      redirect_uri, surface, display_code, match_number, decoy_numbers,
                      approved_user_id, approved_device_id, status, status_reason,
                      requester_ip, requester_user_agent, approved_at, consumed_at, expires_at, created_at
            "#,
        )
        .bind(input.public_id)
        .bind(input.browser_binding_hash)
        .bind(input.nonce_hash)
        .bind(input.workspace_id)
        .bind(input.oauth_client_id)
        .bind(input.redirect_uri)
        .bind(input.surface)
        .bind(input.display_code)
        .bind(input.match_number)
        .bind(input.decoy_numbers)
        .bind(input.requester_ip)
        .bind(input.requester_user_agent)
        .bind(input.expires_at)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to create device login intent: {}", e)))?;

        Ok(intent)
    }

    pub async fn get_oauth_client_internal_id(
        &self,
        public_client_id: &str,
    ) -> Result<Option<Uuid>, AppError> {
        sqlx::query_scalar::<_, Uuid>("SELECT id FROM oauth_clients WHERE client_id = $1 LIMIT 1")
            .bind(public_client_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to resolve OAuth client ID: {}", e)))
    }

    pub async fn resolve_redirect_target(
        &self,
        redirect_uri: &str,
    ) -> Result<Option<(Uuid, Uuid)>, AppError> {
        let row = sqlx::query_as::<_, (Uuid, Uuid)>(
            r#"
            SELECT c.id, c.org_id
            FROM oauth_client_redirect_uris r
            JOIN oauth_clients c ON c.id = r.oauth_client_id
            WHERE r.redirect_uri = $1
            LIMIT 1
            "#,
        )
        .bind(redirect_uri)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to resolve redirect target: {}", e)))?;

        Ok(row)
    }

    pub async fn get_device_login_intent_by_public_id(
        &self,
        public_id: Uuid,
    ) -> Result<Option<DeviceLoginIntent>, AppError> {
        let intent = sqlx::query_as::<_, DeviceLoginIntent>(
            r#"
            SELECT id, public_id, browser_binding_hash, nonce_hash, workspace_id, oauth_client_id,
                   redirect_uri, surface, display_code, match_number, decoy_numbers,
                   approved_user_id, approved_device_id, status, status_reason,
                   requester_ip, requester_user_agent, approved_at, consumed_at, expires_at, created_at
            FROM device_login_intents
            WHERE public_id = $1
            "#,
        )
        .bind(public_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to load device login intent: {}", e)))?;

        Ok(intent)
    }

    pub async fn get_browser_device_login_intent(
        &self,
        public_id: Uuid,
        nonce_hash: &str,
    ) -> Result<Option<DeviceLoginIntent>, AppError> {
        let intent = sqlx::query_as::<_, DeviceLoginIntent>(
            r#"
            SELECT id, public_id, browser_binding_hash, nonce_hash, workspace_id, oauth_client_id,
                   redirect_uri, surface, display_code, match_number, decoy_numbers,
                   approved_user_id, approved_device_id, status, status_reason,
                   requester_ip, requester_user_agent, approved_at, consumed_at, expires_at, created_at
            FROM device_login_intents
            WHERE public_id = $1
              AND nonce_hash = $2
            "#,
        )
        .bind(public_id)
        .bind(nonce_hash)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| {
            AppError::Internal(format!(
                "Failed to load browser device login intent: {}",
                e
            ))
        })?;

        Ok(intent)
    }

    pub async fn approve_device_login_intent(
        &self,
        public_id: Uuid,
        approved_user_id: Uuid,
        approved_device_id: Uuid,
    ) -> Result<Option<DeviceLoginIntent>, AppError> {
        let intent = sqlx::query_as::<_, DeviceLoginIntent>(
            r#"
            UPDATE device_login_intents
            SET approved_user_id = $2,
                approved_device_id = $3,
                status = 'approved',
                status_reason = NULL,
                approved_at = NOW()
            WHERE public_id = $1
              AND status = 'pending'
              AND consumed_at IS NULL
              AND expires_at > NOW()
            RETURNING id, public_id, browser_binding_hash, nonce_hash, workspace_id, oauth_client_id,
                      redirect_uri, surface, display_code, match_number, decoy_numbers,
                      approved_user_id, approved_device_id, status, status_reason,
                      requester_ip, requester_user_agent, approved_at, consumed_at, expires_at, created_at
            "#,
        )
        .bind(public_id)
        .bind(approved_user_id)
        .bind(approved_device_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to approve device login intent: {}", e)))?;

        Ok(intent)
    }

    pub async fn consume_approved_device_login_intent(
        &self,
        public_id: Uuid,
        nonce_hash: &str,
    ) -> Result<Option<DeviceLoginIntent>, AppError> {
        let intent = sqlx::query_as::<_, DeviceLoginIntent>(
            r#"
            UPDATE device_login_intents
            SET status = 'consumed',
                consumed_at = NOW()
            WHERE public_id = $1
              AND nonce_hash = $2
              AND status = 'approved'
              AND approved_user_id IS NOT NULL
              AND consumed_at IS NULL
              AND expires_at > NOW()
            RETURNING id, public_id, browser_binding_hash, nonce_hash, workspace_id, oauth_client_id,
                      redirect_uri, surface, display_code, match_number, decoy_numbers,
                      approved_user_id, approved_device_id, status, status_reason,
                      requester_ip, requester_user_agent, approved_at, consumed_at, expires_at, created_at
            "#,
        )
        .bind(public_id)
        .bind(nonce_hash)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to consume device login intent: {}", e)))?;

        Ok(intent)
    }

    pub async fn touch_trusted_device(&self, device_id: Uuid) -> Result<(), AppError> {
        sqlx::query(
            r#"
            UPDATE user_trusted_devices
            SET last_seen_at = NOW(),
                last_used_at = NOW()
            WHERE id = $1
            "#,
        )
        .bind(device_id)
        .execute(&self.pool)
        .await
        .map_err(|e| {
            AppError::Internal(format!("Failed to update trusted device activity: {}", e))
        })?;

        Ok(())
    }
}
