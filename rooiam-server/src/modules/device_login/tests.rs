use actix_web::{http::StatusCode, test as actix_test, web, App};
use chrono::Utc;
use serde_json::json;
use uuid::Uuid;

use super::handlers::{
    self, RegisterTrustedDeviceRequest, StartDeviceLoginRequest, TrustedDeviceResponse,
};
use super::models::TrustedDevicePlatform;
use super::service::{
    build_browser_binding_hash, build_qr_value, generate_display_code, generate_number_challenge,
    hash_browser_nonce, hash_device_token, validate_device_label, validate_platform,
};

#[test]
fn device_label_is_trimmed() {
    let label = validate_device_label("  Pixel 8 Pro  ").unwrap();
    assert_eq!(label, "Pixel 8 Pro");
}

#[test]
fn device_label_cannot_be_empty() {
    let error = validate_device_label("   ").unwrap_err();
    assert!(error.to_string().contains("Device label is required"));
}

#[test]
fn platform_accepts_android_and_ios() {
    assert_eq!(
        validate_platform("android").unwrap().as_str(),
        TrustedDevicePlatform::Android.as_str()
    );
    assert_eq!(
        validate_platform("IOS").unwrap().as_str(),
        TrustedDevicePlatform::Ios.as_str()
    );
}

#[test]
fn platform_rejects_unknown_values() {
    let error = validate_platform("windows-phone").unwrap_err();
    assert!(error.to_string().contains("Platform must be one of"));
}

#[test]
fn token_hash_requires_minimum_length() {
    let error = hash_device_token("short").unwrap_err();
    assert!(error.to_string().contains("at least 16 characters"));
}

#[test]
fn token_hash_is_stable() {
    let one = hash_device_token("abcdefghijklmnopqrstuvwxyz").unwrap();
    let two = hash_device_token("abcdefghijklmnopqrstuvwxyz").unwrap();
    assert_eq!(one, two);
    assert_eq!(one.len(), 64);
}

#[test]
fn display_code_is_six_digits() {
    let code = generate_display_code();
    assert_eq!(code.len(), 6);
    assert!(code.chars().all(|ch| ch.is_ascii_digit()));
}

#[test]
fn number_challenge_has_three_unique_choices_including_match_number() {
    let challenge = generate_number_challenge();
    assert_eq!(challenge.choices.len(), 3);
    assert!(challenge.choices.contains(&challenge.match_number));

    let unique = challenge
        .choices
        .iter()
        .copied()
        .collect::<std::collections::BTreeSet<_>>();
    assert_eq!(unique.len(), 3);
}

#[test]
fn register_request_accepts_expected_fields() {
    let payload = json!({
        "device_label": "Pixel 8 Pro",
        "platform": "android",
        "device_token": "abcdefghijklmnopqrstuvwxyz",
        "device_public_key": "pubkey",
    });

    let request: RegisterTrustedDeviceRequest = serde_json::from_value(payload).unwrap();
    assert_eq!(request.device_label, "Pixel 8 Pro");
    assert_eq!(request.platform, "android");
    assert_eq!(request.device_token, "abcdefghijklmnopqrstuvwxyz");
    assert_eq!(request.device_public_key.as_deref(), Some("pubkey"));
}

#[test]
fn register_request_rejects_unknown_fields() {
    let payload = json!({
        "device_label": "Pixel 8 Pro",
        "platform": "android",
        "device_token": "abcdefghijklmnopqrstuvwxyz",
        "extra": "unexpected",
    });

    match serde_json::from_value::<RegisterTrustedDeviceRequest>(payload) {
        Ok(_) => panic!("expected unknown field validation error"),
        Err(error) => assert!(error.to_string().contains("unknown field")),
    }
}

#[test]
fn start_request_accepts_widget_flow_fields() {
    let payload = json!({
        "widget_login_context": "ctx-token",
        "widget_embed_origin": "https://app.example.com",
        "surface": "tenant",
    });

    let request: StartDeviceLoginRequest = serde_json::from_value(payload).unwrap();
    assert_eq!(request.widget_login_context.as_deref(), Some("ctx-token"));
    assert_eq!(
        request.widget_embed_origin.as_deref(),
        Some("https://app.example.com")
    );
    assert_eq!(request.surface.as_deref(), Some("tenant"));
}

#[test]
fn trusted_device_response_serializes_public_fields() {
    let response = TrustedDeviceResponse {
        id: Uuid::nil(),
        device_label: "Pixel 8 Pro".into(),
        platform: "android".into(),
        device_public_key: Some("pubkey".into()),
        last_seen_at: None,
        last_used_at: None,
        revoked_at: None,
        created_at: Utc::now(),
    };

    let value = serde_json::to_value(&response).unwrap();
    assert_eq!(value["device_label"], "Pixel 8 Pro");
    assert_eq!(value["platform"], "android");
    assert_eq!(value["device_public_key"], "pubkey");
    assert!(value.get("device_token_hash").is_none());
}

#[test]
fn browser_nonce_hash_requires_minimum_length() {
    let error = hash_browser_nonce("short").unwrap_err();
    assert!(error.to_string().contains("Browser nonce is invalid"));
}

#[test]
fn browser_binding_hash_changes_with_user_agent() {
    let one = build_browser_binding_hash("abcdefghijklmnopqrstuvwxyz", Some("Browser/A")).unwrap();
    let two = build_browser_binding_hash("abcdefghijklmnopqrstuvwxyz", Some("Browser/B")).unwrap();
    assert_ne!(one, two);
}

#[test]
fn qr_value_contains_server_and_public_id() {
    let public_id = Uuid::nil();
    let value = build_qr_value("https://api.rooiam.test", public_id);
    assert!(value.starts_with("rooiam://device-login?"));
    assert!(value.contains("server=https%3A%2F%2Fapi.rooiam.test"));
    assert!(value.contains(&public_id.to_string()));
}

#[actix_web::test]
async fn device_routes_are_mounted_under_identity_scope() {
    let app = actix_test::init_service(
        App::new().service(web::scope("/v1/identity").configure(handlers::routes)),
    )
    .await;

    let post = actix_test::call_service(
        &app,
        actix_test::TestRequest::post()
            .uri("/v1/identity/me/devices")
            .to_request(),
    )
    .await;
    assert_eq!(post.status(), StatusCode::INTERNAL_SERVER_ERROR);

    let get = actix_test::call_service(
        &app,
        actix_test::TestRequest::get()
            .uri("/v1/identity/me/devices")
            .to_request(),
    )
    .await;
    assert_eq!(get.status(), StatusCode::INTERNAL_SERVER_ERROR);

    let delete = actix_test::call_service(
        &app,
        actix_test::TestRequest::delete()
            .uri(&format!("/v1/identity/me/devices/{}", Uuid::nil()))
            .to_request(),
    )
    .await;
    assert_eq!(delete.status(), StatusCode::INTERNAL_SERVER_ERROR);
}

#[actix_web::test]
async fn device_routes_only_match_expected_paths() {
    let app = actix_test::init_service(
        App::new().service(web::scope("/v1/identity").configure(handlers::routes)),
    )
    .await;

    let patch = actix_test::call_service(
        &app,
        actix_test::TestRequest::patch()
            .uri("/v1/identity/me/devices")
            .to_request(),
    )
    .await;
    assert_eq!(patch.status(), StatusCode::INTERNAL_SERVER_ERROR);

    let missing = actix_test::call_service(
        &app,
        actix_test::TestRequest::get()
            .uri("/v1/identity/me/devicez")
            .to_request(),
    )
    .await;
    assert_eq!(missing.status(), StatusCode::NOT_FOUND);
}

#[actix_web::test]
async fn auth_device_login_routes_are_mounted_under_auth_scope() {
    let app =
        actix_test::init_service(App::new().service(web::scope("/v1/auth").configure(
            handlers::auth_routes,
        )))
        .await;

    let start = actix_test::call_service(
        &app,
        actix_test::TestRequest::post()
            .uri("/v1/auth/device-login/start")
            .set_json(json!({}))
            .to_request(),
    )
    .await;
    assert_eq!(start.status(), StatusCode::INTERNAL_SERVER_ERROR);

    let status = actix_test::call_service(
        &app,
        actix_test::TestRequest::get()
            .uri(&format!(
                "/v1/auth/device-login/{}/status?browser_nonce=abcdefghijklmnopqrstuvwxyz",
                Uuid::nil()
            ))
            .to_request(),
    )
    .await;
    assert_eq!(status.status(), StatusCode::INTERNAL_SERVER_ERROR);

    let complete = actix_test::call_service(
        &app,
        actix_test::TestRequest::post()
            .uri("/v1/auth/device-login/complete")
            .set_json(json!({
                "public_id": Uuid::nil(),
                "browser_nonce": "abcdefghijklmnopqrstuvwxyz",
            }))
            .to_request(),
    )
    .await;
    assert_eq!(complete.status(), StatusCode::INTERNAL_SERVER_ERROR);
}
