use sqlx::PgPool;
use uuid::Uuid;

/// Returns the ID of the platform org (is_platform_org = true), if it exists.
pub async fn get_platform_org_id(db: &PgPool) -> Option<Uuid> {
    sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM organizations WHERE is_platform_org = true LIMIT 1",
    )
    .fetch_optional(db)
    .await
    .ok()
    .flatten()
}
