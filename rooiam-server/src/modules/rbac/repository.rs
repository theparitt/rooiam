use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::shared::error::AppError;
use super::models::Role;

#[derive(Clone)]
pub struct RbacRepository {
    pool: PgPool,
}

impl RbacRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Retrieve all distinct permission codes a user has within a specific organization context.
    pub async fn get_user_permissions(&self, user_id: Uuid, organization_id: Uuid) -> Result<Vec<String>, AppError> {
        let records = sqlx::query(
            r#"
            SELECT DISTINCT p.code 
            FROM permissions p
            JOIN role_permissions rp ON p.id = rp.permission_id
            JOIN member_roles mr ON rp.role_id = mr.role_id
            JOIN organization_members om ON mr.member_id = om.id
            WHERE om.user_id = $1 AND om.organization_id = $2 AND om.status = 'active'
            "#
        )
        .bind(user_id)
        .bind(organization_id)
        .fetch_all(&self.pool)
        .await?;

        let codes = records.into_iter().map(|r| r.get("code")).collect();
        Ok(codes)
    }

    /// Retrieve the standard list of roles, potentially filtering out system ones or org-specific ones.
    pub async fn get_roles(&self, organization_id: Option<Uuid>) -> Result<Vec<Role>, AppError> {
        match organization_id {
            Some(org_id) => {
                let roles = sqlx::query_as::<_, Role>(
                    r#"
                    SELECT id, organization_id, code, name, is_system, created_at
                    FROM roles
                    WHERE organization_id = $1 OR is_system = true
                    ORDER BY name ASC
                    "#
                )
                .bind(org_id)
                .fetch_all(&self.pool)
                .await?;
                Ok(roles)
            }
            None => {
                let roles = sqlx::query_as::<_, Role>(
                    r#"
                    SELECT id, organization_id, code, name, is_system, created_at
                    FROM roles
                    WHERE is_system = true
                    ORDER BY name ASC
                    "#
                )
                .fetch_all(&self.pool)
                .await?;
                Ok(roles)
            }
        }
    }

    /// List all permissions available in the system.
    pub async fn list_permissions(&self) -> Result<Vec<super::models::Permission>, AppError> {
        let perms = sqlx::query_as::<_, super::models::Permission>(
            "SELECT id, code, description FROM permissions ORDER BY code ASC"
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(perms)
    }

    /// Create a custom (non-system) role scoped to an organization.
    pub async fn create_custom_role(
        &self,
        organization_id: Uuid,
        name: &str,
        code: &str,
        permission_codes: &[String],
    ) -> Result<super::models::Role, AppError> {
        let mut tx = self.pool.begin().await?;

        let role = sqlx::query_as::<_, super::models::Role>(
            r#"
            INSERT INTO roles (organization_id, code, name, is_system)
            VALUES ($1, $2, $3, false)
            RETURNING id, organization_id, code, name, is_system, created_at
            "#,
        )
        .bind(organization_id)
        .bind(code)
        .bind(name)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| {
            if e.to_string().contains("unique") || e.to_string().contains("duplicate") {
                crate::shared::error::AppError::Validation(format!("Role code '{}' already exists in this workspace.", code))
            } else {
                e.into()
            }
        })?;

        if !permission_codes.is_empty() {
            for perm_code in permission_codes {
                sqlx::query(
                    r#"
                    INSERT INTO role_permissions (role_id, permission_id)
                    SELECT $1, id FROM permissions WHERE code = $2
                    ON CONFLICT DO NOTHING
                    "#,
                )
                .bind(role.id)
                .bind(perm_code)
                .execute(&mut *tx)
                .await?;
            }
        }

        tx.commit().await?;
        Ok(role)
    }

    /// Delete a custom (non-system) role scoped to an organization.
    /// Returns false if the role does not exist or is a system role.
    pub async fn delete_custom_role(&self, organization_id: Uuid, role_id: Uuid) -> Result<bool, AppError> {
        let affected = sqlx::query(
            "DELETE FROM roles WHERE id = $1 AND organization_id = $2 AND is_system = false"
        )
        .bind(role_id)
        .bind(organization_id)
        .execute(&self.pool)
        .await?
        .rows_affected();
        Ok(affected > 0)
    }

    /// List permission codes assigned to a role.
    pub async fn get_role_permissions(&self, role_id: Uuid) -> Result<Vec<String>, AppError> {
        let codes = sqlx::query_scalar::<_, String>(
            r#"
            SELECT p.code FROM permissions p
            JOIN role_permissions rp ON rp.permission_id = p.id
            WHERE rp.role_id = $1
            ORDER BY p.code ASC
            "#,
        )
        .bind(role_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(codes)
    }

    /// Validates if a user holds a specific permission code in an organization.
    pub async fn has_permission(&self, user_id: Uuid, organization_id: Uuid, permission_code: &str) -> Result<bool, AppError> {
        let record = sqlx::query(
            r#"
            SELECT 1 
            FROM permissions p
            JOIN role_permissions rp ON p.id = rp.permission_id
            JOIN member_roles mr ON rp.role_id = mr.role_id
            JOIN organization_members om ON mr.member_id = om.id
            WHERE om.user_id = $1 AND om.organization_id = $2 AND om.status = 'active' AND p.code = $3
            LIMIT 1
            "#
        )
        .bind(user_id)
        .bind(organization_id)
        .bind(permission_code)
        .fetch_optional(&self.pool)
        .await?;

        Ok(record.is_some())
    }
}
