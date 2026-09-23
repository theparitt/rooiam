fn main() {
    let (secret, hash) = rooiam_server_lib::shared::oauth_client::generate_confidential_client_secret()
        .expect("client secret generation must succeed");
    println!(
        "{}",
        serde_json::json!({ "client_secret": secret, "client_secret_hash": hash })
    );
}
