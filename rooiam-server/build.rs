use std::process::Command;

fn main() {
    // This crate lives below the repository root; watch the resolved Git paths
    // (also valid in linked worktrees) so local builds do not report a stale SHA.
    for path in ["HEAD", "packed-refs"] {
        if let Some(git_path) = command_output("git", &["rev-parse", "--git-path", path]) {
            println!("cargo:rerun-if-changed={git_path}");
        }
    }
    if let Some(head_ref) = command_output("git", &["symbolic-ref", "--quiet", "HEAD"]) {
        if let Some(git_path) = command_output("git", &["rev-parse", "--git-path", &head_ref]) {
            println!("cargo:rerun-if-changed={git_path}");
        }
    }
    println!("cargo:rerun-if-env-changed=ROOIAM_BUILD_REVISION");
    println!("cargo:rerun-if-env-changed=ROOIAM_BUILD_BRANCH");

    let built_at = command_output("date", &["-u", "+%Y-%m-%dT%H:%M:%SZ"])
        .unwrap_or_else(|| "unknown".to_string());
    let git_sha = build_value("ROOIAM_BUILD_REVISION")
        .or_else(|| command_output("git", &["rev-parse", "HEAD"]))
        .unwrap_or_else(|| "unknown".to_string());
    let git_branch = build_value("ROOIAM_BUILD_BRANCH")
        .or_else(|| command_output("git", &["rev-parse", "--abbrev-ref", "HEAD"]))
        .unwrap_or_else(|| "unknown".to_string());

    println!("cargo:rustc-env=ROOIAM_BUILD_TIME_UTC={built_at}");
    println!("cargo:rustc-env=ROOIAM_GIT_SHA={git_sha}");
    println!("cargo:rustc-env=ROOIAM_GIT_BRANCH={git_branch}");
}

fn build_value(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn command_output(program: &str, args: &[&str]) -> Option<String> {
    let output = Command::new(program).args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8(output.stdout).ok()?;
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}
