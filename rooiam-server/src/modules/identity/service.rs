use super::models::User;
use super::repository::IdentityRepository;
use crate::shared::error::AppError;
use uuid::Uuid;

pub struct IdentityService {
    repo: IdentityRepository,
}

impl IdentityService {
    pub fn new(repo: IdentityRepository) -> Self {
        Self { repo }
    }

    pub async fn get_my_profile(&self, user_id: Uuid) -> Result<User, AppError> {
        self.repo.get_user_by_id(user_id).await
    }

    pub async fn update_my_profile(
        &self,
        user_id: Uuid,
        display_name: Option<String>,
        avatar_url: Option<String>,
    ) -> Result<User, AppError> {
        if display_name.is_none() && avatar_url.is_none() {
            return Err(AppError::Validation("Nothing to update".into()));
        }

        self.repo
            .update_user_profile(user_id, display_name, avatar_url)
            .await
    }
}
