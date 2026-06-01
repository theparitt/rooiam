use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct UserPasskey {
    pub id: Uuid,
    pub user_id: Uuid,
    pub credential_id: String,
    pub public_key: String,
    pub sign_count: i64,
    pub transports: serde_json::Value,
    pub aaguid: Option<Uuid>,
    pub name: String,
    pub credential: serde_json::Value,
    pub last_used_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct WebauthnChallenge {
    pub id: Uuid,
    pub user_id: Option<Uuid>,
    pub purpose: String,
    pub challenge_hash: String,
    pub state: serde_json::Value,
    pub expires_at: DateTime<Utc>,
    pub used_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}
