use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct Role {
    pub id: Uuid,
    pub organization_id: Option<Uuid>,
    pub code: String,
    pub name: String,
    pub is_system: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct Permission {
    pub id: Uuid,
    pub code: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct RolePermission {
    pub role_id: Uuid,
    pub permission_id: Uuid,
}

#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct MemberRole {
    pub member_id: Uuid,
    pub role_id: Uuid,
}
