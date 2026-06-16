use serde::{Deserialize, Serialize};

use crate::shared::error::AppError;

const ADMIN_LIST_DEFAULT_PAGE_SIZE: i64 = 20;
const ADMIN_LIST_MAX_PAGE_SIZE: i64 = 1000;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct AdminListQuery {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
    pub search: Option<String>,
    pub role: Option<String>,
    pub scope: Option<String>,
    pub action: Option<String>,
    pub date_from: Option<String>,
    pub date_to: Option<String>,
}

#[derive(Serialize)]
pub(super) struct PaginatedResponse<T> {
    pub items: Vec<T>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
}

pub(super) fn normalize_page(query: &AdminListQuery) -> Result<i64, AppError> {
    let page = query.page.unwrap_or(1);
    if page < 1 {
        return Err(AppError::Validation(
            "page must be greater than or equal to 1.".into(),
        ));
    }
    Ok(page)
}

pub(super) fn normalize_page_size(query: &AdminListQuery) -> Result<i64, AppError> {
    let page_size = query.page_size.unwrap_or(ADMIN_LIST_DEFAULT_PAGE_SIZE);
    if !(1..=ADMIN_LIST_MAX_PAGE_SIZE).contains(&page_size) {
        return Err(AppError::Validation(format!(
            "page_size must be between 1 and {ADMIN_LIST_MAX_PAGE_SIZE}."
        )));
    }
    Ok(page_size)
}

pub(super) fn normalize_search(query: &AdminListQuery) -> String {
    query.search.as_deref().unwrap_or("").trim().to_lowercase()
}
