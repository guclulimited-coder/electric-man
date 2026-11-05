import SwiftUI
import WebKit
import AuthenticationServices
import CryptoKit
import Security

/// Session token for the game API, kept in the Keychain (this device only). The pending sign-in (PKCE verifier + state)
/// is kept there too under its own account, so a sign-in survives the app being closed by the system meanwhile.
enum SessionVault {
    static func q(_ account: String) -> [String: Any] { [kSecClass as String: kSecClassGenericPassword,
                                       kSecAttrService as String: "com.tusneldax.electricman.session",
                                       kSecAttrAccount as String: account] }
    static var query: [String: Any] { q("player") }
    static func read() -> String? { read(query) }
    @discardableResult static func write(_ value: String?) -> Bool { write(value, query) }
    static func readPending() -> String? { read(q("pending-login")) }
    @discardableResult static func writePending(_ value: String?) -> Bool { write(value, q("pending-login")) }
    static func read(_ query: [String: Any]) -> String? {
        var q = query; q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data else { return nil }
        return String(data: d, encoding: .utf8)
    }
    @discardableResult static func write(_ value: String?, _ query: [String: Any]) -> Bool {
        guard let value = value else { SecItemDelete(query as CFDictionary); return true }
        let data = Data(value.utf8)
        let st = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if st == errSecSuccess { return true }
        guard st == errSecItemNotFound else { return false }
        var q = query; q[kSecValueData as String] = data; q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(q as CFDictionary, nil) == errSecSuccess
    }
}

/// Serves the bundled game (www/) under emapp://game/ so ES modules and fetch() work like on the web.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "emapp"
    let root = Bundle.main.resourceURL!.appendingPathComponent("www", isDirectory: true)
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url, url.host == "game" else { task.didFailWithError(URLError(.badURL)); return }
        var path = url.path; if path.isEmpty || path == "/" { path = "/index.html" }
        let file = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
        guard file.path.hasPrefix(root.standardizedFileURL.path + "/"), let data = try? Data(contentsOf: file) else {
            task.didReceive(HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: [:])!)
            task.didFinish(); return
        }
        let types = ["html": "text/html; charset=utf-8", "js": "text/javascript; charset=utf-8", "json": "application/json; charset=utf-8",
                     "png": "image/png", "css": "text/css; charset=utf-8", "woff2": "font/woff2", "txt": "text/plain; charset=utf-8", "svg": "image/svg+xml"]
        let headers = ["Content-Type": types[file.pathExtension.lowercased()] ?? "application/octet-stream", "Content-Length": String(data.count), "Cache-Control": "no-cache"]
        task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!)
        task.didReceive(data); task.didFinish()
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

struct GameView: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(context.coordinator.files, forURLScheme: BundleSchemeHandler.scheme)
        config.allowsInlineMediaPlayback = true
        config.websiteDataStore = .default()
        config.userContentController.addScriptMessageHandler(context.coordinator, contentWorld: .page, name: "em")
        let saved = UserDefaults.standard.string(forKey: "emStore") ?? "{}"
        let literal = (try? String(data: JSONSerialization.data(withJSONObject: [saved]), encoding: .utf8)) ?? "[\"{}\"]"
        let shim = """
        (()=>{window.EMNative=Object.freeze({platform:'ios',call:o=>window.webkit.messageHandlers.em.postMessage(o)});
        try{window.__EM_RESTORE=JSON.parse(\(literal)[0])}catch(_){}})();
        """
        config.userContentController.addUserScript(WKUserScript(source: shim, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let view = WKWebView(frame: .zero, configuration: config)
        view.isOpaque = false
        view.backgroundColor = UIColor(red: 0.72, green: 0.9, blue: 1, alpha: 1)
        view.scrollView.isScrollEnabled = false
        view.scrollView.bounces = false
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.navigationDelegate = context.coordinator
        view.uiDelegate = context.coordinator
        context.coordinator.view = view
        context.coordinator.watchForeground()
        // store screenshots: `-emShot 1..6 -emShotLang tr` launch arguments open the game's demo scenes
        let shot = UserDefaults.standard.integer(forKey: "emShot")
        let shotLang = UserDefaults.standard.string(forKey: "emShotLang") ?? ""
        let query = shot > 0 ? "?shot=\(shot)&lang=\(shotLang)" : ""
        view.load(URLRequest(url: URL(string: "\(BundleSchemeHandler.scheme)://game/index.html\(query)")!))
        return view
    }
    func updateUIView(_ view: WKWebView, context: Context) {}
    static func dismantleUIView(_ view: WKWebView, coordinator: Coordinator) {
        view.configuration.userContentController.removeScriptMessageHandler(forName: "em", contentWorld: .page)
        coordinator.auth?.cancel()
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandlerWithReply, ASWebAuthenticationPresentationContextProviding, URLSessionTaskDelegate {
        let origin = "https://electricman.tusneldax.com"
        let files = BundleSchemeHandler()
        let ads = AdManager()
        let store = StoreManager()
        weak var view: WKWebView?
        var auth: ASWebAuthenticationSession?
        lazy var network: URLSession = {
            let c = URLSessionConfiguration.ephemeral
            c.httpShouldSetCookies = false; c.httpCookieStorage = nil; c.timeoutIntervalForRequest = 20
            return URLSession(configuration: c, delegate: self, delegateQueue: nil)
        }()
        func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }

        // only the bundled game may navigate the web view; https links open in Safari
        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = action.request.url else { decisionHandler(.cancel); return }
            if url.scheme == BundleSchemeHandler.scheme && url.host == "game" { decisionHandler(.allow); return }
            if url.scheme == "about" { decisionHandler(.allow); return }
            decisionHandler(.cancel)
            if url.scheme == "https" { UIApplication.shared.open(url) }
        }
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = action.request.url, url.scheme == "https" { UIApplication.shared.open(url) }
            return nil
        }
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }
        func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { view?.window ?? ASPresentationAnchor() }

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
            guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.scheme == BundleSchemeHandler.scheme,
                  let body = message.body as? [String: Any], let action = body["action"] as? String else { replyHandler(nil, "INVALID_SOURCE"); return }
            switch action {
            case "persist":
                guard let data = body["data"] as? String, data.utf8.count <= 2_000_000 else { replyHandler(nil, "TOO_LARGE"); return }
                UserDefaults.standard.set(data, forKey: "emStore"); replyHandler(["ok": true], nil)
            case "api": api(body, replyHandler)
            case "login": login(lang: body["lang"] as? String ?? "en", method: body["method"] as? String ?? "", replyHandler)
            case "loginCheck": loginCheck(replyHandler)
            case "ad":
                guard let root = view?.window?.rootViewController else { replyHandler(nil, "SCREEN_UNAVAILABLE"); return }
                ads.show(kind: body["kind"] as? String ?? "", from: root, reply: replyHandler)
            case "products": Task { await store.products(ids: body["ids"] as? [String] ?? [], reply: replyHandler) }
            case "buy": Task { await store.buy(id: body["id"] as? String ?? "", reply: replyHandler) }
            case "finish": Task { await store.finish(txn: body["txn"] as? String ?? "", reply: replyHandler) }
            case "pending": Task { await store.pending(reply: replyHandler) }
            default: replyHandler(nil, "INVALID_ACTION")
            }
        }

        private func api(_ body: [String: Any], _ reply: @escaping (Any?, String?) -> Void) {
            guard let path = body["path"] as? String, path.range(of: "^/[a-z][a-z/-]{0,40}(\\?[A-Za-z0-9=&%._-]{0,200})?$", options: .regularExpression) != nil else { reply(nil, "INVALID_PATH"); return }
            let post = (body["method"] as? String) == "POST"
            Task {
                do {
                    let (status, json) = try await request(path, post ? (body["body"] ?? [String: Any]()) : nil)
                    if status == 200 && (path == "/logout" || path == "/delete-account") { SessionVault.write(nil) }
                    await MainActor.run { reply(["status": status, "body": json], nil) }
                } catch { await MainActor.run { reply(nil, "CONNECTION_FAILED") } }
            }
        }
        private func request(_ path: String, _ body: Any?) async throws -> (Int, Any) {
            guard let url = URL(string: origin + "/api/em" + path) else { throw URLError(.badURL) }
            var r = URLRequest(url: url)
            r.httpMethod = body == nil ? "GET" : "POST"
            r.setValue(origin, forHTTPHeaderField: "Origin")
            r.setValue("application/json", forHTTPHeaderField: "Accept")
            if let token = SessionVault.read() { r.setValue("__Host-em-session=" + token, forHTTPHeaderField: "Cookie") }
            if let body = body {
                r.httpBody = try JSONSerialization.data(withJSONObject: (body is NSNull) ? [String: Any]() : body)
                r.setValue("application/json", forHTTPHeaderField: "Content-Type")
            }
            let (data, response) = try await network.data(for: r)
            guard data.count <= 2_000_000, let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
            let json = (try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])) ?? [String: Any]()
            return (http.statusCode, json)
        }

        private func hex(_ bytes: [UInt8]) -> String { bytes.map { String(format: "%02x", $0) }.joined() }
        private func randomHex(_ n: Int) -> String? {
            var b = [UInt8](repeating: 0, count: n)
            guard SecRandomCopyBytes(kSecRandomDefault, n, &b) == errSecSuccess else { return nil }
            return hex(b)
        }
        /// Sign-in runs on electricman.tusneldax.com in the system browser sheet; the page hands back a one-time
        /// ticket bound to our PKCE challenge, which we exchange for this app's own session. 31 Oct 2026: the page also
        /// mints that ticket right after sign-in, and we claim it with the secret verifier every few seconds (and when the
        /// app comes back to the foreground), so sign-in completes even if the jump back to the app is blocked.
        static let loginTTL: TimeInterval = 15 * 60
        var pending: (verifier: String, state: String, started: Date)?
        var pollTimer: Timer?
        var loginReply: ((Any?, String?) -> Void)?
        var claiming = false
        var observer: NSObjectProtocol?

        deinit { if let o = observer { NotificationCenter.default.removeObserver(o) } }
        func watchForeground() {
            guard observer == nil else { return }
            observer = NotificationCenter.default.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) { [weak self] _ in
                guard let self = self, self.auth == nil else { return }
                self.claimNow { ok in if ok { self.view?.evaluateJavaScript("window.__emLoginDone&&window.__emLoginDone()", completionHandler: nil) } }
            }
        }
        private func savePending() {
            guard let p = pending, let d = try? JSONSerialization.data(withJSONObject: ["v": p.verifier, "s": p.state, "t": p.started.timeIntervalSince1970]),
                  let text = String(data: d, encoding: .utf8) else { return }
            SessionVault.writePending(text)
        }
        private func restorePending() {
            guard pending == nil else { return }
            guard let text = SessionVault.readPending(), let o = (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [String: Any],
                  let v = o["v"] as? String, let st = o["s"] as? String, let t = o["t"] as? Double,
                  v.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil, Date().timeIntervalSince1970 - t < Coordinator.loginTTL else { SessionVault.writePending(nil); return }
            pending = (v, st, Date(timeIntervalSince1970: t))
        }
        private func clearPending() { pending = nil; SessionVault.writePending(nil); pollTimer?.invalidate(); pollTimer = nil }

        /// One claim attempt on the main queue; completion(true) once the app session is stored.
        private func claimNow(_ done: @escaping (Bool) -> Void) {
            restorePending()
            guard let p = pending, !claiming else { done(false); return }
            if Date().timeIntervalSince(p.started) > Coordinator.loginTTL { clearPending(); done(false); return }
            claiming = true
            Task {
                var token: String?
                if let r = try? await self.request("/native/claim", ["verifier": p.verifier]),
                   r.0 == 200, let t = (r.1 as? [String: Any])?["token"] as? String, t.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil { token = t }
                await MainActor.run {
                    self.claiming = false
                    guard let token = token, self.pending?.verifier == p.verifier, SessionVault.write(token) else { done(false); return }
                    self.clearPending(); done(true)
                }
            }
        }
        private func finish(_ error: String?) {
            pollTimer?.invalidate(); pollTimer = nil
            guard let reply = loginReply else { return }
            loginReply = nil
            if let error = error { reply(nil, error) } else { reply(["ok": true], nil) }
        }
        private func loginCheck(_ reply: @escaping (Any?, String?) -> Void) {
            restorePending()
            guard pending != nil else { reply(["pending": false], nil); return }
            claimNow { ok in reply(ok ? ["ok": true] : ["pending": self.pending != nil], nil) }
        }

        private func login(lang: String, method: String, _ reply: @escaping (Any?, String?) -> Void) {
            guard auth == nil, let verifier = randomHex(32), let state = randomHex(16) else { reply(nil, "LOGIN_BUSY"); return }
            let challenge = hex(Array(SHA256.hash(data: Data(verifier.utf8))))
            pending = (verifier, state, Date()); savePending()
            loginReply = reply
            var c = URLComponents(string: origin + "/app-login")!
            c.queryItems = [URLQueryItem(name: "challenge", value: challenge), URLQueryItem(name: "state", value: state),
                            URLQueryItem(name: "lang", value: lang.range(of: "^[a-z]{2}$", options: .regularExpression) != nil ? lang : "en"),
                            URLQueryItem(name: "platform", value: "ios")]
            if ["google", "apple", "email", "review"].contains(method) { c.queryItems?.append(URLQueryItem(name: "method", value: method)) }
            auth = ASWebAuthenticationSession(url: c.url!, callbackURLScheme: "electricman") { [weak self] callback, error in
              DispatchQueue.main.async {
                guard let self = self else { reply(nil, "LOGIN_CANCELLED"); return }
                self.auth = nil
                self.pollTimer?.invalidate(); self.pollTimer = nil
                guard self.loginReply != nil else { return }   // already finished by a claim
                guard error == nil, let callback = callback, callback.host == "signin",
                      let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems,
                      items.first(where: { $0.name == "state" })?.value == state,
                      let ticket = items.first(where: { $0.name == "ticket" })?.value,
                      ticket.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else {
                    // closed without the jump back: the player may still have signed in, so ask once more
                    self.claimNow { ok in self.finish(ok ? nil : "LOGIN_CANCELLED") }
                    return
                }
                Task {
                    let r = try? await self.request("/native/exchange", ["ticket": ticket, "verifier": verifier])
                    let token = (r?.1 as? [String: Any])?["token"] as? String ?? ""
                    await MainActor.run {
                        if r?.0 == 200, token.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil, SessionVault.write(token) {
                            self.clearPending(); self.finish(nil)
                        } else { self.claimNow { ok in self.finish(ok ? nil : (r == nil ? "CONNECTION_FAILED" : "LOGIN_EXPIRED")) } }
                    }
                }
              }
            }
            auth?.presentationContextProvider = self
            auth?.prefersEphemeralWebBrowserSession = false
            if auth?.start() != true { auth = nil; clearPending(); finish("LOGIN_UNAVAILABLE"); return }
            pollTimer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in
                guard let self = self, self.loginReply != nil else { return }
                self.claimNow { ok in
                    guard ok else { return }
                    self.finish(nil)
                    self.auth?.cancel(); self.auth = nil   // close the sign-in sheet: straight back into the game
                }
            }
        }
    }
}
