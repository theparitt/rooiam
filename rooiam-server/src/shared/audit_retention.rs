use sqlx::PgPool;

/// Spawn a background Tokio task that prunes old audit log rows once per day.
/// The retention period is read from `system_settings.audit_log_retention_days`.
/// A value of `"null"` or a missing row means logs are kept forever.
pub fn spawn_audit_retention_task(db: PgPool) {
    tokio::spawn(async move {
        loop {
            run_pruning_pass(&db).await;
            // Sleep 24 hours before the next pass
            tokio::time::sleep(tokio::time::Duration::from_secs(24 * 3600)).await;
        }
    });
}

async fn run_pruning_pass(db: &PgPool) {
    let retention_days = match read_retention_days(db).await {
        Ok(Some(days)) => days,
        Ok(None) => {
            tracing::debug!("audit_retention: no retention period configured, skipping prune");
            return;
        }
        Err(e) => {
            tracing::warn!("audit_retention: failed to read retention setting: {}", e);
            return;
        }
    };

    match sqlx::query("DELETE FROM audit_logs WHERE created_at < NOW() - ($1 || ' days')::INTERVAL")
        .bind(retention_days)
        .execute(db)
        .await
    {
        Ok(result) => {
            let deleted = result.rows_affected();
            if deleted > 0 {
                tracing::info!(
                    "audit_retention: pruned {} rows older than {} days",
                    deleted,
                    retention_days
                );
            } else {
                tracing::debug!(
                    "audit_retention: no rows to prune (retention={} days)",
                    retention_days
                );
            }
        }
        Err(e) => tracing::warn!("audit_retention: prune query failed: {}", e),
    }
}

/// Returns `Some(days)` if a positive integer is configured, `None` to skip pruning.
async fn read_retention_days(db: &PgPool) -> Result<Option<i32>, sqlx::Error> {
    let value: Option<String> = sqlx::query_scalar(
        "SELECT value FROM system_settings WHERE key = 'audit_log_retention_days'",
    )
    .fetch_optional(db)
    .await?;

    let raw = match value {
        Some(v) => v,
        None => return Ok(None),
    };

    if raw.trim() == "null" || raw.trim().is_empty() {
        return Ok(None);
    }

    match raw.trim().parse::<i32>() {
        Ok(days) if days > 0 => Ok(Some(days)),
        _ => {
            tracing::warn!(
                "audit_retention: invalid value {:?}, treating as no retention",
                raw
            );
            Ok(None)
        }
    }
}
