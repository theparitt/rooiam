use actix_web::{http::StatusCode, test as actix_test, web, App};
use base64::Engine as _;
use chrono::Utc;
use ed25519_dalek::{Signer, SigningKey};
use serde_json::json;
use uuid::Uuid;

use super::apple_app_attest::build_apple_app_attest_client_data_hash;
use super::google_play::{
    build_google_play_request_hash, verify_google_play_token_payload, GooglePlayAccountDetails,
    GooglePlayAppIntegrity, GooglePlayDeviceIntegrity, GooglePlayRequestDetails,
    GooglePlayTokenPayloadExternal,
};
use super::handlers::{
    self, CreateDeviceAttestationChallengeRequest, RegisterTrustedDeviceRequest,
    StartDeviceLoginRequest, TrustedDeviceAttestationSummary, TrustedDeviceResponse,
    UpdateTrustedDevicePushTokenRequest,
};
use super::models::{DeviceLoginIntent, TrustedDevicePlatform, UserTrustedDevice};
use super::repository::{DeviceLoginRepository, NewDeviceLoginIntent};
use super::service::{
    build_approval_payload, build_browser_binding_hash, build_qr_value,
    create_device_attestation_challenge, device_attestation_challenge_redis_key,
    device_attestation_challenge_ttl_seconds, ensure_intent_can_be_approved,
    ensure_intent_can_be_cancelled, ensure_intent_can_be_completed, ensure_intent_can_be_rejected,
    generate_display_code, generate_number_challenge, hash_browser_nonce, hash_device_token,
    validate_attestation_format, validate_device_attestation, validate_device_label,
    validate_device_public_key, validate_ios_app_attest_registration_binding, validate_platform,
    verify_device_approval_signature, verify_trusted_device_attestation,
    CreateDeviceAttestationChallengeInput, DeviceAttestationPolicy,
    RegisterTrustedDeviceAttestationInput, StoredDeviceAttestationChallenge,
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
        "attestation": {
            "format": "android-play-integrity",
            "key_id": "key-1",
            "app_id": "com.rooiam.mobile",
            "environment": "production",
            "challenge_token": "challenge-token-1",
            "statement": "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        }
    });

    let request: RegisterTrustedDeviceRequest = serde_json::from_value(payload).unwrap();
    assert_eq!(request.device_label, "Pixel 8 Pro");
    assert_eq!(request.platform, "android");
    assert_eq!(request.device_token, "abcdefghijklmnopqrstuvwxyz");
    assert_eq!(request.device_public_key, "pubkey");
    assert_eq!(
        request
            .attestation
            .as_ref()
            .map(|value| value.format.as_str()),
        Some("android-play-integrity")
    );
    assert_eq!(
        request
            .attestation
            .as_ref()
            .and_then(|value| value.challenge_token.as_deref()),
        Some("challenge-token-1")
    );
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
fn attestation_challenge_request_accepts_expected_fields() {
    let payload = json!({
        "format": "ios-app-attest",
        "key_id": "test-key-id-example",
        "app_id": "com.rooiam.mobile",
        "environment": "production",
        "device_public_key": "ed25519:abc123publickey",
    });

    let request: CreateDeviceAttestationChallengeRequest = serde_json::from_value(payload).unwrap();
    assert_eq!(request.format, "ios-app-attest");
    assert_eq!(request.key_id, "test-key-id-example");
    assert_eq!(request.app_id, "com.rooiam.mobile");
    assert_eq!(request.environment, "production");
    assert_eq!(request.device_public_key, "ed25519:abc123publickey");
}

#[test]
fn trusted_device_response_serializes_public_fields() {
    let response = TrustedDeviceResponse {
        id: Uuid::nil(),
        device_label: "Pixel 8 Pro".into(),
        platform: "android".into(),
        device_public_key: Some("pubkey".into()),
        push_capable: true,
        attestation: TrustedDeviceAttestationSummary {
            status: "pending".into(),
            status_reason: None,
            format: Some("android-play-integrity".into()),
            key_id: Some("key-1".into()),
            app_id: Some("com.rooiam.mobile".into()),
            environment: Some("production".into()),
            received_at: None,
            verified_at: None,
        },
        last_seen_at: None,
        last_used_at: None,
        revoked_at: None,
        created_at: Utc::now(),
    };

    let value = serde_json::to_value(&response).unwrap();
    assert_eq!(value["device_label"], "Pixel 8 Pro");
    assert_eq!(value["platform"], "android");
    assert_eq!(value["device_public_key"], "pubkey");
    assert_eq!(value["push_capable"], true);
    assert_eq!(value["attestation"]["status"], "pending");
    assert!(value.get("device_token_hash").is_none());
}

#[test]
fn update_push_token_request_accepts_optional_field() {
    let payload = json!({
        "push_token": "test-push-token-example"
    });

    let request: UpdateTrustedDevicePushTokenRequest = serde_json::from_value(payload).unwrap();
    assert_eq!(
        request.push_token.as_deref(),
        Some("test-push-token-example")
    );
}

#[test]
fn trusted_device_attestation_verifies_with_matching_statement() {
    let public_key = "ed25519:abc123publickey".to_string();
    let statement = serde_json::json!({
        "format": "android-play-integrity",
        "platform": "android",
        "key_id": "key-1",
        "app_id": "com.rooiam.mobile",
        "environment": "production",
        "public_key": public_key,
        "issued_at": Utc::now().to_rfc3339(),
    })
    .to_string();
    let device = build_test_trusted_device(
        "android",
        Some("android-play-integrity"),
        Some("key-1"),
        Some("com.rooiam.mobile"),
        Some("production"),
        Some(statement.as_str()),
        "pending",
    );
    let policy = DeviceAttestationPolicy {
        require_verified_for_qr_login: true,
        require_vendor_verification_for_qr_login: false,
        allow_development_environments: false,
        allowed_app_ids: vec!["com.rooiam.mobile".into()],
        max_statement_age_hours: 24,
    };

    let verdict = verify_trusted_device_attestation(&device, &policy);
    assert_eq!(verdict.status, "verified");
    assert!(verdict.reason.is_none());
    assert!(verdict.verified_at.is_some());
}

#[test]
fn trusted_device_attestation_rejects_public_key_mismatch() {
    let statement = serde_json::json!({
        "format": "android-play-integrity",
        "platform": "android",
        "key_id": "key-1",
        "app_id": "com.rooiam.mobile",
        "environment": "production",
        "public_key": "ed25519:different-key",
        "issued_at": Utc::now().to_rfc3339(),
    })
    .to_string();
    let device = build_test_trusted_device(
        "android",
        Some("android-play-integrity"),
        Some("key-1"),
        Some("com.rooiam.mobile"),
        Some("production"),
        Some(statement.as_str()),
        "pending",
    );
    let policy = DeviceAttestationPolicy {
        require_verified_for_qr_login: true,
        require_vendor_verification_for_qr_login: false,
        allow_development_environments: false,
        allowed_app_ids: vec!["com.rooiam.mobile".into()],
        max_statement_age_hours: 24,
    };

    let verdict = verify_trusted_device_attestation(&device, &policy);
    assert_eq!(verdict.status, "rejected");
    assert!(verdict
        .reason
        .as_deref()
        .unwrap_or_default()
        .contains("public key"));
}

#[test]
fn trusted_device_attestation_rejects_development_environment_by_policy() {
    let public_key = "ed25519:abc123publickey".to_string();
    let statement = serde_json::json!({
        "format": "android-play-integrity",
        "platform": "android",
        "key_id": "key-1",
        "app_id": "com.rooiam.mobile",
        "environment": "development",
        "public_key": public_key,
        "issued_at": Utc::now().to_rfc3339(),
    })
    .to_string();
    let device = build_test_trusted_device(
        "android",
        Some("android-play-integrity"),
        Some("key-1"),
        Some("com.rooiam.mobile"),
        Some("development"),
        Some(statement.as_str()),
        "pending",
    );
    let policy = DeviceAttestationPolicy {
        require_verified_for_qr_login: true,
        require_vendor_verification_for_qr_login: false,
        allow_development_environments: false,
        allowed_app_ids: vec![],
        max_statement_age_hours: 24,
    };

    let verdict = verify_trusted_device_attestation(&device, &policy);
    assert_eq!(verdict.status, "rejected");
    assert!(verdict
        .reason
        .as_deref()
        .unwrap_or_default()
        .contains("Development attestation environments"));
}

#[test]
fn trusted_device_attestation_accepts_android_play_integrity_shape() {
    let statement = serde_json::json!({
        "requestDetails": {
            "requestPackageName": "com.rooiam.mobile",
            "timestampMillis": Utc::now().timestamp_millis()
        },
        "appIntegrity": {
            "appRecognitionVerdict": "PLAY_RECOGNIZED",
            "packageName": "com.rooiam.mobile"
        },
        "deviceIntegrity": {
            "deviceRecognitionVerdict": ["MEETS_DEVICE_INTEGRITY"]
        },
        "deviceAttributes": {
            "publicKey": "ed25519:abc123publickey"
        },
        "format": "android-play-integrity",
        "platform": "android",
        "key_id": "key-1"
    })
    .to_string();
    let device = build_test_trusted_device(
        "android",
        Some("android-play-integrity"),
        Some("key-1"),
        Some("com.rooiam.mobile"),
        Some("production"),
        Some(statement.as_str()),
        "pending",
    );
    let policy = DeviceAttestationPolicy {
        require_verified_for_qr_login: true,
        require_vendor_verification_for_qr_login: false,
        allow_development_environments: false,
        allowed_app_ids: vec!["com.rooiam.mobile".into()],
        max_statement_age_hours: 24,
    };

    let verdict = verify_trusted_device_attestation(&device, &policy);
    assert_eq!(verdict.status, "verified");
}

#[test]
fn trusted_device_attestation_accepts_ios_app_attest_shape() {
    let statement = serde_json::json!({
        "appAttest": {
            "bundleId": "com.rooiam.mobile",
            "keyId": "key-1",
            "publicKey": "ed25519:abc123publickey",
            "receiptCreationDate": Utc::now().to_rfc3339()
        },
        "environment": "production"
    })
    .to_string();
    let device = build_test_trusted_device(
        "ios",
        Some("ios-app-attest"),
        Some("key-1"),
        Some("com.rooiam.mobile"),
        Some("production"),
        Some(statement.as_str()),
        "pending",
    );
    let policy = DeviceAttestationPolicy {
        require_verified_for_qr_login: true,
        require_vendor_verification_for_qr_login: false,
        allow_development_environments: false,
        allowed_app_ids: vec!["com.rooiam.mobile".into()],
        max_statement_age_hours: 24,
    };

    let verdict = verify_trusted_device_attestation(&device, &policy);
    assert_eq!(verdict.status, "verified");
}

#[test]
fn trusted_device_attestation_rejects_android_compat_statement_when_vendor_proof_is_required() {
    let statement = serde_json::json!({
        "requestDetails": {
            "requestPackageName": "com.rooiam.mobile",
            "timestampMillis": Utc::now().timestamp_millis()
        },
        "appIntegrity": {
            "appRecognitionVerdict": "PLAY_RECOGNIZED",
            "packageName": "com.rooiam.mobile"
        },
        "deviceIntegrity": {
            "deviceRecognitionVerdict": ["MEETS_DEVICE_INTEGRITY"]
        },
        "deviceAttributes": {
            "publicKey": "ed25519:abc123publickey"
        },
        "format": "android-play-integrity",
        "platform": "android",
        "key_id": "key-1"
    })
    .to_string();
    let device = build_test_trusted_device(
        "android",
        Some("android-play-integrity"),
        Some("key-1"),
        Some("com.rooiam.mobile"),
        Some("production"),
        Some(statement.as_str()),
        "pending",
    );
    let policy = DeviceAttestationPolicy {
        require_verified_for_qr_login: true,
        require_vendor_verification_for_qr_login: true,
        allow_development_environments: false,
        allowed_app_ids: vec!["com.rooiam.mobile".into()],
        max_statement_age_hours: 24,
    };

    let verdict = verify_trusted_device_attestation(&device, &policy);
    assert_eq!(verdict.status, "rejected");
    assert!(verdict
        .reason
        .as_deref()
        .unwrap_or_default()
        .contains("require vendor attestation verification"));
}

#[test]
fn trusted_device_attestation_rejects_ios_app_attest_when_vendor_proof_is_required() {
    let statement = serde_json::json!({
        "appAttest": {
            "bundleId": "com.rooiam.mobile",
            "keyId": "key-1",
            "publicKey": "ed25519:abc123publickey",
            "receiptCreationDate": Utc::now().to_rfc3339()
        },
        "environment": "production"
    })
    .to_string();
    let device = build_test_trusted_device(
        "ios",
        Some("ios-app-attest"),
        Some("key-1"),
        Some("com.rooiam.mobile"),
        Some("production"),
        Some(statement.as_str()),
        "pending",
    );
    let policy = DeviceAttestationPolicy {
        require_verified_for_qr_login: true,
        require_vendor_verification_for_qr_login: true,
        allow_development_environments: false,
        allowed_app_ids: vec!["com.rooiam.mobile".into()],
        max_statement_age_hours: 24,
    };

    let verdict = verify_trusted_device_attestation(&device, &policy);
    assert_eq!(verdict.status, "rejected");
    assert!(verdict
        .reason
        .as_deref()
        .unwrap_or_default()
        .contains("App Attest"));
}

#[test]
fn attestation_format_accepts_expected_values() {
    assert_eq!(
        validate_attestation_format("android-play-integrity").unwrap(),
        "android-play-integrity"
    );
    assert_eq!(
        validate_attestation_format("IOS-APP-ATTEST").unwrap(),
        "ios-app-attest"
    );
}

#[test]
fn attestation_format_rejects_unknown_values() {
    let error = validate_attestation_format("custom").unwrap_err();
    assert!(error
        .to_string()
        .contains("Attestation format must be one of"));
}

#[test]
fn attestation_validation_requires_statement() {
    let error = validate_device_attestation(&RegisterTrustedDeviceAttestationInput {
        format: "android-play-integrity".into(),
        key_id: None,
        app_id: None,
        environment: None,
        challenge_token: None,
        statement: "short".into(),
    })
    .unwrap_err();
    assert!(error.to_string().contains("too short"));
}

#[test]
fn ios_attestation_validation_requires_challenge_token() {
    let error = validate_device_attestation(&RegisterTrustedDeviceAttestationInput {
        format: "ios-app-attest".into(),
        key_id: Some("key-1".into()),
        app_id: Some("com.rooiam.mobile".into()),
        environment: Some("production".into()),
        challenge_token: None,
        statement: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".into(),
    })
    .unwrap_err();
    assert!(error.to_string().contains("challenge_token"));
}

#[test]
fn device_attestation_challenge_is_created_for_ios_app_attest() {
    let signing_key = SigningKey::from_bytes(&[21u8; 32]);
    let device_public_key = format!(
        "ed25519:{}",
        base64::engine::general_purpose::URL_SAFE_NO_PAD
            .encode(signing_key.verifying_key().to_bytes())
    );
    let created = create_device_attestation_challenge(
        Uuid::new_v4(),
        CreateDeviceAttestationChallengeInput {
            format: "ios-app-attest".into(),
            key_id: "test-key-id-example".into(),
            app_id: "com.rooiam.mobile".into(),
            environment: "production".into(),
            device_public_key: device_public_key.clone(),
        },
    )
    .unwrap();

    assert!(created.token.len() >= 16);
    assert!(created.challenge.len() >= 32);
    assert_eq!(created.record.format, "ios-app-attest");
    assert_eq!(created.record.key_id, "test-key-id-example");
    assert_eq!(created.record.app_id, "com.rooiam.mobile");
    assert_eq!(created.record.environment, "production");
    assert_eq!(created.record.device_public_key, device_public_key);
    assert_eq!(
        created.expires_at.timestamp(),
        created.record.expires_at.timestamp()
    );
}

#[test]
fn apple_app_attest_client_data_hash_is_stable() {
    let one = build_apple_app_attest_client_data_hash(
        "challenge-1",
        "ed25519:abc123publickey",
        "com.rooiam.mobile",
        "key-1",
        "production",
    );
    let two = build_apple_app_attest_client_data_hash(
        "challenge-1",
        "ed25519:abc123publickey",
        "com.rooiam.mobile",
        "key-1",
        "production",
    );
    assert_eq!(one, two);
    assert_eq!(one.len(), 32);
}

#[test]
fn device_attestation_challenge_rejects_non_ios_format() {
    let error = create_device_attestation_challenge(
        Uuid::new_v4(),
        CreateDeviceAttestationChallengeInput {
            format: "android-play-integrity".into(),
            key_id: "test-key-id-example".into(),
            app_id: "com.rooiam.mobile".into(),
            environment: "production".into(),
            device_public_key: "ed25519:abc123publickey".into(),
        },
    )
    .unwrap_err();

    assert!(error.to_string().contains("ios-app-attest"));
}

#[test]
fn device_attestation_challenge_redis_key_is_namespaced() {
    let key = device_attestation_challenge_redis_key("abcdefghijklmnopqrstuvwxyz").unwrap();
    assert_eq!(
        key,
        "device_attestation_challenge:abcdefghijklmnopqrstuvwxyz"
    );
    assert_eq!(device_attestation_challenge_ttl_seconds(), 600);
}

#[test]
fn ios_attestation_binding_rejects_different_user() {
    let attestation = validate_device_attestation(&RegisterTrustedDeviceAttestationInput {
        format: "ios-app-attest".into(),
        key_id: Some("key-1".into()),
        app_id: Some("com.rooiam.mobile".into()),
        environment: Some("production".into()),
        challenge_token: Some("challenge-token".into()),
        statement: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".into(),
    })
    .unwrap();
    let challenge = build_test_attestation_challenge("key-1", "com.rooiam.mobile", "production");

    let error = validate_ios_app_attest_registration_binding(
        Uuid::new_v4(),
        "ed25519:abc123publickey",
        &attestation,
        &challenge,
    )
    .unwrap_err();

    assert!(error.to_string().contains("different user session"));
}

#[test]
fn ios_attestation_binding_rejects_device_key_mismatch() {
    let attestation = validate_device_attestation(&RegisterTrustedDeviceAttestationInput {
        format: "ios-app-attest".into(),
        key_id: Some("key-1".into()),
        app_id: Some("com.rooiam.mobile".into()),
        environment: Some("production".into()),
        challenge_token: Some("challenge-token".into()),
        statement: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".into(),
    })
    .unwrap();
    let challenge = build_test_attestation_challenge("key-1", "com.rooiam.mobile", "production");

    let error = validate_ios_app_attest_registration_binding(
        challenge.user_id,
        "ed25519:differentpublickey",
        &attestation,
        &challenge,
    )
    .unwrap_err();

    assert!(error.to_string().contains("device public key"));
}

#[test]
fn ios_attestation_binding_rejects_key_id_mismatch() {
    let attestation = validate_device_attestation(&RegisterTrustedDeviceAttestationInput {
        format: "ios-app-attest".into(),
        key_id: Some("wrong-key".into()),
        app_id: Some("com.rooiam.mobile".into()),
        environment: Some("production".into()),
        challenge_token: Some("challenge-token".into()),
        statement: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".into(),
    })
    .unwrap();
    let challenge = build_test_attestation_challenge("key-1", "com.rooiam.mobile", "production");

    let error = validate_ios_app_attest_registration_binding(
        challenge.user_id,
        "ed25519:abc123publickey",
        &attestation,
        &challenge,
    )
    .unwrap_err();

    assert!(error.to_string().contains("key_id"));
}

#[test]
fn ios_attestation_binding_rejects_app_id_mismatch() {
    let attestation = validate_device_attestation(&RegisterTrustedDeviceAttestationInput {
        format: "ios-app-attest".into(),
        key_id: Some("key-1".into()),
        app_id: Some("com.other.mobile".into()),
        environment: Some("production".into()),
        challenge_token: Some("challenge-token".into()),
        statement: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".into(),
    })
    .unwrap();
    let challenge = build_test_attestation_challenge("key-1", "com.rooiam.mobile", "production");

    let error = validate_ios_app_attest_registration_binding(
        challenge.user_id,
        "ed25519:abc123publickey",
        &attestation,
        &challenge,
    )
    .unwrap_err();

    assert!(error.to_string().contains("app_id"));
}

#[test]
fn ios_attestation_binding_rejects_environment_mismatch() {
    let attestation = validate_device_attestation(&RegisterTrustedDeviceAttestationInput {
        format: "ios-app-attest".into(),
        key_id: Some("key-1".into()),
        app_id: Some("com.rooiam.mobile".into()),
        environment: Some("development".into()),
        challenge_token: Some("challenge-token".into()),
        statement: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".into(),
    })
    .unwrap();
    let challenge = build_test_attestation_challenge("key-1", "com.rooiam.mobile", "production");

    let error = validate_ios_app_attest_registration_binding(
        challenge.user_id,
        "ed25519:abc123publickey",
        &attestation,
        &challenge,
    )
    .unwrap_err();

    assert!(error.to_string().contains("environment"));
}

#[test]
fn device_public_key_is_normalized_to_ed25519_scheme() {
    let signing_key = SigningKey::from_bytes(&[7u8; 32]);
    let raw = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .encode(signing_key.verifying_key().to_bytes());
    let normalized = validate_device_public_key(&raw).unwrap();
    assert!(normalized.starts_with("ed25519:"));
}

#[test]
fn approval_signature_verifies_against_registered_key() {
    let signing_key = SigningKey::from_bytes(&[9u8; 32]);
    let intent = DeviceLoginIntent {
        id: Uuid::new_v4(),
        public_id: Uuid::new_v4(),
        browser_binding_hash: "browser".into(),
        nonce_hash: "nonce".into(),
        workspace_id: None,
        oauth_client_id: None,
        redirect_uri: None,
        surface: Some("tenant".into()),
        display_code: "123456".into(),
        match_number: 42,
        decoy_numbers: vec![11, 77],
        approved_user_id: None,
        approved_device_id: None,
        status: "pending".into(),
        status_reason: None,
        requester_ip: None,
        requester_user_agent: None,
        approved_at: None,
        consumed_at: None,
        expires_at: Utc::now() + chrono::Duration::minutes(5),
        created_at: Utc::now(),
    };

    let payload = build_approval_payload(&intent);
    let signature = signing_key.sign(payload.as_bytes());
    let public_key = format!(
        "ed25519:{}",
        base64::engine::general_purpose::URL_SAFE_NO_PAD
            .encode(signing_key.verifying_key().to_bytes())
    );
    let encoded_signature =
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(signature.to_bytes());

    verify_device_approval_signature(&public_key, &payload, &encoded_signature).unwrap();
}

#[test]
fn approval_signature_rejects_wrong_payload() {
    let signing_key = SigningKey::from_bytes(&[11u8; 32]);
    let public_key = format!(
        "ed25519:{}",
        base64::engine::general_purpose::URL_SAFE_NO_PAD
            .encode(signing_key.verifying_key().to_bytes())
    );
    let signature = signing_key.sign(b"payload-a");
    let encoded_signature =
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(signature.to_bytes());

    let error =
        verify_device_approval_signature(&public_key, "payload-b", &encoded_signature).unwrap_err();
    assert!(error.to_string().contains("Approval signature is invalid"));
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
fn google_play_request_hash_is_stable() {
    let one = build_google_play_request_hash(
        "ed25519:abc123publickey",
        "com.rooiam.mobile",
        Some("key-1"),
        Some("production"),
    );
    let two = build_google_play_request_hash(
        "ed25519:abc123publickey",
        "com.rooiam.mobile",
        Some("key-1"),
        Some("production"),
    );
    assert_eq!(one, two);
    assert_eq!(one.len(), 64);
}

#[test]
fn google_play_payload_verifies_registered_binding() {
    let device = build_test_trusted_device(
        "android",
        Some("android-play-integrity"),
        Some("key-1"),
        Some("com.rooiam.mobile"),
        Some("production"),
        Some("opaque-google-token"),
        "pending",
    );
    let policy = DeviceAttestationPolicy {
        require_verified_for_qr_login: true,
        require_vendor_verification_for_qr_login: true,
        allow_development_environments: false,
        allowed_app_ids: vec!["com.rooiam.mobile".into()],
        max_statement_age_hours: 24,
    };
    let payload = GooglePlayTokenPayloadExternal {
        request_details: GooglePlayRequestDetails {
            request_package_name: "com.rooiam.mobile".into(),
            request_hash: Some(build_google_play_request_hash(
                "ed25519:abc123publickey",
                "com.rooiam.mobile",
                Some("key-1"),
                Some("production"),
            )),
            timestamp_millis: Utc::now().timestamp_millis().to_string(),
        },
        app_integrity: GooglePlayAppIntegrity {
            app_recognition_verdict: "PLAY_RECOGNIZED".into(),
            package_name: Some("com.rooiam.mobile".into()),
        },
        device_integrity: GooglePlayDeviceIntegrity {
            device_recognition_verdict: Some(vec!["MEETS_DEVICE_INTEGRITY".into()]),
        },
        account_details: GooglePlayAccountDetails {
            app_licensing_verdict: "LICENSED".into(),
        },
        testing_details: None,
    };

    let verified = verify_google_play_token_payload(&device, &policy, &payload).unwrap();
    assert_eq!(verified.environment, "production");
}

#[test]
fn google_play_payload_rejects_wrong_request_hash() {
    let device = build_test_trusted_device(
        "android",
        Some("android-play-integrity"),
        Some("key-1"),
        Some("com.rooiam.mobile"),
        Some("production"),
        Some("opaque-google-token"),
        "pending",
    );
    let policy = DeviceAttestationPolicy {
        require_verified_for_qr_login: true,
        require_vendor_verification_for_qr_login: true,
        allow_development_environments: false,
        allowed_app_ids: vec!["com.rooiam.mobile".into()],
        max_statement_age_hours: 24,
    };
    let payload = GooglePlayTokenPayloadExternal {
        request_details: GooglePlayRequestDetails {
            request_package_name: "com.rooiam.mobile".into(),
            request_hash: Some("wrong".into()),
            timestamp_millis: Utc::now().timestamp_millis().to_string(),
        },
        app_integrity: GooglePlayAppIntegrity {
            app_recognition_verdict: "PLAY_RECOGNIZED".into(),
            package_name: Some("com.rooiam.mobile".into()),
        },
        device_integrity: GooglePlayDeviceIntegrity {
            device_recognition_verdict: Some(vec!["MEETS_DEVICE_INTEGRITY".into()]),
        },
        account_details: GooglePlayAccountDetails {
            app_licensing_verdict: "LICENSED".into(),
        },
        testing_details: None,
    };

    let error = verify_google_play_token_payload(&device, &policy, &payload).unwrap_err();
    assert!(matches!(
        error,
        super::google_play::GooglePlayVerificationError::Rejected(message)
            if message.contains("requestHash")
    ));
}

#[test]
fn qr_value_contains_server_and_public_id() {
    let public_id = Uuid::nil();
    let value = build_qr_value("https://api.rooiam.test", public_id);
    assert!(value.starts_with("rooiam://device-login?"));
    assert!(value.contains("server=https%3A%2F%2Fapi.rooiam.test"));
    assert!(value.contains(&public_id.to_string()));
}

#[test]
fn pending_intent_allows_approve_reject_and_cancel() {
    let intent = build_test_device_login_intent("pending", None);
    ensure_intent_can_be_approved(&intent).unwrap();
    ensure_intent_can_be_rejected(&intent).unwrap();
    ensure_intent_can_be_cancelled(&intent).unwrap();
}

#[test]
fn rejected_intent_blocks_browser_completion_with_clear_message() {
    let intent = build_test_device_login_intent("rejected", None);
    let error = ensure_intent_can_be_completed(&intent).unwrap_err();
    assert!(error.to_string().contains("rejected on the phone"));
}

#[test]
fn cancelled_intent_blocks_phone_approval_with_clear_message() {
    let intent = build_test_device_login_intent("cancelled", None);
    let error = ensure_intent_can_be_approved(&intent).unwrap_err();
    assert!(error.to_string().contains("cancelled in the browser"));
}

#[test]
fn approved_intent_cannot_be_rejected_anymore() {
    let intent = build_test_device_login_intent("approved", None);
    let error = ensure_intent_can_be_rejected(&intent).unwrap_err();
    assert!(error.to_string().contains("already approved"));
}

#[test]
fn rejected_intent_cannot_be_cancelled_anymore() {
    let intent = build_test_device_login_intent("rejected", None);
    let error = ensure_intent_can_be_cancelled(&intent).unwrap_err();
    assert!(error.to_string().contains("already rejected"));
}

#[test]
fn expired_intent_cannot_be_cancelled_anymore() {
    let intent =
        build_test_device_login_intent("pending", Some(Utc::now() - chrono::Duration::minutes(1)));
    let error = ensure_intent_can_be_cancelled(&intent).unwrap_err();
    assert!(error.to_string().contains("already expired"));
}

#[actix_web::test]
async fn device_routes_are_mounted_under_identity_scope() {
    let app = actix_test::init_service(
        App::new().service(web::scope("/v1/identity").configure(handlers::routes)),
    )
    .await;

    let challenge = actix_test::call_service(
        &app,
        actix_test::TestRequest::post()
            .uri("/v1/identity/me/devices/attestation-challenge")
            .to_request(),
    )
    .await;
    assert_eq!(challenge.status(), StatusCode::INTERNAL_SERVER_ERROR);

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

    let update_push = actix_test::call_service(
        &app,
        actix_test::TestRequest::put()
            .uri(&format!(
                "/v1/identity/me/devices/{}/push-token",
                Uuid::nil()
            ))
            .set_json(json!({
                "push_token": "test-push-token-example",
            }))
            .to_request(),
    )
    .await;
    assert_eq!(update_push.status(), StatusCode::INTERNAL_SERVER_ERROR);
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
    let app = actix_test::init_service(
        App::new().service(web::scope("/v1/auth").configure(handlers::auth_routes)),
    )
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

    let cancel = actix_test::call_service(
        &app,
        actix_test::TestRequest::post()
            .uri("/v1/auth/device-login/cancel")
            .set_json(json!({
                "public_id": Uuid::nil(),
                "browser_nonce": "abcdefghijklmnopqrstuvwxyz",
            }))
            .to_request(),
    )
    .await;
    assert_eq!(cancel.status(), StatusCode::INTERNAL_SERVER_ERROR);
}

#[actix_web::test]
async fn identity_device_login_routes_include_reject() {
    let app = actix_test::init_service(
        App::new().service(web::scope("/v1/identity").configure(handlers::routes)),
    )
    .await;

    let reject = actix_test::call_service(
        &app,
        actix_test::TestRequest::post()
            .uri("/v1/identity/device-login/reject")
            .set_json(json!({
                "public_id": Uuid::nil(),
                "device_token": "abcdefghijklmnopqrstuvwxyz",
            }))
            .to_request(),
    )
    .await;
    assert_eq!(reject.status(), StatusCode::INTERNAL_SERVER_ERROR);
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "requires DATABASE_URL for Postgres integration roundtrip"]
async fn repository_roundtrip_updates_trusted_device_push_token(pool: sqlx::PgPool) {
    let user_id: Uuid = sqlx::query_scalar("INSERT INTO users DEFAULT VALUES RETURNING id")
        .fetch_one(&pool)
        .await
        .unwrap();
    let repo = DeviceLoginRepository::new(pool.clone());
    let device = repo
        .create_trusted_device(
            user_id,
            "Pixel 8 Pro",
            "android",
            &hash_device_token("abcdefghijklmnopqrstuvwxyz").unwrap(),
            Some("ed25519:abc123publickey"),
            None,
            None,
            None,
            None,
            None,
            "missing",
            None,
            None,
            None,
        )
        .await
        .unwrap();

    let updated = repo
        .update_trusted_device_push_token(
            user_id,
            device.id,
            Some("abcdefghijklmnopqrstuvwxyz0123456789"),
        )
        .await
        .unwrap()
        .unwrap();
    assert_eq!(
        updated.push_token.as_deref(),
        Some("abcdefghijklmnopqrstuvwxyz0123456789")
    );
    assert!(updated.last_seen_at.is_some());

    let cleared = repo
        .update_trusted_device_push_token(user_id, device.id, None)
        .await
        .unwrap()
        .unwrap();
    assert!(cleared.push_token.is_none());
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "requires DATABASE_URL for Postgres integration roundtrip"]
async fn repository_roundtrip_cancels_pending_device_login_intent(pool: sqlx::PgPool) {
    let repo = DeviceLoginRepository::new(pool.clone());
    let public_id = Uuid::new_v4();
    let browser_nonce = "abcdefghijklmnopqrstuvwxyz";
    let nonce_hash = hash_browser_nonce(browser_nonce).unwrap();
    let browser_binding_hash =
        build_browser_binding_hash(browser_nonce, Some("Browser/A")).unwrap();

    let created = repo
        .create_device_login_intent(NewDeviceLoginIntent {
            public_id,
            browser_binding_hash: &browser_binding_hash,
            nonce_hash: &nonce_hash,
            workspace_id: None,
            oauth_client_id: None,
            redirect_uri: Some("http://localhost:5172/callback"),
            surface: Some("tenant"),
            display_code: "123456",
            match_number: 42,
            decoy_numbers: &[11, 77],
            requester_ip: Some("127.0.0.1"),
            requester_user_agent: Some("Browser/A"),
            expires_at: Utc::now() + chrono::Duration::minutes(5),
        })
        .await
        .unwrap();
    assert_eq!(created.status, "pending");

    let cancelled = repo
        .cancel_device_login_intent(public_id, &nonce_hash, "cancelled_by_browser")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(cancelled.status, "cancelled");
    assert_eq!(
        cancelled.status_reason.as_deref(),
        Some("cancelled_by_browser")
    );
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "requires DATABASE_URL for Postgres integration roundtrip"]
async fn repository_roundtrip_rejects_pending_device_login_intent(pool: sqlx::PgPool) {
    let repo = DeviceLoginRepository::new(pool.clone());
    let public_id = Uuid::new_v4();
    let browser_nonce = "abcdefghijklmnopqrstuvwxyz";
    let nonce_hash = hash_browser_nonce(browser_nonce).unwrap();
    let browser_binding_hash =
        build_browser_binding_hash(browser_nonce, Some("Browser/B")).unwrap();

    repo.create_device_login_intent(NewDeviceLoginIntent {
        public_id,
        browser_binding_hash: &browser_binding_hash,
        nonce_hash: &nonce_hash,
        workspace_id: None,
        oauth_client_id: None,
        redirect_uri: Some("http://localhost:5172/callback"),
        surface: Some("tenant"),
        display_code: "654321",
        match_number: 55,
        decoy_numbers: &[21, 88],
        requester_ip: Some("127.0.0.1"),
        requester_user_agent: Some("Browser/B"),
        expires_at: Utc::now() + chrono::Duration::minutes(5),
    })
    .await
    .unwrap();

    let rejected = repo
        .reject_device_login_intent(public_id, "rejected_by_phone")
        .await
        .unwrap()
        .unwrap();
    assert_eq!(rejected.status, "rejected");
    assert_eq!(rejected.status_reason.as_deref(), Some("rejected_by_phone"));
}

fn build_test_trusted_device(
    platform: &str,
    attestation_format: Option<&str>,
    attestation_key_id: Option<&str>,
    attestation_app_id: Option<&str>,
    attestation_environment: Option<&str>,
    attestation_statement: Option<&str>,
    attestation_status: &str,
) -> UserTrustedDevice {
    UserTrustedDevice {
        id: Uuid::new_v4(),
        user_id: Uuid::new_v4(),
        device_label: "Pixel 8 Pro".into(),
        platform: platform.into(),
        device_token_hash: "hash".into(),
        device_public_key: Some("ed25519:abc123publickey".into()),
        attestation_format: attestation_format.map(str::to_string),
        attestation_key_id: attestation_key_id.map(str::to_string),
        attestation_app_id: attestation_app_id.map(str::to_string),
        attestation_environment: attestation_environment.map(str::to_string),
        attestation_statement: attestation_statement.map(str::to_string),
        attestation_status: attestation_status.into(),
        attestation_status_reason: None,
        attestation_received_at: Some(Utc::now()),
        attestation_verified_at: None,
        push_token: None,
        last_seen_at: None,
        last_used_at: None,
        revoked_at: None,
        created_at: Utc::now(),
    }
}

fn build_test_attestation_challenge(
    key_id: &str,
    app_id: &str,
    environment: &str,
) -> StoredDeviceAttestationChallenge {
    StoredDeviceAttestationChallenge {
        user_id: Uuid::new_v4(),
        format: "ios-app-attest".into(),
        key_id: key_id.into(),
        app_id: app_id.into(),
        environment: environment.into(),
        device_public_key: "ed25519:abc123publickey".into(),
        challenge: "challenge-1".into(),
        expires_at: Utc::now() + chrono::Duration::minutes(10),
    }
}

fn build_test_device_login_intent(
    status: &str,
    expires_at: Option<chrono::DateTime<Utc>>,
) -> DeviceLoginIntent {
    DeviceLoginIntent {
        id: Uuid::new_v4(),
        public_id: Uuid::new_v4(),
        browser_binding_hash: "browser".into(),
        nonce_hash: "nonce".into(),
        workspace_id: None,
        oauth_client_id: None,
        redirect_uri: None,
        surface: Some("tenant".into()),
        display_code: "123456".into(),
        match_number: 42,
        decoy_numbers: vec![11, 77],
        approved_user_id: None,
        approved_device_id: None,
        status: status.into(),
        status_reason: match status {
            "rejected" => Some("rejected_by_phone".into()),
            "cancelled" => Some("cancelled_by_browser".into()),
            _ => None,
        },
        requester_ip: None,
        requester_user_agent: None,
        approved_at: if status == "approved" {
            Some(Utc::now())
        } else {
            None
        },
        consumed_at: if status == "consumed" {
            Some(Utc::now())
        } else {
            None
        },
        expires_at: expires_at.unwrap_or_else(|| Utc::now() + chrono::Duration::minutes(5)),
        created_at: Utc::now(),
    }
}
