use actix_web::error::{JsonPayloadError, PathError, QueryPayloadError, UrlencodedError};
use actix_web::{web, HttpRequest};

use crate::shared::error::AppError;

pub fn json_config(max_bytes: usize) -> web::JsonConfig {
    web::JsonConfig::default()
        .limit(max_bytes)
        .error_handler(|err, req| validation_error(req, "json_body", err.to_string()).into())
}

pub fn query_config() -> web::QueryConfig {
    web::QueryConfig::default()
        .error_handler(|err, req| validation_error(req, "query", err.to_string()).into())
}

pub fn path_config() -> web::PathConfig {
    web::PathConfig::default()
        .error_handler(|err, req| validation_error(req, "path", err.to_string()).into())
}

pub fn form_config() -> web::FormConfig {
    web::FormConfig::default()
        .error_handler(|err, req| validation_error(req, "form_body", err.to_string()).into())
}

fn validation_error<T: std::fmt::Display>(
    req: &HttpRequest,
    source: &'static str,
    err: T,
) -> AppError {
    let detail = normalize_extractor_error(source, err.to_string());

    tracing::warn!(
        method = %req.method(),
        path = %req.path(),
        query = %req.query_string(),
        validation_source = source,
        error = %detail,
        "request validation rejected"
    );

    AppError::Validation(detail)
}

pub fn normalize_extractor_error(source: &str, raw: String) -> String {
    if raw.contains("unknown field") {
        if let Some(field) = extract_backtick_value_after(&raw, "unknown field") {
            let noun = input_noun(source);
            let allowed = extract_expected_fields(&raw)
                .map(|fields| format!(" Allowed {}s: {}.", noun, fields.join(", ")))
                .unwrap_or_default();
            return format!(
                "Invalid {}: unknown {} '{}' is not allowed.{}",
                source, noun, field, allowed
            );
        }
        return format!(
            "Invalid {}: request contains an unknown parameter or field. {}",
            source, raw
        );
    }

    if raw.contains("missing field") {
        if let Some(field) = extract_backtick_value_after(&raw, "missing field") {
            return format!(
                "Invalid {}: required {} '{}' is missing.",
                source,
                input_noun(source),
                field
            );
        }
        return format!(
            "Invalid {}: required parameter or field is missing. {}",
            source, raw
        );
    }

    if raw.contains("duplicate field") {
        if let Some(field) = extract_backtick_value_after(&raw, "duplicate field") {
            return format!(
                "Invalid {}: duplicate {} '{}' is not allowed.",
                source,
                input_noun(source),
                field
            );
        }
        return format!(
            "Invalid {}: duplicate parameter or field is not allowed. {}",
            source, raw
        );
    }

    if raw.contains("EOF") {
        return format!(
            "Invalid {}: request body is incomplete or malformed. {}",
            source, raw
        );
    }

    format!("Invalid {}: {}", source, raw)
}

fn input_noun(source: &str) -> &'static str {
    match source {
        "query" => "parameter",
        "path" => "parameter",
        "form_body" => "field",
        "json_body" => "field",
        _ => "field",
    }
}

fn extract_backtick_value_after(raw: &str, marker: &str) -> Option<String> {
    let start = raw.find(marker)?;
    let tail = &raw[start + marker.len()..];
    let first = tail.find('`')?;
    let rest = &tail[first + 1..];
    let second = rest.find('`')?;
    Some(rest[..second].to_string())
}

fn extract_expected_fields(raw: &str) -> Option<Vec<String>> {
    let marker = "expected one of";
    let start = raw.find(marker)?;
    let tail = &raw[start + marker.len()..];
    let mut fields = Vec::new();
    let mut rest = tail;

    loop {
        let Some(first) = rest.find('`') else {
            break;
        };
        let after_first = &rest[first + 1..];
        let Some(second) = after_first.find('`') else {
            break;
        };
        fields.push(after_first[..second].to_string());
        rest = &after_first[second + 1..];
    }

    if fields.is_empty() {
        None
    } else {
        Some(fields)
    }
}

#[allow(dead_code)]
fn _type_check_errors(_: JsonPayloadError, _: QueryPayloadError, _: PathError, _: UrlencodedError) {
}

#[cfg(test)]
mod tests {
    use super::normalize_extractor_error;

    #[test]
    fn unknown_query_parameter_names_parameter_and_allowed_list() {
        let message = normalize_extractor_error(
            "query",
            "Query deserialize error: unknown field `app`, expected one of `preview`, `workspace_id`, `workspace`, `org`, `client_id`".into(),
        );

        assert_eq!(
            message,
            "Invalid query: unknown parameter 'app' is not allowed. Allowed parameters: preview, workspace_id, workspace, org, client_id."
        );
    }

    #[test]
    fn missing_json_field_names_field() {
        let message = normalize_extractor_error(
            "json_body",
            "Json deserialize error: missing field `client_id` at line 1 column 2".into(),
        );

        assert_eq!(
            message,
            "Invalid json_body: required field 'client_id' is missing."
        );
    }

    #[test]
    fn duplicate_form_field_names_field() {
        let message = normalize_extractor_error(
            "form_body",
            "Urlencoded deserialize error: duplicate field `token`".into(),
        );

        assert_eq!(
            message,
            "Invalid form_body: duplicate field 'token' is not allowed."
        );
    }
}
