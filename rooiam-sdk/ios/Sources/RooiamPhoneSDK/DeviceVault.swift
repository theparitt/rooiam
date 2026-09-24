import CryptoKit
import Foundation
import Security

struct StoredDevice: Codable {
    let origin: String
    let userID: String
    let privateKey: Data
    let deviceToken: String
    let devicePublicKey: String
    var deviceID: String?
    var appAttestKeyID: String?

    static func generate(origin: String, userID: String) throws -> StoredDevice {
        let signingKey = Curve25519.Signing.PrivateKey()
        var token = Data(count: 32)
        let status = token.withUnsafeMutableBytes { bytes in
            SecRandomCopyBytes(kSecRandomDefault, bytes.count, bytes.baseAddress!)
        }
        guard status == errSecSuccess else { throw RooiamPhoneError.keychain(status) }
        return StoredDevice(
            origin: origin, userID: userID,
            privateKey: signingKey.rawRepresentation,
            deviceToken: RooiamPhoneProtocol.base64URL(token),
            devicePublicKey: "ed25519:" + RooiamPhoneProtocol.base64URL(signingKey.publicKey.rawRepresentation)
        )
    }

    func sign(_ payload: String) throws -> String {
        let key = try Curve25519.Signing.PrivateKey(rawRepresentation: privateKey)
        return RooiamPhoneProtocol.base64URL(try key.signature(for: Data(payload.utf8)))
    }
}

/// A device-only Keychain item. CryptoKit Ed25519 keys have no Secure Enclave
/// SecKey representation; App Attest provides the separate hardware proof.
final class DeviceVault {
    private let service = "com.rooiam.phone.device.v1"
    private let account = "default"

    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service, kSecAttrAccount as String: account]
    }

    func load() throws -> StoredDevice? {
        var search = query
        search[kSecReturnData as String] = true
        search[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(search as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else {
            throw RooiamPhoneError.keychain(status)
        }
        return try JSONDecoder().decode(StoredDevice.self, from: data)
    }

    func save(_ device: StoredDevice) throws {
        let data = try JSONEncoder().encode(device)
        var attributes = query
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let status = SecItemAdd(attributes as CFDictionary, nil)
        if status == errSecSuccess { return }
        if status == errSecDuplicateItem {
            let updated = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
            if updated == errSecSuccess { return }
            throw RooiamPhoneError.keychain(updated)
        }
        throw RooiamPhoneError.keychain(status)
    }

    func clear() throws {
        let status = SecItemDelete(query as CFDictionary)
        if status != errSecSuccess && status != errSecItemNotFound {
            throw RooiamPhoneError.keychain(status)
        }
    }
}
