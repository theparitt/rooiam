use actix_web::{web, HttpResponse};
use serde::{Serialize, Deserialize};
use sqlx::FromRow;
use uuid::Uuid;
use chrono::{DateTime, Utc};
use crate::bootstrap::state::AppState;
use crate::shared::error::AppError;
use crate::http::middleware::auth::{extract_session, RequireAuth};
use crate::shared::oauth_client::{generate_client_id, generate_confidential_client_secret, normalize_client_redirect_uris};
use crate::shared::request_ip::client_ip_string_from_http_request;

const MY_CLIENT_LIST_LIMIT: i64 = 100;
const CLIENT_REDIRECT_URI_LIMIT: i64 = 25;

#[derive(Serialize, Deserialize, FromRow)]
#[serde(deny_unknown_fields)]
pub struct OAuthClient {
    pub id: Uuid,
    pub client_id: String,
    pub app_name: String,
    pub app_type: String, // 'web', 'spa', 'native'
    pub status: String,
    pub owner_user_id: Option<Uuid>,
    pub is_first_party: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Serialize)]
pub struct ClientResponse {
    pub client: OAuthClient,
    pub redirect_uris: Vec<String>,
    pub client_secret: Option<String>, // Only returned on creation
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateClientRequest {
    pub app_name: String,
    pub app_type: String,
    pub redirect_uris: Vec<String>,
}

#[derive(Serialize)]
pub struct RotateClientSecretResponse {
    pub client_id: String,
    pub client_secret: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateClientStatusRequest {
    pub status: String,
}

pub async fn list_my_clients(
    req: actix_web::HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;

    let clients = sqlx::query_as::<_, OAuthClient>(
        "SELECT id, client_id, app_name, app_type, status, owner_user_id, is_first_party, created_at FROM oauth_clients WHERE owner_user_id = $1 ORDER BY created_at DESC LIMIT $2"
    )
    .bind(session.user_id)
    .bind(MY_CLIENT_LIST_LIMIT)
    .fetch_all(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load OAuth clients: {}", e)))?;

    let mut responses = Vec::with_capacity(clients.len());
    for client in clients {
        let redirect_uris = sqlx::query_scalar::<_, String>(
            "SELECT redirect_uri FROM oauth_client_redirect_uris WHERE oauth_client_id = $1 ORDER BY redirect_uri LIMIT $2"
        )
        .bind(client.id)
        .bind(CLIENT_REDIRECT_URI_LIMIT)
        .fetch_all(&state.db)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to load OAuth client redirect URIs: {}", e)))?;

        responses.push(ClientResponse {
            client,
            redirect_uris,
            client_secret: None,
        });
    }

    Ok(HttpResponse::Ok().json(responses))
}

pub async fn create_client(
    req: actix_web::HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<CreateClientRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;

    if body.app_name.trim().is_empty() {
        return Err(AppError::Validation("App name is required.".into()));
    }
    if !["web", "spa", "native"].contains(&body.app_type.as_str()) {
        return Err(AppError::Validation("app_type must be web, spa, or native.".into()));
    }
    let redirect_uris = normalize_client_redirect_uris(&body.app_type, &body.redirect_uris)?;

    let client_id = generate_client_id();
    let mut client_secret = None;
    let mut client_secret_hash = None;
    if body.app_type == "web" {
        let (secret, hash) = generate_confidential_client_secret()?;
        client_secret = Some(secret.clone());
        client_secret_hash = Some(hash);
    }

    let mut tx = state
        .db
        .begin()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to start OAuth client creation transaction: {}", e)))?;

    let client = sqlx::query_as::<_, OAuthClient>(
        r#"
        INSERT INTO oauth_clients (client_id, client_secret_hash, app_name, app_type, status, owner_user_id, is_first_party)
        VALUES ($1, $2, $3, $4, 'active', $5, false)
        RETURNING id, client_id, app_name, app_type, status, owner_user_id, is_first_party, created_at
        "#
    )
    .bind(&client_id)
    .bind(&client_secret_hash)
    .bind(body.app_name.trim())
    .bind(&body.app_type)
    .bind(session.user_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to create OAuth client: {}", e)))?;

    // Insert Redirect URIs
    for uri in &redirect_uris {
        sqlx::query("INSERT INTO oauth_client_redirect_uris (oauth_client_id, redirect_uri) VALUES ($1, $2)")
            .bind(client.id)
            .bind(uri)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to save OAuth client redirect URI: {}", e)))?;
    }

    tx.commit()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to commit OAuth client creation: {}", e)))?;

    // Audit log
    crate::modules::audit::service::AuditService::new(state.db.clone()).log(
        crate::modules::audit::service::AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: None,
            action: "oauth_client.created".into(),
            target_type: "oauth_client".into(),
            target_id: Some(client.id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
            metadata: serde_json::json!({ "app_name": client.app_name }),
        }
    ).await;

    Ok(HttpResponse::Created().json(ClientResponse {
        client,
        redirect_uris,
        client_secret,
    }))
}

pub async fn rotate_client_secret(
    req: actix_web::HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let client_id = path.into_inner();

    let client = sqlx::query_as::<_, OAuthClient>(
        "SELECT id, client_id, app_name, app_type, status, owner_user_id, is_first_party, created_at FROM oauth_clients WHERE id = $1 AND owner_user_id = $2"
    )
    .bind(client_id)
    .bind(session.user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load OAuth client for secret rotation: {}", e)))?
    .ok_or_else(|| AppError::NotFound("Client not found.".into()))?;

    if client.app_type != "web" {
        return Err(AppError::Validation("Only confidential web clients can rotate a client secret.".into()));
    }
    if client.status != "active" {
        return Err(AppError::Validation("Paused clients cannot rotate a client secret until resumed.".into()));
    }

    let (client_secret, client_secret_hash) = generate_confidential_client_secret()?;

    sqlx::query("UPDATE oauth_clients SET client_secret_hash = $1 WHERE id = $2")
        .bind(&client_secret_hash)
        .bind(client.id)
        .execute(&state.db)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to rotate the OAuth client secret: {}", e)))?;

    crate::modules::audit::service::AuditService::new(state.db.clone()).log(
        crate::modules::audit::service::AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: None,
            action: "oauth_client.secret_rotated".into(),
            target_type: "oauth_client".into(),
            target_id: Some(client.id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
            metadata: serde_json::json!({ "app_name": client.app_name }),
        }
    ).await;

    Ok(HttpResponse::Ok().json(RotateClientSecretResponse {
        client_id: client.client_id,
        client_secret,
    }))
}

pub async fn update_client_status(
    req: actix_web::HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
    body: web::Json<UpdateClientStatusRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let client_id = path.into_inner();
    let normalized_status = body.status.trim().to_lowercase();

    if normalized_status != "active" && normalized_status != "suspended" {
        return Err(AppError::Validation("Status must be either 'active' or 'suspended'.".into()));
    }

    let client = sqlx::query_as::<_, OAuthClient>(
        "SELECT id, client_id, app_name, app_type, status, owner_user_id, is_first_party, created_at FROM oauth_clients WHERE id = $1 AND owner_user_id = $2"
    )
    .bind(client_id)
    .bind(session.user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load OAuth client for status update: {}", e)))?
    .ok_or_else(|| AppError::NotFound("Client not found.".into()))?;

    let updated = sqlx::query_as::<_, OAuthClient>(
        "UPDATE oauth_clients SET status = $1 WHERE id = $2 RETURNING id, client_id, app_name, app_type, status, owner_user_id, is_first_party, created_at"
    )
    .bind(&normalized_status)
    .bind(client.id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to update the OAuth client status: {}", e)))?;

    crate::modules::audit::service::AuditService::new(state.db.clone()).log(
        crate::modules::audit::service::AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: None,
            action: if normalized_status == "active" {
                "oauth_client.resumed".into()
            } else {
                "oauth_client.suspended".into()
            },
            target_type: "oauth_client".into(),
            target_id: Some(client.id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
            metadata: serde_json::json!({ "app_name": updated.app_name }),
        }
    ).await;

    Ok(HttpResponse::Ok().json(updated))
}

pub fn routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/clients")
            .wrap(RequireAuth)
            .route("", web::get().to(list_my_clients))
            .route("", web::post().to(create_client))
            .route("/{id}/rotate-secret", web::post().to(rotate_client_secret))
            .route("/{id}/status", web::patch().to(update_client_status))
    );
}
