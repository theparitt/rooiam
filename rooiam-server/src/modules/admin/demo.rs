use crate::shared::demo_seed::{seeded_demo_emails, seeded_demo_org_slugs};

pub(super) fn demo_email_filter() -> &'static [&'static str] {
    seeded_demo_emails()
}

pub(super) fn demo_org_slug_filter() -> &'static [&'static str] {
    seeded_demo_org_slugs()
}

pub(super) fn is_demo_email_visible(email: &str) -> bool {
    demo_email_filter().contains(&email)
}

pub(super) fn is_demo_org_slug_visible(slug: &str) -> bool {
    demo_org_slug_filter().contains(&slug)
}

pub(super) fn is_demo_client_visible(
    owner_email: Option<&str>,
    organization_slug: Option<&str>,
) -> bool {
    owner_email.is_some_and(is_demo_email_visible)
        || organization_slug.is_some_and(is_demo_org_slug_visible)
}
