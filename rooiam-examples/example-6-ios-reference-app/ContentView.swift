import AVFoundation
import RooiamPhoneSDK
import SwiftUI
import WebKit

/// The host app owns login, its WebKit cookies and every confirmation screen.
@MainActor final class PhoneModel: ObservableObject {
    @Published var status = "Sign in to your Rooiam server, then enroll this iPhone."
    @Published var loginURL: URL?
    @Published var scanning = false
    @Published var loginReview: LoginReview?
    @Published var actionReview: ActionReview?
    @Published var busy = false
    @Published var apiOrigin = UserDefaults.standard.string(forKey: "rooiam.example.apiOrigin") ?? "" {
        didSet { UserDefaults.standard.set(apiOrigin, forKey: "rooiam.example.apiOrigin") }
    }
    @Published var pendingQR = UserDefaults.standard.string(forKey: "rooiam.example.pendingQR") ?? "" {
        didSet { UserDefaults.standard.set(pendingQR, forKey: "rooiam.example.pendingQR") }
    }
    private var client: RooiamPhoneClient?

    private func phone() throws -> RooiamPhoneClient {
        let trustedOrigin = try RooiamPhoneProtocol.origin(apiOrigin)
        if let client, client.origin == trustedOrigin {
            return client
        }
        #if DEBUG
        let environment: AppAttestEnvironment = .development
        #else
        let environment: AppAttestEnvironment = .production
        #endif
        let new = try RooiamPhoneClient(origin: apiOrigin, attestationEnvironment: environment) { origin in
            let cookies: [HTTPCookie] = await withCheckedContinuation { continuation in
                WKWebsiteDataStore.default().httpCookieStore.getAllCookies { continuation.resume(returning: $0) }
            }
            let usable = cookies.filter { cookie in
                let host = origin.host ?? ""
                let domain = cookie.domain.hasPrefix(".") ? String(cookie.domain.dropFirst()) : cookie.domain
                return (host == domain || host.hasSuffix("." + domain)) &&
                    cookie.path == "/" && (!cookie.isSecure || origin.scheme == "https") &&
                    cookie.expiresDate.map { $0 > Date() } != false
            }
            return usable.map { "\($0.name)=\($0.value)" }.joined(separator: "; ")
        }
        client = new
        return new
    }

    func signIn() {
        run { self.loginURL = try await self.phone().hostedLoginOrigin() }
    }

    func enroll() {
        run {
            let result = try await self.phone().enroll(label: UIDevice.current.name)
            self.status = result.recovered ? "Recovered existing phone enrollment." :
                "Phone enrolled. Attestation: \(result.attestationStatus)"
        }
    }

    func startScan() {
        AVCaptureDevice.requestAccess(for: .video) { granted in
            Task { @MainActor in
                if granted { self.scanning = true }
                else { self.status = "Allow Camera in iOS Settings to scan a QR code." }
            }
        }
    }

    func scan(_ qr: String) {
        scanning = false
        pendingQR = qr // A short-lived request ID; fetch current server state after relaunch.
        run {
            let phone = try self.phone()
            if qr.hasPrefix("rooiam://device-login?") {
                self.loginReview = try await phone.previewLogin(qr: qr)
            } else if qr.hasPrefix("rooiam://action-approval?") {
                self.actionReview = try await phone.previewAction(qr: qr)
            } else {
                throw RooiamPhoneError.invalidQR
            }
        }
    }

    func restoreReview() {
        if !pendingQR.isEmpty { scan(pendingQR) }
    }

    func decideLogin(_ review: LoginReview, approve: Bool) {
        run {
            if approve { try await self.phone().approveLogin(review, selectedNumber: review.matchNumber) }
            else { try await self.phone().denyLogin(review) }
            self.loginReview = nil
            self.pendingQR = ""
            self.status = approve ? "Approved. Return to the browser." : "Request denied."
        }
    }

    func decideAction(_ review: ActionReview, approve: Bool) {
        run {
            if approve { try await self.phone().approveAction(review, displayedCode: review.displayCode) }
            else { try await self.phone().denyAction(review) }
            self.actionReview = nil
            self.pendingQR = ""
            self.status = approve ? "Approved. Return to the browser." : "Request denied."
        }
    }

    func revoke() {
        run {
            try await self.phone().revoke()
            self.pendingQR = ""
            self.status = "Phone revoked. Sign in and enroll again to approve requests."
        }
    }

    private func run(_ operation: @escaping @MainActor () async throws -> Void) {
        guard !busy else { return }
        busy = true
        Task {
            defer { busy = false }
            do { try await operation() }
            catch {
                status = "\(error.localizedDescription) Check the browser before trying another approval."
            }
        }
    }
}

struct ContentView: View {
    @StateObject private var model = PhoneModel()
    @State private var showRevoke = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("Scan. Match. Approve.").font(.largeTitle.bold())
                    Text("iOS reference source · experimental").foregroundStyle(.secondary)
                    TextField("https://your-rooiam-api.example", text: $model.apiOrigin)
                        .textInputAutocapitalization(.never).keyboardType(.URL).autocorrectionDisabled()
                        .textFieldStyle(.roundedBorder)
                    Button("1. Sign in to Rooiam") { model.signIn() }
                    Button("2. Enroll this iPhone") { model.enroll() }
                    Button("3. Scan a sign-in or approval QR") { model.startScan() }
                    if !model.pendingQR.isEmpty {
                        Button("Review last scanned request again") { model.restoreReview() }
                    }
                    Button("Revoke this iPhone", role: .destructive) { showRevoke = true }
                    Text(model.status).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(24)
                .buttonStyle(.borderedProminent)
                .disabled(model.busy)
            }
            .navigationTitle("Rooiam Reference")
            .sheet(isPresented: Binding(get: { model.loginURL != nil },
                                        set: { if !$0 { model.loginURL = nil } })) {
                if let url = model.loginURL {
                    NavigationStack {
                        LoginPanel(frontend: url, apiOrigin: model.apiOrigin)
                            .navigationTitle("Rooiam sign-in")
                            .toolbar { Button("Done") { model.loginURL = nil } }
                    }
                }
            }
            .sheet(isPresented: $model.scanning) {
                NavigationStack {
                    QRScanner { model.scan($0) }
                        .navigationTitle("Scan browser QR")
                        .toolbar { Button("Cancel") { model.scanning = false } }
                }
            }
            .sheet(item: $model.loginReview) { review in
                NavigationStack {
                    VStack(alignment: .leading, spacing: 18) {
                        Text("Approve this browser?").font(.title.bold())
                        Text("Server: \(review.server.absoluteString)")
                        Text("Application: \(review.redirectURI ?? "Rooiam")")
                        Text("Code: \(review.displayCode)").font(.title2.bold())
                        Text("Match number: \(review.matchNumber)").font(.title2.bold())
                        Text("Compare both values with the browser before approving.")
                        Button("Approve matching number") { model.decideLogin(review, approve: true) }
                        Button("Deny", role: .destructive) { model.decideLogin(review, approve: false) }
                    }.padding().navigationTitle("Sign-in review")
                }
            }
            .sheet(item: $model.actionReview) { review in
                NavigationStack {
                    VStack(alignment: .leading, spacing: 18) {
                        Text("Create workspace API key?").font(.title.bold())
                        Text("Workspace: \(review.workspaceName)")
                        Text("Label: \(review.label)")
                        Text("Preset: \(review.permissionPreset)")
                        Text("Permissions: \(review.allowedPermissions.joined(separator: ", "))")
                        Text("Expires: \(review.keyExpiresAt ?? "Never")")
                        Text("Code: \(review.displayCode)").font(.title2.bold())
                        Text("Compare every detail with the browser before approving.")
                        Button("Approve this key") { model.decideAction(review, approve: true) }
                        Button("Deny", role: .destructive) { model.decideAction(review, approve: false) }
                    }.padding().navigationTitle("Key review")
                }
            }
            .confirmationDialog("Revoke this iPhone?", isPresented: $showRevoke) {
                Button("Revoke phone", role: .destructive) { model.revoke() }
            } message: { Text("Phone sign-in will stop until you enroll again.") }
        }
    }
}

private struct LoginPanel: View {
    let frontend: URL
    let apiOrigin: String
    @State private var pastedLink = ""
    @State private var webURL: URL
    @State private var linkError = ""

    init(frontend: URL, apiOrigin: String) {
        self.frontend = frontend
        self.apiOrigin = apiOrigin
        _webURL = State(initialValue: frontend)
    }

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                TextField("Paste your email sign-in link", text: $pastedLink)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                Button("Open") {
                    do {
                        let api = try RooiamPhoneProtocol.origin(apiOrigin)
                        webURL = try RooiamPhoneProtocol.emailLink(pastedLink, frontend: frontend, api: api)
                        linkError = ""
                    } catch { linkError = "Use a sign-in link from this Rooiam server." }
                }
            }.padding(.horizontal)
            if !linkError.isEmpty { Text(linkError).foregroundStyle(.red) }
            LoginWebView(url: webURL)
        }
    }
}

private struct LoginWebView: UIViewRepresentable {
    let url: URL
    final class Coordinator { var requestedURL: URL? }
    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeUIView(context: Context) -> WKWebView {
        let web = WKWebView()
        web.load(URLRequest(url: url))
        context.coordinator.requestedURL = url
        return web
    }
    func updateUIView(_ web: WKWebView, context: Context) {
        if context.coordinator.requestedURL != url {
            context.coordinator.requestedURL = url
            web.load(URLRequest(url: url))
        }
    }
}

extension LoginReview: Identifiable {}
extension ActionReview: Identifiable {}
