import Foundation

public struct PhoneEnrollment {
    public let deviceID: String
    public let attestationStatus: String
    public let recovered: Bool
}

public enum AppAttestEnvironment: String {
    case production
    case development
}

public struct LoginReview {
    public let id: UUID
    public let server: URL
    public let displayCode: String
    public let matchNumber: Int
    public let workspaceID: String?
    public let applicationID: String?
    public let redirectURI: String?
    fileprivate let deviceID: String
    fileprivate let payload: String
    fileprivate let expiresAt: Date
    fileprivate let owner: UUID
    fileprivate let nonce: UUID
}

public struct ActionReview {
    public let id: UUID
    public let server: URL
    public let workspaceName: String
    public let label: String
    public let permissionPreset: String
    public let allowedPermissions: [String]
    public let keyExpiresAt: String?
    public let displayCode: String
    fileprivate let deviceID: String
    fileprivate let payload: String
    fileprivate let expiresAt: Date
    fileprivate let owner: UUID
    fileprivate let nonce: UUID
}

/// Retain one client per signed-in app session. The app owns sign-in and supplies
/// only its Rooiam session cookie for this trusted origin.
@MainActor public final class RooiamPhoneClient {
    public let origin: URL
    private let api: PhoneAPI
    private let vault = DeviceVault()
    private let allowLocalPreview: Bool
    private let attestationEnvironment: AppAttestEnvironment
    private let clientID = UUID()
    private var usedReviews: Set<UUID> = []

    public init(origin: String, allowLocalPreview: Bool = false,
                attestationEnvironment: AppAttestEnvironment = .production,
                cookieProvider: @escaping RooiamSessionCookieProvider) throws {
        #if !DEBUG
        if allowLocalPreview { throw RooiamPhoneError.invalidOrigin }
        if attestationEnvironment == .development { throw RooiamPhoneError.attestationUnavailable }
        #endif
        let parsed = try RooiamPhoneProtocol.origin(origin, allowLocalPreview: allowLocalPreview)
        self.origin = parsed
        self.allowLocalPreview = allowLocalPreview
        self.attestationEnvironment = attestationEnvironment
        self.api = PhoneAPI(origin: parsed, cookieProvider: cookieProvider)
    }

    private func required(_ object: [String: Any], _ key: String) throws -> String {
        guard let value = object[key] as? String, !value.isEmpty else { throw RooiamPhoneError.invalidResponse }
        return value
    }

    private func date(_ object: [String: Any]) throws -> Date {
        let raw = try required(object, "expires_at")
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let value = parser.date(from: raw) { return value }
        parser.formatOptions = [.withInternetDateTime]
        guard let value = parser.date(from: raw) else { throw RooiamPhoneError.invalidResponse }
        return value
    }

    private func userID() async throws -> String {
        try await required(api.object("/v1/identity/me"), "id")
    }

    public func hostedLoginOrigin() async throws -> URL {
        let urls = try await api.object("/v1/setup/public-urls")
        return try RooiamPhoneProtocol.origin(required(urls, "frontend_url"),
                                               allowLocalPreview: allowLocalPreview)
    }

    private func serverDevice(_ draft: StoredDevice, in devices: [[String: Any]]) -> [String: Any]? {
        devices.first { ($0["device_public_key"] as? String) == draft.devicePublicKey }
    }

    public func enroll(label: String) async throws -> PhoneEnrollment {
        guard !label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              label.utf8.count <= 120 else { throw RooiamPhoneError.invalidResponse }
        guard let bundleID = Bundle.main.bundleIdentifier, !bundleID.isEmpty else {
            throw RooiamPhoneError.attestationUnavailable
        }
        let account = try await userID()
        var draft = try vault.load()
        if let existing = draft, existing.origin != origin.absoluteString || existing.userID != account {
            throw RooiamPhoneError.enrollmentMismatch
        }
        let devices = try await api.array("/v1/identity/me/devices")
        if let existing = draft, let registered = serverDevice(existing, in: devices) {
            if registered["revoked_at"] is String {
                try vault.clear()
                draft = nil
            } else {
                let id = try required(registered, "id")
                if existing.deviceID == nil {
                    var recovered = existing
                    recovered.deviceID = id
                    try vault.save(recovered)
                    return PhoneEnrollment(deviceID: id, attestationStatus: "unknown", recovered: true)
                }
                throw RooiamPhoneError.alreadyEnrolled
            }
        } else if draft?.deviceID != nil {
            throw RooiamPhoneError.enrollmentMismatch
        }
        let retryingUnregisteredDraft = draft != nil
        if draft == nil {
            draft = try StoredDevice.generate(origin: origin.absoluteString, userID: account)
            try vault.save(draft!)
        }
        var device = draft!
        // App Attest attests a key only once. After an uncertain registration,
        // keep the Rooiam signing key but create a fresh Apple key for retry.
        if retryingUnregisteredDraft || device.appAttestKeyID == nil {
            device.appAttestKeyID = try await AppAttest.generateKey()
            try vault.save(device)
        }
        let keyID = device.appAttestKeyID!
        let challenge = try await api.object("/v1/identity/me/devices/attestation-challenge", method: "POST", body: [
            "format": "ios-app-attest", "key_id": keyID, "app_id": bundleID,
            "environment": attestationEnvironment.rawValue, "device_public_key": device.devicePublicKey
        ])
        let hash = RooiamPhoneProtocol.appAttestClientDataHash(
            challenge: try required(challenge, "challenge"), devicePublicKey: device.devicePublicKey,
            appID: bundleID, keyID: keyID, environment: attestationEnvironment.rawValue)
        let attestation = try await AppAttest.attest(keyID: keyID, clientDataHash: hash)
        let issuedAt = ISO8601DateFormatter().string(from: Date())
        let statement: [String: Any] = [
            "attestation_object": attestation.base64EncodedString(),
            "public_key": device.devicePublicKey, "app_id": bundleID,
            "key_id": keyID, "environment": attestationEnvironment.rawValue, "issued_at": issuedAt
        ]
        let statementData = try JSONSerialization.data(withJSONObject: statement, options: [.sortedKeys])
        let response = try await api.object("/v1/identity/me/devices", method: "POST", body: [
            "device_label": label, "platform": "ios", "device_token": device.deviceToken,
            "device_public_key": device.devicePublicKey,
            "attestation": ["format": "ios-app-attest", "key_id": keyID, "app_id": bundleID,
                            "environment": attestationEnvironment.rawValue, "challenge_token": try required(challenge, "challenge_token"),
                            "statement": String(decoding: statementData, as: UTF8.self)]
        ])
        let id = try required(response, "id")
        device.deviceID = id
        try vault.save(device)
        let summary = response["attestation"] as? [String: Any]
        return PhoneEnrollment(deviceID: id, attestationStatus: summary?["status"] as? String ?? "unknown", recovered: false)
    }

    private func enrolled() async throws -> StoredDevice {
        guard let device = try vault.load(), device.deviceID != nil else { throw RooiamPhoneError.enrollmentMismatch }
        guard device.origin == origin.absoluteString, device.userID == (try await userID()) else {
            throw RooiamPhoneError.enrollmentMismatch
        }
        return device
    }

    public func previewLogin(qr: String) async throws -> LoginReview {
        let id = try RooiamPhoneProtocol.requestID(from: qr, kind: .login, enrolledOrigin: origin,
                                                    allowLocalPreview: allowLocalPreview)
        let device = try await enrolled()
        let response = try await api.object("/v1/identity/device-login/intents/\(id.uuidString.lowercased())")
        guard (response["protocol_version"] as? Int) == 1,
              (response["public_id"] as? String)?.lowercased() == id.uuidString.lowercased(),
              (response["status"] as? String) == "pending",
              let number = response["match_number"] as? Int, (0...99).contains(number) else {
            throw RooiamPhoneError.invalidResponse
        }
        let expiry = try date(response)
        guard expiry > Date() else { throw RooiamPhoneError.expired }
        return LoginReview(id: id, server: origin, displayCode: try required(response, "display_code"),
                           matchNumber: number, workspaceID: response["workspace_id"] as? String,
                           applicationID: response["application_id"] as? String,
                           redirectURI: response["redirect_uri"] as? String, deviceID: device.deviceID!,
                           payload: try required(response, "approval_payload"), expiresAt: expiry,
                           owner: clientID, nonce: UUID())
    }

    public func previewAction(qr: String) async throws -> ActionReview {
        let id = try RooiamPhoneProtocol.requestID(from: qr, kind: .actionApproval, enrolledOrigin: origin,
                                                    allowLocalPreview: allowLocalPreview)
        let device = try await enrolled()
        let response = try await api.object("/v1/identity/action-approvals/\(id.uuidString.lowercased())")
        guard (response["protocol_version"] as? Int) == 1,
              (response["id"] as? String)?.lowercased() == id.uuidString.lowercased(),
              (response["action"] as? String) == "workspace.api_key.create",
              (response["status"] as? String) == "pending",
              try RooiamPhoneProtocol.origin(required(response, "server_origin"),
                                             allowLocalPreview: allowLocalPreview) == origin else {
            throw RooiamPhoneError.invalidResponse
        }
        let expiry = try date(response)
        guard expiry > Date() else { throw RooiamPhoneError.expired }
        return ActionReview(id: id, server: origin, workspaceName: try required(response, "workspace_name"),
                            label: try required(response, "label"), permissionPreset: try required(response, "permission_preset"),
                            allowedPermissions: response["allowed_permissions"] as? [String] ?? [],
                            keyExpiresAt: response["key_expires_at"] as? String,
                            displayCode: try required(response, "display_code"), deviceID: device.deviceID!,
                            payload: try required(response, "approval_payload"), expiresAt: expiry,
                            owner: clientID, nonce: UUID())
    }

    private func beginDecision(owner: UUID, nonce: UUID, expiry: Date, deviceID: String) async throws -> StoredDevice {
        guard owner == clientID, !usedReviews.contains(nonce) else { throw RooiamPhoneError.reviewUsed }
        guard expiry > Date() else { throw RooiamPhoneError.expired }
        let device = try await enrolled()
        guard device.deviceID == deviceID else { throw RooiamPhoneError.enrollmentMismatch }
        usedReviews.insert(nonce) // An ambiguous network result must be reviewed afresh.
        return device
    }

    public func approveLogin(_ review: LoginReview, selectedNumber: Int) async throws {
        guard selectedNumber == review.matchNumber else { throw RooiamPhoneError.confirmationMismatch }
        let device = try await beginDecision(owner: review.owner, nonce: review.nonce,
                                             expiry: review.expiresAt, deviceID: review.deviceID)
        _ = try await api.object("/v1/identity/device-login/approve", method: "POST", body: [
            "public_id": review.id.uuidString.lowercased(), "device_token": device.deviceToken,
            "selected_number": selectedNumber, "approval_signature": try device.sign(review.payload)
        ])
    }

    public func denyLogin(_ review: LoginReview) async throws {
        let device = try await beginDecision(owner: review.owner, nonce: review.nonce,
                                             expiry: review.expiresAt, deviceID: review.deviceID)
        _ = try await api.object("/v1/identity/device-login/reject", method: "POST", body: [
            "public_id": review.id.uuidString.lowercased(), "device_token": device.deviceToken
        ])
    }

    public func approveAction(_ review: ActionReview, displayedCode: String) async throws {
        guard displayedCode == review.displayCode else { throw RooiamPhoneError.confirmationMismatch }
        let device = try await beginDecision(owner: review.owner, nonce: review.nonce,
                                             expiry: review.expiresAt, deviceID: review.deviceID)
        _ = try await api.object("/v1/identity/action-approvals/approve", method: "POST", body: [
            "id": review.id.uuidString.lowercased(), "device_token": device.deviceToken,
            "display_code": displayedCode, "approval_signature": try device.sign(review.payload)
        ])
    }

    public func denyAction(_ review: ActionReview) async throws {
        let device = try await beginDecision(owner: review.owner, nonce: review.nonce,
                                             expiry: review.expiresAt, deviceID: review.deviceID)
        _ = try await api.object("/v1/identity/action-approvals/deny", method: "POST", body: [
            "id": review.id.uuidString.lowercased(), "device_token": device.deviceToken
        ])
    }

    public func revoke() async throws {
        let device = try await enrolled()
        _ = try await api.object("/v1/identity/me/devices/\(device.deviceID!)", method: "DELETE")
        try vault.clear()
    }
}
