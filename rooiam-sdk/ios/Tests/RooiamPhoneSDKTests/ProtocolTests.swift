import XCTest
@testable import RooiamPhoneSDK

final class ProtocolTests: XCTestCase {
    func testAppAttestHashMatchesServerVector() {
        let bytes = RooiamPhoneProtocol.appAttestClientDataHash(
            challenge: "challenge-vector", devicePublicKey: "ed25519:abc",
            appID: "com.example.rooiam", keyID: "key-vector", environment: "production")
        XCTAssertEqual(bytes.map { String(format: "%02x", $0) }.joined(),
                       "4873153d03043d4591ba48f2e07f2cf75276508566c46fd25d20fac4f00fda46")
    }

    func testQRPurposeAndOriginAreBoundBeforeSessionAccess() throws {
        let origin = try RooiamPhoneProtocol.origin("https://app.rooiam.com")
        let id = "123e4567-e89b-12d3-a456-426614174000"
        XCTAssertEqual(try RooiamPhoneProtocol.requestID(
            from: "rooiam://device-login?server=https%3A%2F%2Fapp.rooiam.com&public_id=\(id)",
            kind: .login, enrolledOrigin: origin).uuidString.lowercased(), id)
        XCTAssertThrowsError(try RooiamPhoneProtocol.requestID(
            from: "rooiam://action-approval?server=https%3A%2F%2Fapp.rooiam.com&id=\(id)&v=1",
            kind: .login, enrolledOrigin: origin))
        XCTAssertThrowsError(try RooiamPhoneProtocol.requestID(
            from: "rooiam://device-login?server=https%3A%2F%2Fevil.example&public_id=\(id)",
            kind: .login, enrolledOrigin: origin))
    }

    func testOriginRejectsCredentialsAndPlainHTTP() {
        XCTAssertThrowsError(try RooiamPhoneProtocol.origin("https://user:pass@app.rooiam.com"))
        XCTAssertThrowsError(try RooiamPhoneProtocol.origin("http://app.rooiam.com"))
        XCTAssertNoThrow(try RooiamPhoneProtocol.origin("http://127.0.0.1:15470", allowLocalPreview: true))
    }

    func testMagicLinkPasteAcceptsOnlyTrustedVerificationPaths() throws {
        let frontend = try RooiamPhoneProtocol.origin("https://app.rooiam.com")
        let api = try RooiamPhoneProtocol.origin("https://api.rooiam.com")
        XCTAssertNoThrow(try RooiamPhoneProtocol.emailLink(
            "https://app.rooiam.com/verify?token=example", frontend: frontend, api: api))
        XCTAssertThrowsError(try RooiamPhoneProtocol.emailLink(
            "https://evil.example/verify?token=example", frontend: frontend, api: api))
        XCTAssertThrowsError(try RooiamPhoneProtocol.emailLink(
            "https://api.rooiam.com/v1/auth/magic-link/verify?token=example#fragment",
            frontend: frontend, api: api))
    }
}
