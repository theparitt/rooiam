use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct MagicLink {
    pub id: Uuid,
    pub email: String,
    // Note: NEVER serialised directly
    #[serde(skip)]
    pub token_hash: String,
    pub purpose: String,
    pub redirect_uri: Option<String>,
    pub surface: Option<String>,
    pub code_challenge: Option<String>,
    pub code_challenge_method: Option<String>,
    pub expires_at: DateTime<Utc>,
    pub used_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}
