use std::fs::OpenOptions;
use std::io::{self, Write};

// ── CLI struct (used from main.rs via subcommand) ────────────────────────────

/// Run the interactive setup wizard in the terminal
pub fn run_setup_wizard() {
    println!();
    println!("╔══════════════════════════════════════════════════╗");
    println!("║          Rooiam Setup Wizard  🚀                 ║");
    println!("╚══════════════════════════════════════════════════╝");
    println!();
    println!("This wizard will help you configure Rooiam.");
    println!("Press Enter to accept [defaults]. Ctrl+C to cancel.");
    println!();

    let mut config = std::collections::HashMap::new();

    // ── Database ─────────────────────────────────────────────────────────────
    section("1. Database");
    let db_url = prompt(
        "PostgreSQL URL",
        "postgres://user:password@localhost:5432/rooiam",
    );
    config.insert("ROOIAM_DATABASE_URL", db_url);

    // ── Server ───────────────────────────────────────────────────────────────
    section("2. Server");
    let host = prompt("Listen host", "0.0.0.0");
    let port = prompt("Listen port", "5170");
    let issuer_url = prompt("Public issuer URL", &format!("http://localhost:{}", port));
    let frontend_url = prompt("Hosted auth UI URL", "http://localhost:5172");
    let admin_url = prompt("Admin UI URL", "http://localhost:5171");
    config.insert("ROOIAM_HOST", host);
    config.insert("ROOIAM_PORT", port);
    config.insert("ROOIAM_SERVER_URL", issuer_url.clone());
    config.insert("ROOIAM_APP_URL", frontend_url);
    config.insert("ROOIAM_ADMIN_URL", admin_url);

    // ── Redis ────────────────────────────────────────────────────────────────
    section("3. Redis");
    let redis_url = prompt("Redis URL", "redis://127.0.0.1:6379");
    config.insert("ROOIAM_REDIS_URL", redis_url);

    // ── SMTP (optional) ──────────────────────────────────────────────────────
    section("4. SMTP for Magic Links (optional — press Enter to skip)");
    let smtp_host = prompt("SMTP host (or empty to skip)", "");
    if !smtp_host.is_empty() {
        let smtp_port = prompt("SMTP port", "587");
        let smtp_user = prompt("SMTP username", "apikey");
        let smtp_pass = prompt_sensitive("SMTP password/API key");
        let smtp_from = prompt("From email address", "auth@example.com");
        config.insert("ROOIAM_SMTP_HOST", smtp_host);
        config.insert("ROOIAM_SMTP_PORT", smtp_port);
        config.insert("ROOIAM_SMTP_USER", smtp_user);
        config.insert("ROOIAM_SMTP_PASS", smtp_pass);
        config.insert("ROOIAM_SMTP_FROM", smtp_from);
    } else {
        println!("  ⏭  Skipping SMTP (magic links will not send emails)");
    }

    // ── OAuth (optional) ─────────────────────────────────────────────────────
    section("5. Google OAuth (optional — press Enter to skip)");
    let google_id = prompt("Google Client ID (or empty to skip)", "");
    if !google_id.is_empty() {
        let google_secret = prompt_sensitive("Google Client Secret");
        config.insert("ROOIAM_GOOGLE_CLIENT_ID", google_id);
        config.insert("ROOIAM_GOOGLE_CLIENT_SECRET", google_secret);
    } else {
        println!("  ⏭  Skipping Google OAuth");
    }

    section("6. Microsoft OAuth (optional — press Enter to skip)");
    let ms_id = prompt("Microsoft Client ID (or empty to skip)", "");
    if !ms_id.is_empty() {
        let ms_secret = prompt_sensitive("Microsoft Client Secret");
        let ms_tenant = prompt("Tenant ID", "common");
        config.insert("ROOIAM_MICROSOFT_CLIENT_ID", ms_id);
        config.insert("ROOIAM_MICROSOFT_CLIENT_SECRET", ms_secret);
        config.insert("ROOIAM_MICROSOFT_TENANT_ID", ms_tenant);
    } else {
        println!("  ⏭  Skipping Microsoft OAuth");
    }

    // ── Write .env ───────────────────────────────────────────────────────────
    println!();
    let write = prompt("Write configuration to .env file? [Y/n]", "Y");
    if write.to_lowercase() != "n" {
        write_env_file(&config);
        println!();
        println!("✅ Configuration written to .env");
        println!();
        println!("Next steps:");
        println!("  1. Run database migrations: sqlx migrate run");
        println!("  2. Start Rooiam:            cargo run");
        println!("  3. Open admin dashboard:    http://localhost:5171/setup");
        println!();
    } else {
        println!();
        println!("Configuration not written. Add these variables to your environment:");
        println!();
        for (k, v) in &config {
            println!("  {}={}", k, v);
        }
        println!();
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn section(title: &str) {
    println!();
    println!("  ┌─ {} ─────────────", title);
}

fn prompt(label: &str, default: &str) -> String {
    if default.is_empty() {
        print!("  │  {} > ", label);
    } else {
        print!("  │  {} [{}] > ", label, default);
    }
    io::stdout().flush().unwrap();

    let mut input = String::new();
    io::stdin().read_line(&mut input).unwrap();
    let trimmed = input.trim().to_string();

    if trimmed.is_empty() && !default.is_empty() {
        default.to_string()
    } else {
        trimmed
    }
}

fn prompt_sensitive(label: &str) -> String {
    // In a real prod version use `rpassword` crate for hidden input
    // For now just prompt normally
    prompt(label, "")
}

fn write_env_file(config: &std::collections::HashMap<&str, String>) {
    let mut output = String::new();
    output.push_str("# Rooiam Configuration — generated by setup wizard\n\n");

    // Ordered output
    let order = [
        "ROOIAM_HOST",
        "ROOIAM_PORT",
        "ROOIAM_SERVER_URL",
        "ROOIAM_APP_URL",
        "ROOIAM_ADMIN_URL",
        "ROOIAM_DATABASE_URL",
        "ROOIAM_REDIS_URL",
        "ROOIAM_SMTP_HOST",
        "ROOIAM_SMTP_PORT",
        "ROOIAM_SMTP_USER",
        "ROOIAM_SMTP_PASS",
        "ROOIAM_SMTP_FROM",
        "ROOIAM_GOOGLE_CLIENT_ID",
        "ROOIAM_GOOGLE_CLIENT_SECRET",
        "ROOIAM_MICROSOFT_CLIENT_ID",
        "ROOIAM_MICROSOFT_CLIENT_SECRET",
        "ROOIAM_MICROSOFT_TENANT_ID",
    ];

    for key in &order {
        if let Some(val) = config.get(key) {
            if !val.is_empty() {
                output.push_str(&format!("{}={}\n", key, val));
            }
        }
    }

    let mut file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(".env")
        .expect("Cannot write .env file");

    file.write_all(output.as_bytes())
        .expect("Failed to write .env");
}
