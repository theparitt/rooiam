use uuid::Uuid;
use crate::shared::error::AppError;
use super::repository::RbacRepository;
use super::models::Role;

#[derive(Clone)]
pub struct RbacService {
    repo: RbacRepository,
}

impl RbacService {
    pub fn new(repo: RbacRepository) -> Self {
        Self { repo }
    }

    pub async fn get_user_permissions(&self, user_id: Uuid, organization_id: Uuid) -> Result<Vec<String>, AppError> {
        self.repo.get_user_permissions(user_id, organization_id).await
    }

    pub async fn has_permission(&self, user_id: Uuid, organization_id: Uuid, permission_code: &str) -> Result<bool, AppError> {
        self.repo.has_permission(user_id, organization_id, permission_code).await
    }

    pub async fn get_available_roles(&self, organization_id: Uuid) -> Result<Vec<Role>, AppError> {
        let all = self.repo.get_roles(Some(organization_id)).await?;
        // owner is not assignable — it is transferred, not selected from a dropdown
        Ok(all.into_iter().filter(|r| !matches!(r.code.as_str(), "owner")).collect())
    }
}
