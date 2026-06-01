/// Compute a session binding fingerprint from user-agent and IP address.
///
/// The fingerprint encodes:
/// - Device class: "mobile" if UA contains "Mobile", "desktop" otherwise
/// - IP subnet: /24 for IPv4, /48 for IPv6 (truncated to 6 hex chars)
///
/// Bound sessions that move to a different fingerprint are flagged in the audit log.
use sha2::{Digest, Sha256};
use std::net::IpAddr;

/// Classify user-agent string into broad device class.
pub fn device_class(user_agent: Option<&str>) -> &'static str {
    match user_agent {
        Some(ua) if ua.contains("Mobile") || ua.contains("Android") => "mobile",
        _ => "desktop",
    }
}

/// Reduce IP to a /24 (IPv4) or /48 (IPv6) subnet string for coarse binding.
pub fn ip_subnet(ip: Option<IpAddr>) -> String {
    match ip {
        Some(IpAddr::V4(v4)) => {
            let octets = v4.octets();
            format!("{}.{}.{}.0/24", octets[0], octets[1], octets[2])
        }
        Some(IpAddr::V6(v6)) => {
            let segs = v6.segments();
            format!("{:x}:{:x}:{:x}::/48", segs[0], segs[1], segs[2])
        }
        None => "unknown".to_string(),
    }
}

/// Compute the fingerprint as sha256(device_class/ip_subnet), hex-encoded.
pub fn compute(user_agent: Option<&str>, ip: Option<IpAddr>) -> String {
    let input = format!("{}/{}", device_class(user_agent), ip_subnet(ip));
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    hex::encode(hasher.finalize())
}
