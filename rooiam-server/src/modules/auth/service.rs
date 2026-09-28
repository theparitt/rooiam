use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::{rngs::OsRng, RngCore};
use sha2::{Digest, Sha256};
use url::Url;

use super::repository::AuthRepository;
use crate::shared::auth_context::resolve_allowed_login_redirect_uri;
use crate::shared::auth_policy::{ensure_auth_method_allowed, AuthMethod};
use crate::shared::error::AppError;
use crate::shared::runtime_config::effective_issuer_url;

pub struct AuthService {
    repo: AuthRepository,
}

impl AuthService {
    pub fn new(repo: AuthRepository) -> Self {
        Self { repo }
    }

    /// Entrypoint for the Magic Link Flow
    pub async fn start_magic_link(
        &self,
        email: String,
        redirect_uri: Option<String>,
        surface: Option<String>,
        _redis: &mut redis::aio::ConnectionManager,
    ) -> Result<(), AppError> {
        let redirect_uri = resolve_allowed_login_redirect_uri(&self.repo.pool, redirect_uri).await?;
        let org = ensure_auth_method_allowed(
            &self.repo.pool,
            redirect_uri.as_deref(),
            AuthMethod::MagicLink,
        )
        .await?;

        let mut bytes = [0u8; 32];
        OsRng.fill_bytes(&mut bytes);

        // 1. Generate Raw Token
        let raw_token = URL_SAFE_NO_PAD.encode(bytes);

        // 2. Hash it securely
        let mut hasher = Sha256::new();
        hasher.update(raw_token.as_bytes());
        let hash_hex = hex::encode(hasher.finalize());

        // 3. Expiry — org override first, then platform system_settings, default 15 min
        let platform_expiry_minutes: i64 = sqlx::query_scalar(
            "SELECT value::bigint FROM system_settings WHERE key = 'magic_link_expiry_minutes'",
        )
        .fetch_optional(&self.repo.pool)
        .await
        .ok()
        .flatten()
        .unwrap_or(15);

        let normalized_surface = surface.clone().unwrap_or_else(|| "user".to_string());
        let tenant_expiry_minutes: i64 = sqlx::query_scalar(
            "SELECT value::bigint FROM system_settings WHERE key = 'tenant_magic_link_expiry_minutes'"
        )
        .fetch_optional(&self.repo.pool)
        .await
        .ok()
        .flatten()
        .unwrap_or(platform_expiry_minutes);

        let expiry_minutes: i64 = if normalized_surface == "tenant" {
            tenant_expiry_minutes
        } else {
            org.as_ref()
                .and_then(|o| o.magic_link_expiry_minutes)
                .map(|v| v as i64)
                .unwrap_or(platform_expiry_minutes)
        };

        let expiry = chrono::Utc::now() + chrono::Duration::minutes(expiry_minutes);

        // 4. Save to Database
        let normalized_email = email.trim().to_lowercase();
        self.repo
            .create_magic_link(
                &normalized_email,
                &hash_hex,
                expiry,
                redirect_uri.clone(),
                Some(normalized_surface.clone()),
            )
            .await?;

        // 5. Fire off email
        let surface = normalized_surface;
        let issuer_url = effective_issuer_url(&self.repo.pool).await?;
        let verify_url = format!(
            "{}/v1/auth/magic-link/verify",
            issuer_url.trim_end_matches('/')
        );
        let mut full_link = Url::parse(&verify_url).map_err(|e| {
            AppError::Internal(format!("Invalid magic-link destination URL: {}", e))
        })?;

        {
            let mut query = full_link.query_pairs_mut();
            query.append_pair("token", &raw_token);
        }

        tracing::debug!("Magic link dispatched to {}", normalized_email);

        crate::infra::email::send_magic_link_email(
            &self.repo.pool,
            &normalized_email,
            full_link.as_ref(),
            redirect_uri.as_deref(),
            Some(surface.as_str()),
        )
        .await
        .map_err(|e| {
            tracing::error!(
                email = %normalized_email,
                surface = %surface,
                "Failed to send magic-link email: {}",
                e
            );
            AppError::External(
                "We could not send the magic-link email right now. Please try again.".into(),
            )
        })?;

        // Note: We could use `redis` here to enforce rate limiting / spam protection
        Ok(())
    }

    /// Verification Flow
    pub async fn verify_magic_link(
        &self,
        raw_token: &str,
    ) -> Result<super::models::MagicLink, AppError> {
        // Hash incoming value precisely identically to how it was stored
        let mut hasher = Sha256::new();
        hasher.update(raw_token.as_bytes());
        let hash_hex = hex::encode(hasher.finalize());

        // Extract metadata securely, preventing replay attacks
        let link = self.repo.get_valid_magic_link(&hash_hex).await?;
        self.repo.mark_magic_link_used(link.id).await?;

        // Note: This returns control to the handler, which will logically pass it onto
        // IdentityService to register/find the `User` and SessionService to craft the Session
        Ok(link)
    }
}
