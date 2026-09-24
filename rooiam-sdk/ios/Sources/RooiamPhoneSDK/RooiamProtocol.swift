import CryptoKit
import Foundation
import Security

public enum RooiamPhoneError: Error, LocalizedError {
    case invalidOrigin
    case invalidQR
    case wrongServer
    case invalidResponse
    case signInRequired
    case alreadyEnrolled
    case enrollmentMismatch
    case attestationUnavailable
    case expired
    case reviewUsed
    case confirmationMismatch
    case redirectRefused
    case httpStatus(Int)
    case keychain(OSStatus)

    public var errorDescription: String? {
        switch self {
        case .invalidOrigin: return "Use a trusted HTTPS Rooiam API origin."
        case .invalidQR: return "This is not a supported Rooiam QR code."
        case .wrongServer: return "This QR belongs to another Rooiam server."
        case .invalidResponse: return "The Rooiam server returned an invalid response."
        case .signInRequired: return "Sign in to Rooiam before using this phone."
        case .alreadyEnrolled: return "This phone is already enrolled."
        case .enrollmentMismatch: return "The stored enrollment belongs to another account or server."
        case .attestationUnavailable: return "Apple App Attest is not available on this device."
        case .expired: return "This request expired. Scan a new QR code."
        case .reviewUsed: return "Scan and review this request again."
        case .confirmationMismatch: return "The confirmation number or code differs."
        case .redirectRefused: return "The API redirected unexpectedly; check the configured origin."
        case .httpStatus(let status): return "Rooiam request failed (HTTP \(status))."
        case .keychain(let status): return "Could not access this app's Keychain item (\(status))."
        }
    }
}

public enum RooiamPhoneProtocol {
    public enum QRKind: Equatable { case login, actionApproval }

    /// Returns a canonical origin and rejects paths, credentials and mixed origins.
    public static func origin(_ raw: String, allowLocalPreview: Bool = false) throws -> URL {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let parts = URLComponents(string: text),
              let scheme = parts.scheme?.lowercased(),
              let host = parts.host?.lowercased(), !host.isEmpty,
              parts.user == nil, parts.password == nil,
              parts.query == nil, parts.fragment == nil,
              parts.path.isEmpty || parts.path == "/" else { throw RooiamPhoneError.invalidOrigin }
        let loopback = host == "localhost" || host == "127.0.0.1" || host == "::1"
        guard scheme == "https" || (allowLocalPreview && scheme == "http" && loopback) else {
            throw RooiamPhoneError.invalidOrigin
        }
        var canonical = URLComponents()
        canonical.scheme = scheme
        canonical.host = host
        canonical.port = parts.port
        guard let url = canonical.url else { throw RooiamPhoneError.invalidOrigin }
        return url
    }

    /// Parses before any session cookie is fetched or network request is made.
    public static func requestID(from qr: String, kind: QRKind, enrolledOrigin: URL,
                                 allowLocalPreview: Bool = false) throws -> UUID {
        guard qr.utf8.count <= 2048, let parts = URLComponents(string: qr),
              parts.scheme == "rooiam", parts.fragment == nil, parts.path.isEmpty,
              let items = parts.queryItems else { throw RooiamPhoneError.invalidQR }
        let expectedHost = kind == .login ? "device-login" : "action-approval"
        guard parts.host == expectedHost else { throw RooiamPhoneError.invalidQR }
        var values: [String: String] = [:]
        let keys: Set<String> = kind == .login ? ["server", "public_id"] : ["server", "id", "v"]
        for item in items {
            guard keys.contains(item.name), let value = item.value, values[item.name] == nil else {
                throw RooiamPhoneError.invalidQR
            }
            values[item.name] = value
        }
        guard Set(values.keys) == keys,
              kind == .login || values["v"] == "1" else { throw RooiamPhoneError.invalidQR }
        let qrOrigin = try origin(values["server"] ?? "", allowLocalPreview: allowLocalPreview)
        guard qrOrigin == enrolledOrigin else { throw RooiamPhoneError.wrongServer }
        let idText = values[kind == .login ? "public_id" : "id"] ?? ""
        guard let id = UUID(uuidString: idText), id.uuidString.lowercased() == idText.lowercased() else {
            throw RooiamPhoneError.invalidQR
        }
        return id
    }

    public static func appAttestClientDataHash(challenge: String, devicePublicKey: String,
                                               appID: String, keyID: String,
                                               environment: String) -> Data {
        let input = "rooiam-apple-app-attest/v1\n\(challenge)\n\(devicePublicKey)\n\(appID)\n\(keyID)\n\(environment)"
        return Data(SHA256.hash(data: Data(input.utf8)))
    }

    /// Only an exact frontend or API verification endpoint may be pasted into
    /// the app-owned WebKit login view. Never consume a link in another browser.
    public static func emailLink(_ raw: String, frontend: URL, api: URL) throws -> URL {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let parts = URLComponents(string: text), parts.user == nil, parts.password == nil,
              parts.fragment == nil, parts.query != nil, let url = parts.url else {
            throw RooiamPhoneError.invalidOrigin
        }
        var linkOrigin = URLComponents()
        linkOrigin.scheme = parts.scheme
        linkOrigin.host = parts.host
        linkOrigin.port = parts.port
        let frontendLink = linkOrigin.url == frontend && parts.path == "/verify"
        let apiLink = linkOrigin.url == api && parts.path == "/v1/auth/magic-link/verify"
        guard frontendLink || apiLink else { throw RooiamPhoneError.invalidOrigin }
        return url
    }

    static func base64URL(_ bytes: Data) -> String {
        bytes.base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}
