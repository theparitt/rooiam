use crate::bootstrap::config::AppConfig;
use crate::modules::identity::repository::IdentityRepository;
use crate::shared::error::AppError;
use reqwest::Client;
use serde::Deserialize;
use uuid::Uuid;

#[derive(Clone)]
pub struct OAuthService {
    identity_repo: IdentityRepository,
    config: AppConfig,
    http_client: Client,
}

#[derive(Clone, Debug)]
pub struct OAuthIdentity {
    pub provider: String,
    pub provider_user_id: String,
    pub email: Option<String>,
    pub email_verified: bool,
    pub name: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    #[serde(rename = "id_token")]
    _id_token: Option<String>,
}

#[derive(Deserialize)]
struct GoogleProfile {
    sub: String,
    email: Option<String>,
    email_verified: Option<bool>,
    name: Option<String>,
    picture: Option<String>,
}

#[derive(Deserialize)]
struct MicrosoftProfile {
    id: String,
    mail: Option<String>,
    #[serde(rename = "userPrincipalName")]
    user_principal_name: Option<String>,
    #[serde(rename = "displayName")]
    display_name: Option<String>,
}

impl OAuthService {
    pub fn new(identity_repo: IdentityRepository, config: AppConfig) -> Self {
        Self {
            identity_repo,
            config,
            http_client: Client::new(),
        }
    }

    pub async fn process_oauth_callback(
        &self,
        provider: &str,
        code: &str,
    ) -> Result<Uuid, AppError> {
        let identity = self.fetch_provider_identity(provider, code).await?;
        self.get_or_create_user_from_identity(identity).await
    }

    pub async fn fetch_provider_identity(
        &self,
        provider: &str,
        code: &str,
    ) -> Result<OAuthIdentity, AppError> {
        match provider {
            "google" => self.fetch_google_identity(code).await,
            "microsoft" => self.fetch_microsoft_identity(code).await,
            _ => Err(AppError::Validation(format!(
                "Unsupported provider: {}",
                provider
            ))),
        }
    }

    async fn fetch_google_identity(&self, code: &str) -> Result<OAuthIdentity, AppError> {
        // Exchange code for token
        let token_resp = self
            .http_client
            .post("https://oauth2.googleapis.com/token")
            .form(&[
                ("code", code),
                ("client_id", &self.config.oauth.google_client_id),
                ("client_secret", &self.config.oauth.google_client_secret),
                ("redirect_uri", &self.config.oauth.google_redirect_uri),
                ("grant_type", "authorization_code"),
            ])
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("Google token exchange failed: {}", e)))?;

        if !token_resp.status().is_success() {
            let err_text = token_resp.text().await.unwrap_or_default();
            tracing::error!("Google OAuth token error: {}", err_text);
            return Err(AppError::Validation(
                "Failed to exchange Google authorization code".into(),
            ));
        }

        let token_data: TokenResponse = token_resp
            .json()
            .await
            .map_err(|_| AppError::Internal("Invalid token response from Google".into()))?;

        // Fetch user profile using access token
        let profile_resp = self
            .http_client
            .get("https://www.googleapis.com/oauth2/v3/userinfo")
            .bearer_auth(&token_data.access_token)
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("Google profile fetch failed: {}", e)))?;

        if !profile_resp.status().is_success() {
            return Err(AppError::Validation(
                "Failed to fetch Google profile".into(),
            ));
        }

        let profile: GoogleProfile = profile_resp
            .json()
            .await
            .map_err(|_| AppError::Internal("Invalid profile response from Google".into()))?;

        Ok(OAuthIdentity {
            provider: "google".into(),
            provider_user_id: profile.sub,
            email: profile.email,
            email_verified: profile.email_verified.unwrap_or(false),
            name: profile.name,
            avatar_url: profile.picture,
        })
    }

    async fn fetch_microsoft_identity(&self, code: &str) -> Result<OAuthIdentity, AppError> {
        let token_url = format!(
            "https://login.microsoftonline.com/{}/oauth2/v2.0/token",
            self.config.oauth.microsoft_tenant_id
        );

        let token_resp = self
            .http_client
            .post(&token_url)
            .form(&[
                ("code", code),
                ("client_id", &self.config.oauth.microsoft_client_id),
                ("client_secret", &self.config.oauth.microsoft_client_secret),
                ("redirect_uri", &self.config.oauth.microsoft_redirect_uri),
                ("grant_type", "authorization_code"),
            ])
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("Microsoft token exchange failed: {}", e)))?;

        if !token_resp.status().is_success() {
            let err_text = token_resp.text().await.unwrap_or_default();
            tracing::error!("Microsoft OAuth token error: {}", err_text);
            return Err(AppError::Validation(
                "Failed to exchange the Microsoft authorization code.".into(),
            ));
        }

        let token_data: TokenResponse = token_resp
            .json()
            .await
            .map_err(|_| AppError::Internal("Invalid token response from Microsoft".into()))?;

        // Fetch user profile
        let profile_resp = self
            .http_client
            .get("https://graph.microsoft.com/v1.0/me")
            .bearer_auth(&token_data.access_token)
            .send()
            .await
            .map_err(|e| AppError::Internal(format!("Microsoft profile fetch failed: {}", e)))?;

        if !profile_resp.status().is_success() {
            let err_text = profile_resp.text().await.unwrap_or_default();
            tracing::error!("Microsoft OAuth profile error: {}", err_text);
            return Err(AppError::Validation(
                "Failed to fetch the Microsoft profile.".into(),
            ));
        }

        let profile: MicrosoftProfile = profile_resp
            .json()
            .await
            .map_err(|_| AppError::Internal("Invalid profile response from Microsoft".into()))?;

        // Try to construct avatar URL if needed, but Graph API requires a different call for photo, so skip for now
        // `mail` may be absent and `userPrincipalName` is not always a verified mailbox.
        // Keep it for display/storage, but do not trust it for automatic account linking.
        let email = profile.mail.or(profile.user_principal_name);

        Ok(OAuthIdentity {
            provider: "microsoft".into(),
            provider_user_id: profile.id,
            email,
            email_verified: false,
            name: profile.display_name,
            avatar_url: None,
        })
    }

    pub async fn get_or_create_user_from_identity(
        &self,
        identity: OAuthIdentity,
    ) -> Result<Uuid, AppError> {
        let provider = identity.provider.as_str();
        let provider_user_id = identity.provider_user_id.as_str();
        let email = identity.email;
        let email_verified = identity.email_verified;
        let name = identity.name;
        let avatar_url = identity.avatar_url;
        // 1. Check if external identity exists
        if let Some(user_id) = self
            .identity_repo
            .get_user_id_by_external_identity(provider, provider_user_id)
            .await?
        {
            return Ok(user_id);
        }

        // 2. If an email is provided, check if a user with that email already exists
        if email_verified {
            if let Some(ref e) = email {
                if let Some(existing_user_id) = self.identity_repo.get_user_id_by_email(e).await? {
                    // Link external identity to existing user
                    self.identity_repo
                        .link_external_identity(existing_user_id, provider, provider_user_id, email)
                        .await?;
                    // Backfill avatar_url if the existing user doesn't have one yet
                    if avatar_url.is_some() {
                        let _ = self
                            .identity_repo
                            .update_user_profile(existing_user_id, None, avatar_url)
                            .await;
                    }
                    return Ok(existing_user_id);
                }
            }
        }

        // 3. User completely new, create them
        let new_user_id = self
            .identity_repo
            .create_user_with_external_identity(
                provider,
                provider_user_id,
                email,
                email_verified,
                name,
                avatar_url,
            )
            .await?;

        Ok(new_user_id)
    }
}
