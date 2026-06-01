use chrono::{Duration, Utc};
use sha2::{Digest, Sha256};
use url::Url;
use uuid::Uuid;
use webauthn_rs::prelude::{
    CreationChallengeResponse, Passkey, PasskeyAuthentication, PasskeyRegistration, PublicKeyCredential,
    RegisterPublicKeyCredential, RequestChallengeResponse, Webauthn, WebauthnBuilder,
};

use crate::bootstrap::config::AppConfig;
use crate::modules::identity::repository::IdentityRepository;
use crate::shared::auth_context::is_registered_oauth_redirect_uri;
use crate::shared::auth_policy::{ensure_auth_method_allowed_for_workspace_id, AuthMethod};
use crate::shared::error::AppError;
use crate::shared::redirect::{is_first_party_public_redirect_uri, is_relative_redirect_uri, normalize_redirect_uri};

use super::{
    models::{UserPasskey, WebauthnChallenge},
    repository::{NewPasskey, WebauthnRepository},
};

pub struct WebauthnService {
    repo: WebauthnRepository,
    identity_repo: IdentityRepository,
    config: AppConfig,
}

pub struct RegistrationStartResult {
    pub challenge: WebauthnChallenge,
    pub options: CreationChallengeResponse,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct LoginState {
    authentication: PasskeyAuthentication,
    redirect_uri: Option<String>,
    workspace_id: Option<Uuid>,
    surface: Option<String>,
}

pub struct AuthenticationStartResult {
    pub challenge: WebauthnChallenge,
    pub options: RequestChallengeResponse,
}

pub struct AuthenticationFinishResult {
    pub user_id: Uuid,
    pub redirect_uri: Option<String>,
    pub workspace_id: Option<Uuid>,
    pub surface: Option<String>,
}

impl WebauthnService {
    pub fn new(repo: WebauthnRepository, identity_repo: IdentityRepository, config: AppConfig) -> Self {
        Self { repo, identity_repo, config }
    }

    pub async fn list_my_passkeys(&self, user_id: Uuid) -> Result<Vec<UserPasskey>, AppError> {
        self.repo.list_passkeys_by_user_id(user_id).await
    }

    pub async fn delete_my_passkey(&self, user_id: Uuid, passkey_id: Uuid) -> Result<(), AppError> {
        let deleted = self.repo.delete_passkey(user_id, passkey_id).await?;
        if !deleted {
            return Err(AppError::NotFound("Passkey not found".into()));
        }

        Ok(())
    }

    pub async fn start_registration(&self, user_id: Uuid) -> Result<RegistrationStartResult, AppError> {
        let identity = self.identity_repo.get_webauthn_identity(user_id).await?;
        let existing_passkeys = self.repo.list_passkeys_by_user_id(user_id).await?;
        let exclude_credentials: Vec<_> = existing_passkeys
            .into_iter()
            .filter_map(|record| serde_json::from_value::<Passkey>(record.credential).ok())
            .map(|passkey| passkey.cred_id().clone())
            .collect();

        let webauthn = self.build_webauthn()?;
        let (options, state) = webauthn
            .start_passkey_registration(
                identity.id,
                &identity.email,
                &identity.display_name,
                Some(exclude_credentials),
            )
            .map_err(|e| AppError::Internal(format!("Failed to start passkey registration: {}", e)))?;

        let state_json = serde_json::to_value(&state)
            .map_err(|e| AppError::Internal(format!("Failed to serialize passkey registration state: {}", e)))?;
        let challenge_hash = hex::encode(Sha256::digest(
            serde_json::to_string(&options)
                .map_err(|e| AppError::Internal(format!("Failed to encode registration challenge: {}", e)))?
                .as_bytes(),
        ));

        let challenge = self.repo.create_challenge(
            Some(user_id),
            "register",
            &challenge_hash,
            state_json,
            Utc::now() + Duration::minutes(10),
        ).await?;

        Ok(RegistrationStartResult { challenge, options })
    }

    pub async fn finish_registration(
        &self,
        user_id: Uuid,
        challenge_id: Uuid,
        name: String,
        credential: serde_json::Value,
    ) -> Result<UserPasskey, AppError> {
        let stored = self.repo.consume_challenge(user_id, challenge_id, "register").await?;
        let state: PasskeyRegistration = serde_json::from_value(stored.state)
            .map_err(|e| AppError::Internal(format!("Failed to deserialize registration state: {}", e)))?;
        let registration: RegisterPublicKeyCredential = serde_json::from_value(credential)
            .map_err(|e| AppError::Validation(format!("Invalid passkey credential payload: {}", e)))?;

        let webauthn = self.build_webauthn()?;
        let passkey = webauthn
            .finish_passkey_registration(&registration, &state)
            .map_err(|e| AppError::Validation(format!("Passkey registration failed: {}", e)))?;

        let credential_id = serde_json::to_string(passkey.cred_id())
            .map_err(|e| AppError::Internal(format!("Failed to serialize credential id: {}", e)))?;

        if self.repo.get_passkey_by_credential_id(&credential_id).await?.is_some() {
            return Err(AppError::Conflict("This passkey is already enrolled".into()));
        }

        let credential_json = serde_json::to_value(&passkey)
            .map_err(|e| AppError::Internal(format!("Failed to serialize passkey: {}", e)))?;

        self.repo.create_passkey(NewPasskey {
            user_id,
            credential_id,
            public_key: serde_json::to_string(&credential_json).unwrap_or_default(),
            sign_count: 0,
            transports: serde_json::json!([]),
            aaguid: None,
            name: name.trim().to_string(),
            credential: credential_json,
        }).await
    }

    pub async fn start_authentication(
        &self,
        email: String,
        redirect_uri: Option<String>,
        workspace_id: Option<Uuid>,
        surface: Option<String>,
    ) -> Result<AuthenticationStartResult, AppError> {
        ensure_auth_method_allowed_for_workspace_id(self.repo.pool(), workspace_id, redirect_uri.as_deref(), AuthMethod::Passkey).await?;

        let normalized_email = email.trim().to_lowercase();
        let user_id = self.identity_repo
            .get_user_id_by_email(&normalized_email)
            .await?
            .ok_or_else(|| AppError::Validation("No passkey is enrolled for that email".into()))?;

        let passkeys = self.repo.list_passkeys_by_user_id(user_id).await?;
        if passkeys.is_empty() {
            return Err(AppError::Validation("No passkey is enrolled for that email".into()));
        }

        let passkeys: Vec<Passkey> = passkeys
            .into_iter()
            .map(|record| {
                serde_json::from_value(record.credential)
                    .map_err(|e| AppError::Internal(format!("Failed to load stored passkey: {}", e)))
            })
            .collect::<Result<_, _>>()?;

        let webauthn = self.build_webauthn()?;
        let (options, state) = webauthn
            .start_passkey_authentication(&passkeys)
            .map_err(|e| AppError::Internal(format!("Failed to start passkey authentication: {}", e)))?;

        let redirect_uri = normalize_redirect_uri(redirect_uri)?;
        if let Some(uri) = redirect_uri.as_deref() {
            if !is_relative_redirect_uri(uri)
                && !is_first_party_public_redirect_uri(uri)
                && !is_registered_oauth_redirect_uri(self.repo.pool(), uri).await?
            {
                return Err(AppError::Validation(
                    "This app callback is not allowed. Use a registered app redirect_uri or a first-party Rooiam URL.".into(),
                ));
            }
        }
        let state_json = serde_json::to_value(LoginState { authentication: state, redirect_uri: redirect_uri.clone(), workspace_id, surface })
            .map_err(|e| AppError::Internal(format!("Failed to serialize passkey login state: {}", e)))?;
        let challenge_hash = hex::encode(Sha256::digest(
            serde_json::to_string(&options)
                .map_err(|e| AppError::Internal(format!("Failed to encode authentication challenge: {}", e)))?
                .as_bytes(),
        ));

        let challenge = self.repo.create_challenge(
            Some(user_id),
            "login",
            &challenge_hash,
            state_json,
            Utc::now() + Duration::minutes(10),
        ).await?;

        Ok(AuthenticationStartResult { challenge, options })
    }

    pub async fn finish_authentication(
        &self,
        challenge_id: Uuid,
        credential: serde_json::Value,
    ) -> Result<AuthenticationFinishResult, AppError> {
        let stored = self.repo.consume_challenge_by_id(challenge_id, "login").await?;
        let user_id = stored.user_id.ok_or_else(|| AppError::Internal("Missing WebAuthn challenge user".into()))?;
        let state: LoginState = serde_json::from_value(stored.state)
            .map_err(|e| AppError::Internal(format!("Failed to deserialize passkey authentication state: {}", e)))?;
        let assertion: PublicKeyCredential = serde_json::from_value(credential)
            .map_err(|e| AppError::Validation(format!("Invalid passkey assertion payload: {}", e)))?;

        let webauthn = self.build_webauthn()?;
        let result = webauthn
            .finish_passkey_authentication(&assertion, &state.authentication)
            .map_err(|e| AppError::Validation(format!("Passkey authentication failed: {}", e)))?;

        let credential_id = serde_json::to_string(result.cred_id())
            .map_err(|e| AppError::Internal(format!("Failed to serialize credential id: {}", e)))?;
        let record = self.repo
            .get_passkey_by_credential_id(&credential_id)
            .await?
            .ok_or_else(|| AppError::Validation("Passkey credential not found".into()))?;

        let mut passkey: Passkey = serde_json::from_value(record.credential)
            .map_err(|e| AppError::Internal(format!("Failed to deserialize stored passkey: {}", e)))?;
        let _ = passkey.update_credential(&result);
        let passkey_json = serde_json::to_value(&passkey)
            .map_err(|e| AppError::Internal(format!("Failed to serialize updated passkey: {}", e)))?;

        self.repo
            .update_passkey_after_auth(&credential_id, passkey_json, i64::from(result.counter()))
            .await?;

        Ok(AuthenticationFinishResult {
            user_id,
            redirect_uri: state.redirect_uri,
            workspace_id: state.workspace_id,
            surface: state.surface,
        })
    }

    fn build_webauthn(&self) -> Result<Webauthn, AppError> {
        let origin = Url::parse(&self.config.webauthn.origin)
            .map_err(|e| AppError::Internal(format!("Invalid WebAuthn origin: {}", e)))?;

        let mut builder = WebauthnBuilder::new(&self.config.webauthn.rp_id, &origin)
            .map_err(|e| AppError::Internal(format!("Failed to configure WebAuthn: {}", e)))?;
        builder = builder.rp_name(&self.config.webauthn.rp_name);

        if self.config.webauthn.allow_any_port {
            builder = builder.allow_any_port(true);
        }

        for extra_origin in &self.config.webauthn.extra_origins {
            let parsed = Url::parse(extra_origin)
                .map_err(|e| AppError::Internal(format!("Invalid WebAuthn extra origin: {}", e)))?;
            builder = builder.append_allowed_origin(&parsed);
        }

        builder
            .build()
            .map_err(|e| AppError::Internal(format!("Failed to build WebAuthn instance: {}", e)))
    }
}
