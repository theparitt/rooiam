use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use chrono::{DateTime, Utc};
use der_parser::ber::Class;
use der_parser::der::{
    parse_der_container, parse_der_octetstring, parse_der_tagged_explicit, Header, Tag,
};
use der_parser::nom;
use serde::Deserialize;
use serde_cbor_2::Value;
use sha2::{Digest, Sha256};
use x509_parser::prelude::parse_x509_certificate;
use x509_parser::time::ASN1Time;

use crate::bootstrap::config::AppConfig;

use super::service::{
    decode_base64_bytes, is_development_environment, StoredDeviceAttestationChallenge,
};

const APPLE_APP_ATTESTATION_ROOT_CA_PEM: &str = "-----BEGIN CERTIFICATE-----\nMIICITCCAaegAwIBAgIQC/O+DvHN0uD7jG5yH2IXmDAKBggqhkjOPQQDAzBSMSYw\nJAYDVQQDDB1BcHBsZSBBcHAgQXR0ZXN0YXRpb24gUm9vdCBDQTETMBEGA1UECgwK\nQXBwbGUgSW5jLjETMBEGA1UECAwKQ2FsaWZvcm5pYTAeFw0yMDAzMTgxODMyNTNa\nFw00NTAzMTUwMDAwMDBaMFIxJjAkBgNVBAMMHUFwcGxlIEFwcCBBdHRlc3RhdGlv\nbiBSb290IENBMRMwEQYDVQQKDApBcHBsZSBJbmMuMRMwEQYDVQQIDApDYWxpZm9y\nbmlhMHYwEAYHKoZIzj0CAQYFK4EEACIDYgAERTHhmLW07ATaFQIEVwTtT4dyctdh\nNbJhFs/Ii2FdCgAHGbpphY3+d8qjuDngIN3WVhQUBHAoMeQ/cLiP1sOUtgjqK9au\nYen1mMEvRq9Sk3Jm5X8U62H+xTD3FE9TgS41o0IwQDAPBgNVHRMBAf8EBTADAQH/\nMB0GA1UdDgQWBBSskRBTM72+aEH/pwyp5frq5eWKoTAOBgNVHQ8BAf8EBAMCAQYw\nCgYIKoZIzj0EAwMDaAAwZQIwQgFGnByvsiVbpTKwSga0kP0e8EeDS4+sQmTvb7vn\n53O5+FRXgeLhpJ06ysC5PrOyAjEAp5U4xDgEgllF7En3VcE3iexZZtKeYnpqtijV\noyFraWVIyd/dganmrduC1bmTBGwD\n-----END CERTIFICATE-----";

const APPLE_APP_ATTEST_OID_NONCE: der_parser::oid::Oid<'static> =
    der_parser::oid!(1.2.840 .113635 .100 .8 .2);
const APPLE_APP_ATTEST_AAGUID_PRODUCTION: [u8; 16] = *b"appattest\0\0\0\0\0\0\0";
const APPLE_APP_ATTEST_AAGUID_DEVELOPMENT: [u8; 16] = *b"appattestdevelop";
const APPLE_APP_ATTEST_AAGUID_SANDBOX: [u8; 16] = *b"appattestsandbox";

#[derive(Clone, Debug)]
pub struct AppleAppAttestVerifierConfig {
    pub app_id_prefix: String,
}

#[derive(Clone, Debug)]
pub struct VerifiedAppleAppAttest {
    pub issued_at: DateTime<Utc>,
}

#[derive(Clone, Debug)]
pub enum AppleAppAttestVerificationError {
    Rejected(String),
    Unavailable(String),
}

#[derive(Deserialize)]
struct AppleAppAttestStatementEnvelope {
    attestation_object: Option<String>,
    #[serde(rename = "attestationObject")]
    attestation_object_camel: Option<String>,
}

struct ParsedAppleAttestationObject {
    fmt: String,
    auth_data_bytes: Vec<u8>,
    att_stmt: Value,
}

struct ParsedAppleAuthData {
    rp_id_hash: [u8; 32],
    counter: u32,
    aaguid: [u8; 16],
    credential_id: Vec<u8>,
    credential_public_key_uncompressed: Vec<u8>,
}

pub fn load_apple_app_attest_verifier_config(
    config: &AppConfig,
) -> Result<AppleAppAttestVerifierConfig, AppleAppAttestVerificationError> {
    let Some(app_id_prefix) = config
        .device_attestation
        .apple_app_id_prefix
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    else {
        return Err(AppleAppAttestVerificationError::Unavailable(
            "Apple App Attest verification is not configured: set ROOIAM_APPLE_APP_ID_PREFIX to your Apple Team ID / App ID prefix before registering iOS trusted devices.".into(),
        ));
    };

    Ok(AppleAppAttestVerifierConfig { app_id_prefix })
}

pub fn build_apple_app_attest_client_data_hash(
    challenge: &str,
    device_public_key: &str,
    app_id: &str,
    key_id: &str,
    environment: &str,
) -> [u8; 32] {
    let payload = format!(
        "rooiam-apple-app-attest/v1\n{}\n{}\n{}\n{}\n{}",
        challenge, device_public_key, app_id, key_id, environment
    );
    let digest = Sha256::digest(payload.as_bytes());
    let mut output = [0u8; 32];
    output.copy_from_slice(&digest);
    output
}

pub fn verify_apple_app_attest_attestation(
    config: &AppleAppAttestVerifierConfig,
    challenge: &StoredDeviceAttestationChallenge,
    statement_raw: &str,
) -> Result<VerifiedAppleAppAttest, AppleAppAttestVerificationError> {
    let attestation_object_bytes = extract_attestation_object_bytes(statement_raw)?;
    let attestation_object = parse_attestation_object(&attestation_object_bytes)?;
    if attestation_object.fmt != "apple-appattest" {
        return Err(AppleAppAttestVerificationError::Rejected(format!(
            "Apple App Attest statement fmt must be 'apple-appattest', got '{}'.",
            attestation_object.fmt
        )));
    }

    let auth_data = parse_auth_data(&attestation_object.auth_data_bytes)?;
    let bundle_app_id = format!("{}.{}", config.app_id_prefix, challenge.app_id);
    let expected_rp_id_hash = Sha256::digest(bundle_app_id.as_bytes());
    if auth_data.rp_id_hash != expected_rp_id_hash[..] {
        return Err(AppleAppAttestVerificationError::Rejected(
            "Apple App Attest rpIdHash does not match the configured App ID prefix and bundle identifier.".into(),
        ));
    }

    validate_aaguid(&auth_data.aaguid, &challenge.environment)?;

    let decoded_key_id = decode_base64_bytes(&challenge.key_id).map_err(|_| {
        AppleAppAttestVerificationError::Rejected(
            "Apple App Attest key_id must be base64 or base64url.".into(),
        )
    })?;
    if auth_data.credential_id != decoded_key_id {
        return Err(AppleAppAttestVerificationError::Rejected(
            "Apple App Attest credential ID does not match the registered key_id.".into(),
        ));
    }

    let certificate_chain = extract_x5c_certificate_chain(&attestation_object.att_stmt)?;
    if certificate_chain.len() < 2 {
        return Err(AppleAppAttestVerificationError::Rejected(
            "Apple App Attest statement must include both leaf and intermediate certificates."
                .into(),
        ));
    }

    let root_der = parse_embedded_pem_certificate(APPLE_APP_ATTESTATION_ROOT_CA_PEM)?;
    let root = parse_certificate(&root_der)?;
    let leaf = parse_certificate(&certificate_chain[0])?;
    let intermediate = parse_certificate(&certificate_chain[1])?;
    let now = ASN1Time::now();
    if !root.validity().is_valid_at(now)
        || !intermediate.validity().is_valid_at(now)
        || !leaf.validity().is_valid_at(now)
    {
        return Err(AppleAppAttestVerificationError::Rejected(
            "Apple App Attest certificate chain is not currently valid.".into(),
        ));
    }
    leaf.verify_signature(Some(&intermediate.tbs_certificate.subject_pki))
        .map_err(|_| {
            AppleAppAttestVerificationError::Rejected(
                "Apple App Attest leaf certificate signature is invalid.".into(),
            )
        })?;
    intermediate
        .verify_signature(Some(&root.tbs_certificate.subject_pki))
        .map_err(|_| {
            AppleAppAttestVerificationError::Rejected(
                "Apple App Attest intermediate certificate signature is invalid.".into(),
            )
        })?;

    let client_data_hash = build_apple_app_attest_client_data_hash(
        &challenge.challenge,
        &challenge.device_public_key,
        &challenge.app_id,
        &challenge.key_id,
        &challenge.environment,
    );
    let expected_nonce = Sha256::digest(
        attestation_object
            .auth_data_bytes
            .iter()
            .chain(client_data_hash.iter())
            .copied()
            .collect::<Vec<_>>(),
    );
    let certificate_nonce = extract_nonce_extension(&leaf)?;
    if certificate_nonce != expected_nonce[..] {
        return Err(AppleAppAttestVerificationError::Rejected(
            "Apple App Attest certificate nonce does not match the issued challenge and registration binding.".into(),
        ));
    }

    let subject_public_key = leaf.tbs_certificate.subject_pki.subject_public_key.data;
    if subject_public_key.as_ref() != auth_data.credential_public_key_uncompressed.as_slice() {
        return Err(AppleAppAttestVerificationError::Rejected(
            "Apple App Attest credential public key does not match the attestation certificate subject key.".into(),
        ));
    }

    let key_id_hash = Sha256::digest(subject_public_key);
    if decoded_key_id != key_id_hash[..] {
        return Err(AppleAppAttestVerificationError::Rejected(
            "Apple App Attest key_id does not match the certificate subject public key hash."
                .into(),
        ));
    }

    let issued_at = extract_receipt_creation_date(statement_raw).unwrap_or_else(Utc::now);
    let _ = auth_data.counter;

    Ok(VerifiedAppleAppAttest { issued_at })
}

fn extract_attestation_object_bytes(
    statement_raw: &str,
) -> Result<Vec<u8>, AppleAppAttestVerificationError> {
    let trimmed = statement_raw.trim();
    if trimmed.starts_with('{') {
        let envelope: AppleAppAttestStatementEnvelope =
            serde_json::from_str(trimmed).map_err(|_| {
                AppleAppAttestVerificationError::Rejected(
                    "Apple App Attest statement JSON is invalid.".into(),
                )
            })?;
        let attestation_object = envelope
            .attestation_object
            .or(envelope.attestation_object_camel)
            .ok_or_else(|| {
                AppleAppAttestVerificationError::Rejected(
                    "Apple App Attest statement JSON must include attestation_object.".into(),
                )
            })?;
        return decode_base64_bytes(attestation_object.trim()).map_err(|_| {
            AppleAppAttestVerificationError::Rejected(
                "Apple App Attest attestation_object must be base64 or base64url.".into(),
            )
        });
    }

    decode_base64_bytes(trimmed).map_err(|_| {
        AppleAppAttestVerificationError::Rejected(
            "Apple App Attest statement must be a base64/base64url attestation object or JSON envelope.".into(),
        )
    })
}

fn parse_attestation_object(
    bytes: &[u8],
) -> Result<ParsedAppleAttestationObject, AppleAppAttestVerificationError> {
    let value: Value = serde_cbor_2::from_slice(bytes).map_err(|_| {
        AppleAppAttestVerificationError::Rejected(
            "Apple App Attest attestation object is not valid CBOR.".into(),
        )
    })?;
    let map = cbor_map(&value)?;
    let fmt = cbor_text(map.get(&Value::Text("fmt".into())).ok_or_else(|| {
        AppleAppAttestVerificationError::Rejected(
            "Apple App Attest attestation object is missing fmt.".into(),
        )
    })?)?
    .to_string();
    let auth_data_bytes =
        cbor_bytes(map.get(&Value::Text("authData".into())).ok_or_else(|| {
            AppleAppAttestVerificationError::Rejected(
                "Apple App Attest attestation object is missing authData.".into(),
            )
        })?)?
        .to_vec();
    let att_stmt = map
        .get(&Value::Text("attStmt".into()))
        .cloned()
        .ok_or_else(|| {
            AppleAppAttestVerificationError::Rejected(
                "Apple App Attest attestation object is missing attStmt.".into(),
            )
        })?;

    Ok(ParsedAppleAttestationObject {
        fmt,
        auth_data_bytes,
        att_stmt,
    })
}

fn parse_auth_data(bytes: &[u8]) -> Result<ParsedAppleAuthData, AppleAppAttestVerificationError> {
    if bytes.len() < 55 {
        return Err(AppleAppAttestVerificationError::Rejected(
            "Apple App Attest authData is too short.".into(),
        ));
    }
    let mut offset = 0usize;
    let rp_id_hash: [u8; 32] = bytes[offset..offset + 32]
        .try_into()
        .expect("slice length is fixed");
    offset += 32;
    let flags = bytes[offset];
    offset += 1;
    if flags & 0x40 == 0 {
        return Err(AppleAppAttestVerificationError::Rejected(
            "Apple App Attest authData is missing attested credential data.".into(),
        ));
    }
    let counter = u32::from_be_bytes(
        bytes[offset..offset + 4]
            .try_into()
            .expect("slice length is fixed"),
    );
    offset += 4;
    let aaguid: [u8; 16] = bytes[offset..offset + 16]
        .try_into()
        .expect("slice length is fixed");
    offset += 16;
    let credential_id_len = u16::from_be_bytes(
        bytes[offset..offset + 2]
            .try_into()
            .expect("slice length is fixed"),
    ) as usize;
    offset += 2;
    if bytes.len() < offset + credential_id_len {
        return Err(AppleAppAttestVerificationError::Rejected(
            "Apple App Attest credential ID length is invalid.".into(),
        ));
    }
    let credential_id = bytes[offset..offset + credential_id_len].to_vec();
    offset += credential_id_len;
    if bytes.len() <= offset {
        return Err(AppleAppAttestVerificationError::Rejected(
            "Apple App Attest credential public key is missing.".into(),
        ));
    }

    let mut deserializer = serde_cbor_2::Deserializer::from_slice(&bytes[offset..]);
    let credential_public_key_value = Value::deserialize(&mut deserializer).map_err(|_| {
        AppleAppAttestVerificationError::Rejected(
            "Apple App Attest credential public key is not valid CBOR.".into(),
        )
    })?;
    let credential_public_key_uncompressed =
        parse_cose_ec2_public_key_uncompressed(&credential_public_key_value)?;

    Ok(ParsedAppleAuthData {
        rp_id_hash,
        counter,
        aaguid,
        credential_id,
        credential_public_key_uncompressed,
    })
}

fn parse_cose_ec2_public_key_uncompressed(
    value: &Value,
) -> Result<Vec<u8>, AppleAppAttestVerificationError> {
    let map = cbor_map(value)?;
    let kty = map
        .get(&Value::Integer(1))
        .and_then(|value| match value {
            Value::Integer(number) => Some(*number),
            _ => None,
        })
        .ok_or_else(|| {
            AppleAppAttestVerificationError::Rejected(
                "Apple App Attest COSE key is missing kty.".into(),
            )
        })?;
    let curve = map
        .get(&Value::Integer(-1))
        .and_then(|value| match value {
            Value::Integer(number) => Some(*number),
            _ => None,
        })
        .ok_or_else(|| {
            AppleAppAttestVerificationError::Rejected(
                "Apple App Attest COSE key is missing curve.".into(),
            )
        })?;
    let x = map
        .get(&Value::Integer(-2))
        .and_then(|value| match value {
            Value::Bytes(bytes) => Some(bytes.as_slice()),
            _ => None,
        })
        .ok_or_else(|| {
            AppleAppAttestVerificationError::Rejected(
                "Apple App Attest COSE key is missing x coordinate.".into(),
            )
        })?;
    let y = map
        .get(&Value::Integer(-3))
        .and_then(|value| match value {
            Value::Bytes(bytes) => Some(bytes.as_slice()),
            _ => None,
        })
        .ok_or_else(|| {
            AppleAppAttestVerificationError::Rejected(
                "Apple App Attest COSE key is missing y coordinate.".into(),
            )
        })?;
    if kty != 2 || curve != 1 || x.len() != 32 || y.len() != 32 {
        return Err(AppleAppAttestVerificationError::Rejected(
            "Apple App Attest COSE key must be EC2 / P-256.".into(),
        ));
    }

    let mut public_key = Vec::with_capacity(65);
    public_key.push(0x04);
    public_key.extend_from_slice(x);
    public_key.extend_from_slice(y);
    Ok(public_key)
}

fn extract_x5c_certificate_chain(
    att_stmt: &Value,
) -> Result<Vec<Vec<u8>>, AppleAppAttestVerificationError> {
    let map = cbor_map(att_stmt)?;
    let x5c = map.get(&Value::Text("x5c".into())).ok_or_else(|| {
        AppleAppAttestVerificationError::Rejected("Apple App Attest attStmt is missing x5c.".into())
    })?;
    let array = match x5c {
        Value::Array(values) => values,
        _ => {
            return Err(AppleAppAttestVerificationError::Rejected(
                "Apple App Attest x5c must be an array.".into(),
            ))
        }
    };

    array
        .iter()
        .map(|value| match value {
            Value::Bytes(bytes) => Ok(bytes.clone()),
            _ => Err(AppleAppAttestVerificationError::Rejected(
                "Apple App Attest x5c entries must be DER certificate bytes.".into(),
            )),
        })
        .collect()
}

fn parse_embedded_pem_certificate(pem: &str) -> Result<Vec<u8>, AppleAppAttestVerificationError> {
    let base64_data = pem
        .lines()
        .map(str::trim)
        .filter(|line| !line.starts_with("-----"))
        .collect::<String>();
    STANDARD.decode(base64_data).map_err(|_| {
        AppleAppAttestVerificationError::Unavailable(
            "Embedded Apple App Attestation Root CA certificate is unreadable.".into(),
        )
    })
}

fn parse_certificate<'a>(
    der: &'a [u8],
) -> Result<x509_parser::certificate::X509Certificate<'a>, AppleAppAttestVerificationError> {
    parse_x509_certificate(der)
        .map(|(_, cert)| cert)
        .map_err(|_| {
            AppleAppAttestVerificationError::Rejected(
                "Apple App Attest certificate chain contains invalid DER.".into(),
            )
        })
}

fn extract_nonce_extension(
    cert: &x509_parser::certificate::X509Certificate<'_>,
) -> Result<[u8; 32], AppleAppAttestVerificationError> {
    let extension = cert
        .extensions()
        .iter()
        .find(|extension| extension.oid == APPLE_APP_ATTEST_OID_NONCE)
        .ok_or_else(|| {
            AppleAppAttestVerificationError::Rejected(
                "Apple App Attest nonce extension is missing from the attestation certificate."
                    .into(),
            )
        })?;
    parse_der_container(|i: &[u8], hdr: Header| {
        if hdr.tag() != Tag::Sequence {
            return Err(nom::Err::Failure(der_parser::error::BerError::BerTypeError));
        }
        let (i, tagged_nonce) = parse_der_tagged_explicit(1, parse_der_octetstring)(i)?;
        let (class, _tag, nonce) = tagged_nonce.as_tagged()?;
        if class != Class::ContextSpecific {
            return Err(nom::Err::Failure(der_parser::error::BerError::BerTypeError));
        }
        let nonce: [u8; 32] = nonce
            .as_slice()?
            .try_into()
            .map_err(|_| nom::Err::Failure(der_parser::error::BerError::InvalidLength))?;
        Ok((i, nonce))
    })(extension.value)
    .map(|(_, nonce)| nonce)
    .map_err(|_| {
        AppleAppAttestVerificationError::Rejected(
            "Apple App Attest nonce extension is malformed.".into(),
        )
    })
}

fn validate_aaguid(
    aaguid: &[u8; 16],
    environment: &str,
) -> Result<(), AppleAppAttestVerificationError> {
    if is_development_environment(environment) {
        if aaguid == &APPLE_APP_ATTEST_AAGUID_DEVELOPMENT
            || aaguid == &APPLE_APP_ATTEST_AAGUID_SANDBOX
        {
            return Ok(());
        }
        return Err(AppleAppAttestVerificationError::Rejected(
            "Apple App Attest development/sandbox AAGUID does not match the requested environment."
                .into(),
        ));
    }

    if aaguid != &APPLE_APP_ATTEST_AAGUID_PRODUCTION {
        return Err(AppleAppAttestVerificationError::Rejected(
            "Apple App Attest production AAGUID is invalid.".into(),
        ));
    }

    Ok(())
}

fn extract_receipt_creation_date(statement_raw: &str) -> Option<DateTime<Utc>> {
    if !statement_raw.trim_start().starts_with('{') {
        return None;
    }
    let value: serde_json::Value = serde_json::from_str(statement_raw).ok()?;
    let date = value
        .get("receiptCreationDate")
        .or_else(|| value.get("receipt_creation_date"))
        .or_else(|| {
            value
                .get("appAttest")
                .and_then(|value| value.get("receiptCreationDate"))
        })?
        .as_str()?;
    chrono::DateTime::parse_from_rfc3339(date)
        .ok()
        .map(|value| value.with_timezone(&Utc))
}

fn cbor_map(
    value: &Value,
) -> Result<&std::collections::BTreeMap<Value, Value>, AppleAppAttestVerificationError> {
    match value {
        Value::Map(map) => Ok(map),
        _ => Err(AppleAppAttestVerificationError::Rejected(
            "Apple App Attest CBOR value must be a map.".into(),
        )),
    }
}

fn cbor_text(value: &Value) -> Result<&str, AppleAppAttestVerificationError> {
    match value {
        Value::Text(text) => Ok(text.as_str()),
        _ => Err(AppleAppAttestVerificationError::Rejected(
            "Apple App Attest CBOR value must be text.".into(),
        )),
    }
}

fn cbor_bytes(value: &Value) -> Result<&[u8], AppleAppAttestVerificationError> {
    match value {
        Value::Bytes(bytes) => Ok(bytes.as_slice()),
        _ => Err(AppleAppAttestVerificationError::Rejected(
            "Apple App Attest CBOR value must be bytes.".into(),
        )),
    }
}
