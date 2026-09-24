import Foundation

public typealias RooiamSessionCookieProvider = @MainActor @Sendable (URL) async throws -> String?

private final class NoRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

final class PhoneAPI {
    let origin: URL
    private let cookieProvider: RooiamSessionCookieProvider
    private let session: URLSession
    private let redirectDelegate: NoRedirects

    init(origin: URL, cookieProvider: @escaping RooiamSessionCookieProvider) {
        self.origin = origin
        self.cookieProvider = cookieProvider
        let config = URLSessionConfiguration.ephemeral
        config.httpShouldSetCookies = false
        config.httpCookieAcceptPolicy = .never
        config.urlCache = nil
        config.timeoutIntervalForRequest = 20
        let delegate = NoRedirects()
        self.redirectDelegate = delegate
        self.session = URLSession(configuration: config, delegate: delegate, delegateQueue: nil)
    }

    func request(_ path: String, method: String = "GET", body: [String: Any]? = nil) async throws -> Any {
        guard path.hasPrefix("/v1/"), !path.contains(".."), !path.contains("\\"),
              ["GET", "POST", "DELETE"].contains(method),
              let url = URL(string: origin.absoluteString + path) else {
            throw RooiamPhoneError.invalidResponse
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let cookie = try await cookieProvider(origin), !cookie.isEmpty {
            guard !cookie.contains("\r"), !cookie.contains("\n") else { throw RooiamPhoneError.invalidResponse }
            request.setValue(cookie, forHTTPHeaderField: "Cookie")
        }
        if let body {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw RooiamPhoneError.invalidResponse }
        if (300..<400).contains(http.statusCode) { throw RooiamPhoneError.redirectRefused }
        if http.statusCode == 401 { throw RooiamPhoneError.signInRequired }
        guard (200..<300).contains(http.statusCode) else { throw RooiamPhoneError.httpStatus(http.statusCode) }
        guard data.count <= 1_048_576 else {
            throw RooiamPhoneError.invalidResponse
        }
        return try JSONSerialization.jsonObject(with: data)
    }

    func object(_ path: String, method: String = "GET", body: [String: Any]? = nil) async throws -> [String: Any] {
        guard let value = try await request(path, method: method, body: body) as? [String: Any] else {
            throw RooiamPhoneError.invalidResponse
        }
        return value
    }

    func array(_ path: String) async throws -> [[String: Any]] {
        guard let value = try await request(path) as? [[String: Any]] else {
            throw RooiamPhoneError.invalidResponse
        }
        return value
    }
}
