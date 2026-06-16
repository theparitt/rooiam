use std::time::Duration;

use chrono::{SecondsFormat, Utc};
use serde::Serialize;

const SERVICE_NAME: &str = "rooiam-server";
const PROJECT_SLUG: &str = "rooiam";
const INTERFACE_VERSION: &str = "1";
const SERVICE_ENVIRONMENT_VAR: &str = "ROOIAM_SERVICE_ENVIRONMENT";
const MEERKATEER_ENABLED_VAR: &str = "ROOIAM_MEERKATEER_ENABLED";
const MEERKATEER_INGEST_URL_VAR: &str = "ROOIAM_MEERKATEER_INGEST_URL";
const MEERKATEER_SERVICE_KEY_VAR: &str = "ROOIAM_MEERKATEER_SERVICE_KEY";
const MEERKATEER_TIMEOUT_MS_VAR: &str = "ROOIAM_MEERKATEER_TIMEOUT_MS";
const MEERKATEER_HEARTBEAT_INTERVAL_SECONDS_VAR: &str =
    "ROOIAM_MEERKATEER_HEARTBEAT_INTERVAL_SECONDS";
const DEFAULT_SERVICE_ENVIRONMENT: &str = "development";
const DEFAULT_TIMEOUT_MS: u64 = 3000;
const DEFAULT_HEARTBEAT_INTERVAL_SECONDS: u64 = 60;
const VERSION: &str = env!("CARGO_PKG_VERSION");
const GIT_SHA: Option<&str> = option_env!("ROOIAM_GIT_SHA");

#[derive(Clone)]
struct PushConfig {
    ingest_url: String,
    service_key: String,
    environment: String,
    timeout: Duration,
    heartbeat_interval: Duration,
}

#[derive(Serialize)]
struct HeartbeatPayload<'a> {
    interface_version: &'a str,
    service: &'a str,
    project: &'a str,
    environment: &'a str,
    status: &'a str,
    message: &'a str,
    timestamp: String,
}

#[derive(Serialize)]
struct EventPayload<'a> {
    interface_version: &'a str,
    service: &'a str,
    project: &'a str,
    environment: &'a str,
    level: &'a str,
    kind: &'a str,
    message: &'a str,
    count: u64,
    timestamp: String,
}

#[derive(Serialize)]
struct DeployPayload<'a> {
    interface_version: &'a str,
    service: &'a str,
    project: &'a str,
    environment: &'a str,
    version: &'a str,
    commit: &'a str,
    status: &'a str,
    timestamp: String,
}

pub fn push_capabilities_enabled() -> bool {
    load_push_config().is_some()
}

pub fn spawn_heartbeat_task() {
    let Some(config) = load_push_config() else {
        return;
    };

    tokio::spawn(async move {
        loop {
            send_heartbeat(&config).await;
            tokio::time::sleep(config.heartbeat_interval).await;
        }
    });
}

pub async fn send_deploy_status(status: &'static str) {
    let Some(config) = load_push_config() else {
        return;
    };

    let payload = DeployPayload {
        interface_version: INTERFACE_VERSION,
        service: SERVICE_NAME,
        project: PROJECT_SLUG,
        environment: &config.environment,
        version: VERSION,
        commit: GIT_SHA.unwrap_or("unknown"),
        status,
        timestamp: current_timestamp(),
    };

    post_json(&config, "deploy", &payload).await;
}

pub async fn send_event(level: &'static str, kind: &'static str, message: &str, count: u64) {
    let Some(config) = load_push_config() else {
        return;
    };

    let payload = EventPayload {
        interface_version: INTERFACE_VERSION,
        service: SERVICE_NAME,
        project: PROJECT_SLUG,
        environment: &config.environment,
        level,
        kind,
        message: sanitize_message(message),
        count,
        timestamp: current_timestamp(),
    };

    post_json(&config, "event", &payload).await;
}

fn load_push_config() -> Option<PushConfig> {
    if !env_flag(MEERKATEER_ENABLED_VAR, false) {
        return None;
    }

    let ingest_url = std::env::var(MEERKATEER_INGEST_URL_VAR).ok()?;
    let service_key = std::env::var(MEERKATEER_SERVICE_KEY_VAR).ok()?;
    if ingest_url.trim().is_empty() || service_key.trim().is_empty() {
        return None;
    }

    Some(PushConfig {
        ingest_url: ingest_url.trim().trim_end_matches('/').to_string(),
        service_key: service_key.trim().to_string(),
        environment: service_environment(),
        timeout: Duration::from_millis(env_u64(MEERKATEER_TIMEOUT_MS_VAR, DEFAULT_TIMEOUT_MS)),
        heartbeat_interval: Duration::from_secs(env_u64(
            MEERKATEER_HEARTBEAT_INTERVAL_SECONDS_VAR,
            DEFAULT_HEARTBEAT_INTERVAL_SECONDS,
        )),
    })
}

async fn send_heartbeat(config: &PushConfig) {
    let payload = HeartbeatPayload {
        interface_version: INTERFACE_VERSION,
        service: SERVICE_NAME,
        project: PROJECT_SLUG,
        environment: &config.environment,
        status: "ok",
        message: "heartbeat",
        timestamp: current_timestamp(),
    };

    post_json(config, "heartbeat", &payload).await;
}

async fn post_json<T: Serialize>(config: &PushConfig, path: &str, payload: &T) {
    let url = format!("{}/v1/ingest/{path}", config.ingest_url);
    let client = reqwest::Client::new();

    match client
        .post(&url)
        .bearer_auth(&config.service_key)
        .json(payload)
        .timeout(config.timeout)
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => {
            tracing::debug!(
                target = "meerkateer",
                endpoint = path,
                status = %response.status(),
                "Meerkateer push delivered"
            );
        }
        Ok(response) => {
            tracing::warn!(
                target = "meerkateer",
                endpoint = path,
                status = %response.status(),
                "Meerkateer push returned non-success status"
            );
        }
        Err(error) => {
            tracing::warn!(
                target = "meerkateer",
                endpoint = path,
                error = %error,
                "Meerkateer push failed"
            );
        }
    }
}

fn current_timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}

fn service_environment() -> String {
    match std::env::var(SERVICE_ENVIRONMENT_VAR) {
        Ok(value) => match value.trim() {
            "development" | "staging" | "production" | "test" | "local" => value.trim().to_string(),
            _ => DEFAULT_SERVICE_ENVIRONMENT.to_string(),
        },
        Err(_) => DEFAULT_SERVICE_ENVIRONMENT.to_string(),
    }
}

fn env_flag(key: &str, default: bool) -> bool {
    std::env::var(key)
        .ok()
        .map(|value| {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
        .unwrap_or(default)
}

fn env_u64(key: &str, default: u64) -> u64 {
    std::env::var(key)
        .ok()
        .and_then(|value| value.trim().parse::<u64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(default)
}

fn sanitize_message(message: &str) -> &str {
    let trimmed = message.trim();
    if trimmed.is_empty() {
        "event"
    } else {
        trimmed
    }
}
