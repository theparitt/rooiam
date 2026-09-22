# Chapter 10: Activity and Audit Logs

Audit records help answer who acted, which workspace was affected, and what happened. They support investigation but must be described with the durability guarantees the implementation actually provides.

## The current record

`AuditEvent` is defined in `modules/audit/service.rs`, alongside `AuditService`. It contains:

- `actor_user_id` and optional `organization_id`
- `action`, `target_type`, and optional string `target_id`
- `ip`, `user_agent`, and JSON `metadata`

The database adds an integer log ID and creation timestamp. An organization ID may be absent for platform-level activity; not every event belongs to one workspace.

Example of constructing an event (illustrative caller code):

```rust
let event = AuditEvent {
    actor_user_id: Some(user_id),
    organization_id: Some(org_id),
    action: "example.action".into(),
    target_type: "example".into(),
    target_id: Some(target_id.to_string()),
    ip: None,
    user_agent: None,
    metadata: serde_json::json!({ "reason": "example" }),
};
AuditService::new(pool.clone()).log(event).await;
```

Use established action names in real handlers. The example does not define a new production event type or a complete standalone Rust program.

## Persistence and its limits

`AuditService::log` inserts the record and obtains its ID and timestamp. If insertion fails, it logs an error and returns. It does not return a failure result to force the caller's business operation to roll back.

The current migrations do **not** install an audit immutability trigger or a cryptographic hash chain. A database administrator can alter data. There is no guarantee that every business operation and audit row commit atomically.

## Retention and external delivery

`shared/audit_retention.rs` reads `audit_log_retention_days` from `system_settings` and deletes older records when a positive retention period is configured. Missing, empty, or `null` values keep records indefinitely; the task runs a pass and then waits 24 hours before repeating.

After a successful insert, the audit service spawns optional SIEM webhook delivery. The destination and secret come from system settings. Delivery is asynchronous rather than a durable outbox with guaranteed retry. A configured external collector can preserve another copy, but operators must verify actual delivery and retention.

## Scope and sensitive data

Audit visibility is scoped through the relevant operator, workspace, user, or integration endpoint. Inspect those queries when deciding who may see an event. Metadata is event-specific; it does not universally retain every actor's name/email or every before/after field.

Do not put raw cookies, magic-link tokens, client secrets, or full API keys into metadata. A searchable audit trail should not become another credential store.

## Exercises

1. What happens to a business operation if its audit insert fails?
2. Why is an asynchronous webhook different from a durable transactional outbox?
3. Trace a workspace activity endpoint and identify its scope filters.

## Follow the source

- [rooiam-server/src/modules/audit/service.rs](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/src/modules/audit/service.rs)
- [rooiam-server/src/shared/audit_retention.rs](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/src/shared/audit_retention.rs)
- [rooiam-server/migrations/0001_init.sql](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/migrations/0001_init.sql)
- [rooiam-server/migrations/0032_audit_log_retention.sql](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/migrations/0032_audit_log_retention.sql)
