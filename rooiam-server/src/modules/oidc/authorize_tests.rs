use super::*;
use crate::bootstrap::config::*;
use actix_web::{test as actix_test, App};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use uuid::Uuid;

fn request(callback: &str) -> AuthorizeRequest {
    AuthorizeRequest {
        response_type: "code".into(),
        client_id: "test-client".into(),
        redirect_uri: callback.into(),
        scope: Some("openid email profile".into()),
        state: Some("opaque&state=preserved".into()),
        nonce: None,
        code_challenge: Some("x".repeat(43)),
        code_challenge_method: Some("S256".into()),
    }
}

#[test]
fn missing_session_response_preserves_callback_and_opaque_state() {
    let response = login_required_redirect(&request("https://app.example.test/callback")).unwrap();
    assert_eq!(response.status(), StatusCode::FOUND);
    let url = Url::parse(
        response
            .headers()
            .get("Location")
            .unwrap()
            .to_str()
            .unwrap(),
    )
    .unwrap();
    assert_eq!(
        url.origin().ascii_serialization(),
        "https://app.example.test"
    );
    assert_eq!(url.path(), "/callback");
    let pairs: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
    assert_eq!(pairs["error"], "login_required");
    assert_eq!(pairs["state"], "opaque&state=preserved");
    assert!(!pairs.contains_key("code"));
    assert!(!pairs.contains_key("return_to"));
}

#[test]
fn authorize_rejects_legacy_resume_parameter() {
    assert!(web::Query::<AuthorizeRequest>::from_query("response_type=code&client_id=test&redirect_uri=https%3A%2F%2Fapp.test%2Fcallback&return_to=https%3A%2F%2Fattacker.test").is_err());
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "requires disposable DATABASE_URL and ROOIAM_OIDC_TEST_REDIS_URL"]
async fn authorize_callback_boundary_and_session_recovery(pool: sqlx::PgPool) {
    for (key, value) in [
        ("issuer_url", "https://iam.example.test"),
        ("app_url", "https://portal.example.test"),
        ("admin_url", "https://admin.example.test"),
    ] {
        sqlx::query("INSERT INTO system_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value")
            .bind(key).bind(value).execute(&pool).await.unwrap();
    }
    let client: Uuid = sqlx::query_scalar("INSERT INTO oauth_clients(client_id,app_name,app_type) VALUES('test-client','OIDC regression','spa') RETURNING id")
        .fetch_one(&pool).await.unwrap();
    let callback = "https://app.example.test/callback";
    sqlx::query(
        "INSERT INTO oauth_client_redirect_uris(oauth_client_id,redirect_uri) VALUES($1,$2)",
    )
    .bind(client)
    .bind(callback)
    .execute(&pool)
    .await
    .unwrap();
    let redis = redis::Client::open(std::env::var("ROOIAM_OIDC_TEST_REDIS_URL").unwrap())
        .unwrap()
        .get_connection_manager()
        .await
        .unwrap();
    let state = web::Data::new(AppState {
        db: pool.clone(),
        redis,
        config: Arc::new(test_config("https://iam.example.test")),
        started_at: std::time::Instant::now(),
    });
    let app = actix_test::init_service(
        App::new()
            .app_data(state)
            .route("/authorize", web::get().to(authorize)),
    )
    .await;
    let make_uri = |client_id: &str, redirect: &str, pkce: bool| {
        let mut url = Url::parse("http://local.test/authorize").unwrap();
        url.query_pairs_mut()
            .append_pair("client_id", client_id)
            .append_pair("response_type", "code")
            .append_pair("redirect_uri", redirect)
            .append_pair("scope", "openid email profile")
            .append_pair("state", "original-state");
        if pkce {
            url.query_pairs_mut()
                .append_pair("code_challenge", &"x".repeat(43))
                .append_pair("code_challenge_method", "S256");
        }
        format!("{}?{}", url.path(), url.query().unwrap())
    };
    let good = make_uri("test-client", callback, true);
    for cookie in [
        None,
        Some("malformed".to_string()),
        Some(format!("{}.invalid", Uuid::new_v4())),
    ] {
        let mut req = actix_test::TestRequest::get().uri(&good);
        if let Some(cookie) = cookie {
            req = req.cookie(actix_web::cookie::Cookie::new(
                ROOIAM_SESSION_COOKIE,
                cookie,
            ));
        }
        let response = actix_test::call_service(&app, req.to_request()).await;
        assert_eq!(response.status(), StatusCode::FOUND);
        let url = Url::parse(
            response
                .headers()
                .get("Location")
                .unwrap()
                .to_str()
                .unwrap(),
        )
        .unwrap();
        assert_eq!(
            url.query_pairs().find(|(k, _)| k == "error").unwrap().1,
            "login_required"
        );
        assert_eq!(
            url.query_pairs().find(|(k, _)| k == "state").unwrap().1,
            "original-state"
        );
        assert_eq!(
            url.origin().ascii_serialization(),
            "https://app.example.test"
        );
    }
    for uri in [
        make_uri("unknown", callback, true),
        make_uri("test-client", "https://attacker.test/callback", true),
    ] {
        let response =
            actix_test::call_service(&app, actix_test::TestRequest::get().uri(&uri).to_request())
                .await;
        assert!(response.status().is_client_error());
        assert!(!response.headers().contains_key("Location"));
    }
    let response = actix_test::call_service(
        &app,
        actix_test::TestRequest::get()
            .uri(&make_uri("test-client", callback, false))
            .to_request(),
    )
    .await;
    assert!(!response
        .headers()
        .get("Location")
        .unwrap()
        .to_str()
        .unwrap()
        .contains("login_required"));
    let count: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM oauth_authorization_codes WHERE oauth_client_id=$1",
    )
    .bind(client)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(count, 0);
    // Once widget sign-in has established a valid session, the same request issues a code.
    let user: Uuid = sqlx::query_scalar("INSERT INTO users DEFAULT VALUES RETURNING id")
        .fetch_one(&pool)
        .await
        .unwrap();
    let session_id = Uuid::new_v4();
    SessionRepository::new(pool.clone())
        .create_session(
            session_id,
            user,
            &hex::encode(Sha256::digest(b"test-secret")),
            chrono::Utc::now() + chrono::Duration::minutes(5),
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .await
        .unwrap();
    let response = actix_test::call_service(
        &app,
        actix_test::TestRequest::get()
            .uri(&good)
            .cookie(actix_web::cookie::Cookie::new(
                ROOIAM_SESSION_COOKIE,
                format!("{session_id}.test-secret"),
            ))
            .to_request(),
    )
    .await;
    assert_eq!(response.status(), StatusCode::FOUND);
    let url = Url::parse(
        response
            .headers()
            .get("Location")
            .unwrap()
            .to_str()
            .unwrap(),
    )
    .unwrap();
    assert!(url.query_pairs().any(|(k, _)| k == "code"));
    assert!(!url.query_pairs().any(|(k, _)| k == "error"));
    for mutation in [
        "UPDATE sessions SET expires_at=NOW()-INTERVAL '1 minute' WHERE id=$1",
        "UPDATE sessions SET expires_at=NOW()+INTERVAL '5 minutes',revoked_at=NOW() WHERE id=$1",
    ] {
        sqlx::query(mutation)
            .bind(session_id)
            .execute(&pool)
            .await
            .unwrap();
        let response = actix_test::call_service(
            &app,
            actix_test::TestRequest::get()
                .uri(&good)
                .cookie(actix_web::cookie::Cookie::new(
                    ROOIAM_SESSION_COOKIE,
                    format!("{session_id}.test-secret"),
                ))
                .to_request(),
        )
        .await;
        let url = Url::parse(
            response
                .headers()
                .get("Location")
                .unwrap()
                .to_str()
                .unwrap(),
        )
        .unwrap();
        assert!(url
            .query_pairs()
            .any(|(k, v)| k == "error" && v == "login_required"));
        assert!(!url.query_pairs().any(|(k, _)| k == "code"));
    }
}

fn test_config(issuer_url: &str) -> AppConfig {
    AppConfig {
        mode: ServerMode::Test,
        deploy_target: DeployTarget::Local,
        server: ServerConfig {
            host: "0.0.0.0".into(),
            port: 5170,
            issuer_url: issuer_url.into(),
            frontend_url: "https://app.example.com".into(),
            admin_url: "https://admin.example.com".into(),
            trusted_proxy_cidrs: Vec::new(),
            max_logo_bytes: 8 * 1024 * 1024,
        },
        database: DatabaseConfig {
            url: "postgres://postgres:postgres@127.0.0.1:5432/rooiam".into(),
        },
        redis: RedisConfig {
            url: "redis://127.0.0.1:6379".into(),
        },
        storage: StorageConfig {
            root: "/tmp/rooiam".into(),
            public_media_base: "/media".into(),
        },
        oauth: OAuthConfig {
            google_client_id: String::new(),
            google_client_secret: String::new(),
            microsoft_client_id: String::new(),
            microsoft_client_secret: String::new(),
            google_redirect_uri: "https://auth.example.com/api/v1/auth/google/callback".into(),
            microsoft_redirect_uri: "https://auth.example.com/api/v1/auth/microsoft/callback"
                .into(),
            microsoft_tenant_id: "common".into(),
            google_redirect_uri_explicit: false,
            microsoft_redirect_uri_explicit: false,
        },
        oidc: OidcConfig {
            signing_secret: "test-signing-secret".into(),
            private_key_pem: None,
            public_key_pem: None,
            key_id: "test".into(),
        },
        webauthn: WebauthnConfig {
            rp_id: "localhost".into(),
            rp_name: "Rooiam".into(),
            origin: "http://localhost:5171".into(),
            extra_origins: Vec::new(),
            allow_any_port: true,
        },
        device_attestation: DeviceAttestationConfig {
            apple_app_id_prefix: None,
            google_play_service_account_email: None,
            google_play_service_account_private_key_pem: None,
            google_play_token_uri: "https://oauth2.googleapis.com/token".into(),
        },
        rate_limit: RateLimitConfig {
            auth_per_endpoint: u64::MAX,
            auth_per_ip: u64::MAX,
            identity_per_endpoint: u64::MAX,
            identity_per_ip: u64::MAX,
            orgs_per_endpoint: u64::MAX,
            orgs_per_ip: u64::MAX,
            oauth_per_endpoint: u64::MAX,
            oauth_per_ip: u64::MAX,
            webauthn_per_endpoint: u64::MAX,
            webauthn_per_ip: u64::MAX,
        },
    }
}

// Hold the original row while both requests enter the database. This forces the
// former unlocked read/update implementation to observe the same unused token.
#[sqlx::test(migrations = "./migrations")]
#[ignore = "requires disposable DATABASE_URL"]
async fn refresh_rotation_serializes_concurrent_requests(pool: sqlx::PgPool) {
    let client: Uuid = sqlx::query_scalar("INSERT INTO oauth_clients(client_id,app_name,app_type) VALUES('refresh-client','Refresh regression','spa') RETURNING id")
        .fetch_one(&pool).await.unwrap();
    let user: Uuid = sqlx::query_scalar("INSERT INTO users DEFAULT VALUES RETURNING id")
        .fetch_one(&pool)
        .await
        .unwrap();
    let session = Uuid::new_v4();
    crate::modules::session::repository::SessionRepository::new(pool.clone())
        .create_session(
            session,
            user,
            &hex::encode(Sha256::digest(b"session-secret")),
            chrono::Utc::now() + chrono::Duration::minutes(5),
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .await
        .unwrap();
    let family = Uuid::new_v4();
    let original: Uuid = sqlx::query_scalar("INSERT INTO oauth_refresh_tokens(token_hash,family_id,oauth_client_id,user_id,session_id,scopes,expires_at) VALUES($1,$2,$3,$4,$5,ARRAY['openid'],now()+interval '1 day') RETURNING id")
        .bind(hex::encode(Sha256::digest(b"refresh-secret"))).bind(family).bind(client).bind(user).bind(session)
        .fetch_one(&pool).await.unwrap();
    let service = Arc::new(OIDCService::new(
        pool.clone(),
        Arc::new(test_config("https://iam.example.test")),
    ));
    let mut blocker = pool.begin().await.unwrap();
    sqlx::query("SELECT id FROM oauth_refresh_tokens WHERE id=$1 FOR UPDATE")
        .bind(original)
        .fetch_one(&mut *blocker)
        .await
        .unwrap();
    let mut requests = Vec::new();
    for _ in 0..2 {
        let service = service.clone();
        requests.push(tokio::spawn(async move {
            service
                .exchange_refresh_token("refresh-secret", client)
                .await
        }));
    }
    tokio::time::timeout(std::time::Duration::from_secs(10), async {
        loop {
            let waiting: i64 = sqlx::query_scalar("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'")
                .fetch_one(&pool).await.unwrap();
            if waiting >= 2 { break; }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    }).await.expect("both rotations must overlap");
    blocker.commit().await.unwrap();
    let mut successes = 0;
    for request in requests {
        match request.await.unwrap() {
            Ok(_) => successes += 1,
            Err(AppError::Validation(message)) => assert!(message.contains("already used")),
            Err(error) => panic!("unexpected refresh failure: {error:?}"),
        }
    }
    assert_eq!(successes, 1);
    let (total, active): (i64, i64) = sqlx::query_as("SELECT count(*),count(*) FILTER(WHERE revoked_at IS NULL) FROM oauth_refresh_tokens WHERE family_id=$1")
        .bind(family).fetch_one(&pool).await.unwrap();
    assert_eq!(total, 2, "exactly one replacement may be issued");
    assert_eq!(active, 0, "reuse must revoke the replacement too");

    // A token presented under another client cannot cause family revocation.
    sqlx::query("UPDATE oauth_refresh_tokens SET revoked_at=NULL WHERE rotated_from_id=$1")
        .bind(original)
        .execute(&pool)
        .await
        .unwrap();
    assert!(service
        .exchange_refresh_token("refresh-secret", Uuid::new_v4())
        .await
        .is_err());
    let active: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM oauth_refresh_tokens WHERE family_id=$1 AND revoked_at IS NULL",
    )
    .bind(family)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(active, 1);
}
