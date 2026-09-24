import DeviceCheck
import Foundation

enum AppAttest {
    static func generateKey() async throws -> String {
        let service = DCAppAttestService.shared
        guard service.isSupported else { throw RooiamPhoneError.attestationUnavailable }
        return try await withCheckedThrowingContinuation { continuation in
            service.generateKey { keyID, error in
                if let error { continuation.resume(throwing: error) }
                else if let keyID { continuation.resume(returning: keyID) }
                else { continuation.resume(throwing: RooiamPhoneError.attestationUnavailable) }
            }
        }
    }

    static func attest(keyID: String, clientDataHash: Data) async throws -> Data {
        guard DCAppAttestService.shared.isSupported else { throw RooiamPhoneError.attestationUnavailable }
        return try await withCheckedThrowingContinuation { continuation in
            DCAppAttestService.shared.attestKey(keyID, clientDataHash: clientDataHash) { object, error in
                if let error { continuation.resume(throwing: error) }
                else if let object { continuation.resume(returning: object) }
                else { continuation.resume(throwing: RooiamPhoneError.attestationUnavailable) }
            }
        }
    }
}
