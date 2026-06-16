use std::sync::OnceLock;

pub fn timing_logs_enabled() -> bool {
    static ENABLED: OnceLock<bool> = OnceLock::new();
    *ENABLED.get_or_init(|| {
        matches!(
            std::env::var("ROOIAM_TIMING_LOGS")
                .unwrap_or_default()
                .trim()
                .to_ascii_lowercase()
                .as_str(),
            "1" | "true" | "yes" | "on"
        )
    })
}

pub fn log_timing(scope: &str, elapsed_ms: u128, detail: impl AsRef<str>) {
    if timing_logs_enabled() {
        tracing::info!(
            "[timing] {} took {}ms | {}",
            scope,
            elapsed_ms,
            detail.as_ref()
        );
    }
}
