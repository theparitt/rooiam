//! Transactional workspace ownership handoff. The organization row serializes
//! initiation and acceptance, including concurrent requests for the same token.
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use crate::shared::error::AppError;

pub async fn initiate(
    db: &PgPool,
    org_id: Uuid,
    from_user_id: Uuid,
    to_user_id: Uuid,
    token_hash: &str,
    expires_at: DateTime<Utc>,
) -> Result<(), AppError> {
    if from_user_id == to_user_id {
        return Err(AppError::Validation(
            "Cannot transfer ownership to yourself.".into(),
        ));
    }
    let mut tx = db.begin().await?;
    lock_workspace(&mut tx, org_id).await?;
    if !is_active_owner(&mut tx, org_id, from_user_id).await? {
        return Err(AppError::Forbidden(
            "Only the workspace owner can transfer ownership.".into(),
        ));
    }
    if !is_active_member(&mut tx, org_id, to_user_id).await? {
        return Err(AppError::Validation(
            "The target user must be an active member of this workspace.".into(),
        ));
    }
    sqlx::query("UPDATE owner_transfer_requests SET cancelled_at = NOW() WHERE organization_id = $1 AND accepted_at IS NULL AND cancelled_at IS NULL")
        .bind(org_id).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO owner_transfer_requests (organization_id, from_user_id, to_user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4, $5)")
        .bind(org_id).bind(from_user_id).bind(to_user_id).bind(token_hash).bind(expires_at)
        .execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(())
}

/// Returns the previous owner's user ID for audit logging.
pub async fn accept(
    db: &PgPool,
    org_id: Uuid,
    to_user_id: Uuid,
    token_hash: &str,
) -> Result<Uuid, AppError> {
    let mut tx = db.begin().await?;
    lock_workspace(&mut tx, org_id).await?;

    let record: Option<(Uuid, Uuid, Uuid, DateTime<Utc>, Option<DateTime<Utc>>, Option<DateTime<Utc>>)> = sqlx::query_as(
        "SELECT id, from_user_id, to_user_id, expires_at, accepted_at, cancelled_at FROM owner_transfer_requests WHERE organization_id = $1 AND token_hash = $2 FOR UPDATE"
    ).bind(org_id).bind(token_hash).fetch_optional(&mut *tx).await?;
    let (request_id, from_user_id, target_user_id, expires_at, accepted_at, cancelled_at) =
        record.ok_or_else(|| AppError::NotFound("Invalid or expired transfer token.".into()))?;
    if target_user_id != to_user_id {
        return Err(AppError::Forbidden(
            "This transfer is addressed to a different user.".into(),
        ));
    }
    if accepted_at.is_some() || cancelled_at.is_some() || expires_at <= Utc::now() {
        return Err(AppError::Validation(
            "This transfer is no longer pending.".into(),
        ));
    }
    if !is_active_owner(&mut tx, org_id, from_user_id).await?
        || !is_active_member(&mut tx, org_id, to_user_id).await?
    {
        return Err(AppError::Forbidden(
            "The owner or target is no longer an active workspace member.".into(),
        ));
    }

    let owner_role: Uuid = sqlx::query_scalar(
        "SELECT id FROM roles WHERE code = 'owner' AND is_system = true LIMIT 1",
    )
    .fetch_one(&mut *tx)
    .await?;
    let admin_role: Uuid = sqlx::query_scalar(
        "SELECT id FROM roles WHERE code = 'admin' AND is_system = true LIMIT 1",
    )
    .fetch_one(&mut *tx)
    .await?;
    let from_member: Uuid = sqlx::query_scalar("SELECT id FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active'")
        .bind(org_id).bind(from_user_id).fetch_one(&mut *tx).await?;
    let to_member: Uuid = sqlx::query_scalar("SELECT id FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active'")
        .bind(org_id).bind(to_user_id).fetch_one(&mut *tx).await?;

    let removed = sqlx::query("DELETE FROM member_roles WHERE member_id = $1 AND role_id = $2")
        .bind(from_member)
        .bind(owner_role)
        .execute(&mut *tx)
        .await?
        .rows_affected();
    if removed != 1 {
        return Err(AppError::Forbidden(
            "The initiating user is no longer the workspace owner.".into(),
        ));
    }
    sqlx::query(
        "INSERT INTO member_roles (member_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    )
    .bind(from_member)
    .bind(admin_role)
    .execute(&mut *tx)
    .await?;
    // Replace only system role assignments. Custom workspace roles are retained.
    sqlx::query("DELETE FROM member_roles mr USING roles r WHERE mr.member_id = $1 AND mr.role_id = r.id AND r.is_system = true AND r.code <> 'owner'")
        .bind(to_member).execute(&mut *tx).await?;
    sqlx::query(
        "INSERT INTO member_roles (member_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    )
    .bind(to_member)
    .bind(owner_role)
    .execute(&mut *tx)
    .await?;
    sqlx::query("UPDATE owner_transfer_requests SET accepted_at = NOW() WHERE id = $1")
        .bind(request_id)
        .execute(&mut *tx)
        .await?;
    // An owner-scoped integration key cannot survive its creator losing ownership.
    sqlx::query("UPDATE tenant_api_keys SET revoked = TRUE WHERE org_id = $1 AND created_by = $2 AND permission_preset IN ('workspace_owner', 'owner_full') AND revoked = FALSE")
        .bind(org_id).bind(from_user_id).execute(&mut *tx).await?;
    // Existing sessions must not retain stale role-sensitive context.
    sqlx::query("UPDATE sessions SET revoked_at = NOW() WHERE current_org_id = $1 AND user_id IN ($2, $3) AND revoked_at IS NULL")
        .bind(org_id).bind(from_user_id).bind(to_user_id).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(from_user_id)
}

async fn lock_workspace(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    org_id: Uuid,
) -> Result<(), AppError> {
    let found: Option<Uuid> = sqlx::query_scalar(
        "SELECT id FROM organizations WHERE id = $1 AND status = 'active' AND platform_locked = FALSE FOR UPDATE",
    )
    .bind(org_id)
    .fetch_optional(&mut **tx)
    .await?;
    found.ok_or_else(|| AppError::NotFound("Active workspace not found.".into()))?;
    Ok(())
}

async fn is_active_owner(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    org_id: Uuid,
    user_id: Uuid,
) -> Result<bool, AppError> {
    Ok(sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM organization_members om JOIN member_roles mr ON mr.member_id = om.id JOIN roles r ON r.id = mr.role_id WHERE om.organization_id = $1 AND om.user_id = $2 AND om.status = 'active' AND r.code = 'owner')")
        .bind(org_id).bind(user_id).fetch_one(&mut **tx).await?)
}

async fn is_active_member(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    org_id: Uuid,
    user_id: Uuid,
) -> Result<bool, AppError> {
    Ok(sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active')")
        .bind(org_id).bind(user_id).fetch_one(&mut **tx).await?)
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn member(db: &PgPool, org: Uuid, role: &str) -> Uuid {
        let user: Uuid = sqlx::query_scalar("INSERT INTO users DEFAULT VALUES RETURNING id")
            .fetch_one(db)
            .await
            .unwrap();
        let member_id: Uuid = sqlx::query_scalar("INSERT INTO organization_members (organization_id, user_id) VALUES ($1, $2) RETURNING id")
            .bind(org).bind(user).fetch_one(db).await.unwrap();
        sqlx::query("INSERT INTO member_roles (member_id, role_id) SELECT $1, id FROM roles WHERE code = $2 AND is_system = true")
            .bind(member_id).bind(role).execute(db).await.unwrap();
        user
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn ownership_handoff_is_scoped_single_use_and_updates_real_roles(db: PgPool) {
        let org: Uuid = sqlx::query_scalar(
            "INSERT INTO organizations (name, slug) VALUES ('A', 'owner-transfer-a') RETURNING id",
        )
        .fetch_one(&db)
        .await
        .unwrap();
        let other_org: Uuid = sqlx::query_scalar(
            "INSERT INTO organizations (name, slug) VALUES ('B', 'owner-transfer-b') RETURNING id",
        )
        .fetch_one(&db)
        .await
        .unwrap();
        let owner = member(&db, org, "owner").await;
        let target = member(&db, org, "member").await;
        let outsider = member(&db, other_org, "owner").await;
        let owner_key: Uuid = sqlx::query_scalar("INSERT INTO tenant_api_keys (org_id, created_by, label, key_hash, key_prefix, permission_preset) VALUES ($1, $2, 'old owner', 'owner-transfer-test-key', 'oldowner', 'workspace_owner') RETURNING id")
            .bind(org).bind(owner).fetch_one(&db).await.unwrap();
        let expiry = Utc::now() + chrono::Duration::hours(1);

        assert!(initiate(&db, org, target, owner, "not-owner", expiry)
            .await
            .is_err());
        assert!(initiate(&db, org, owner, outsider, "outsider", expiry)
            .await
            .is_err());
        initiate(&db, org, owner, target, "valid-token", expiry)
            .await
            .unwrap();
        assert!(accept(&db, other_org, outsider, "valid-token")
            .await
            .is_err());
        assert!(accept(&db, org, owner, "valid-token").await.is_err());
        assert_eq!(
            accept(&db, org, target, "valid-token").await.unwrap(),
            owner
        );
        assert!(accept(&db, org, target, "valid-token").await.is_err());

        let old_owner: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM organization_members om JOIN member_roles mr ON mr.member_id = om.id JOIN roles r ON r.id = mr.role_id WHERE om.organization_id = $1 AND om.user_id = $2 AND r.code = 'owner')")
            .bind(org).bind(owner).fetch_one(&db).await.unwrap();
        let new_owner: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM organization_members om JOIN member_roles mr ON mr.member_id = om.id JOIN roles r ON r.id = mr.role_id WHERE om.organization_id = $1 AND om.user_id = $2 AND r.code = 'owner')")
            .bind(org).bind(target).fetch_one(&db).await.unwrap();
        assert!(!old_owner);
        assert!(new_owner);
        let key_revoked: bool =
            sqlx::query_scalar("SELECT revoked FROM tenant_api_keys WHERE id = $1")
                .bind(owner_key)
                .fetch_one(&db)
                .await
                .unwrap();
        assert!(key_revoked);
        assert!(initiate(&db, org, owner, target, "former-owner", expiry)
            .await
            .is_err());
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn newer_request_cancels_old_and_inactive_target_cannot_accept(db: PgPool) {
        let org: Uuid = sqlx::query_scalar(
            "INSERT INTO organizations (name, slug) VALUES ('A', 'owner-transfer-c') RETURNING id",
        )
        .fetch_one(&db)
        .await
        .unwrap();
        let owner = member(&db, org, "owner").await;
        let target = member(&db, org, "member").await;
        let expiry = Utc::now() + chrono::Duration::hours(1);
        initiate(&db, org, owner, target, "old", expiry)
            .await
            .unwrap();
        initiate(&db, org, owner, target, "new", expiry)
            .await
            .unwrap();
        assert!(accept(&db, org, target, "old").await.is_err());
        sqlx::query("UPDATE organization_members SET status = 'suspended' WHERE organization_id = $1 AND user_id = $2")
            .bind(org).bind(target).execute(&db).await.unwrap();
        assert!(accept(&db, org, target, "new").await.is_err());
    }
}
