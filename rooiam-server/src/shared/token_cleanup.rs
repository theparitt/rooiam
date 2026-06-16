use sqlx::PgPool;

/// Spawn a background Tokio task that deletes expired/used tokens every hour.
/// Tables cleaned: magic_links, email_change_tokens, account_deletion_tokens,
/// webauthn_challenges, mfa_challenges, oauth_authorization_codes.
/// All deletes are soft — only rows that are already expired or used are removed.
/// Never touches active tokens.
pub fn spawn_token_cleanup_task(db: PgPool) {
    tokio::spawn(async move {
        loop {
            run_cleanup_pass(&db).await;
            tokio::time::sleep(tokio::time::Duration::from_secs(3600)).await;
        }
    });
}

async fn run_cleanup_pass(db: &PgPool) {
    let tables: &[(&str, &str)] = &[
        ("magic_links", "expires_at < NOW() OR used_at IS NOT NULL"),
        (
            "email_change_tokens",
            "expires_at < NOW() OR used_at IS NOT NULL",
        ),
        (
            "account_deletion_tokens",
            "expires_at < NOW() OR used_at IS NOT NULL",
        ),
        (
            "webauthn_challenges",
            "expires_at < NOW() OR used_at IS NOT NULL",
        ),
        (
            "mfa_challenges",
            "expires_at < NOW() OR used_at IS NOT NULL",
        ),
        (
            "oauth_authorization_codes",
            "expires_at < NOW() OR used_at IS NOT NULL",
        ),
    ];

    let mut total: u64 = 0;

    for (table, condition) in tables {
        let query = format!("DELETE FROM {} WHERE {}", table, condition);
        match sqlx::query(&query).execute(db).await {
            Ok(result) => total += result.rows_affected(),
            Err(e) => tracing::warn!("token_cleanup: failed to clean {}: {}", table, e),
        }
    }

    if total > 0 {
        tracing::info!("token_cleanup: removed {} expired/used token rows", total);
    } else {
        tracing::debug!("token_cleanup: nothing to clean");
    }
}
