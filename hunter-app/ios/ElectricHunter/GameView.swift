import SwiftUI
import WebKit
import AuthenticationServices
import CryptoKit
import Security

/// Session token for the game API, kept in the Keychain (this device only).
enum SessionVault {
    static let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                       kSecAttrService as String: "com.tusneldax.electrichunter.session",
                                       kSecAttrAccount as String: "player"]
    static func read() -> String? {
        var q = query; q[kSecReturnData as String] = true; q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data else { return nil }
        return String(data: d, encoding: .utf8)
    }
    @discardableResult static func write(_ value: String?) -> Bool {
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
        view.backgroundColor = UIColor(red: 0.07, green: 0.04, blue: 0.12, alpha: 1)
        view.scrollView.isScrollEnabled = false
        view.scrollView.bounces = false
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.navigationDelegate = context.coordinator
        view.uiDelegate = context.coordinator
        context.coordinator.view = view
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
            case "login": login(lang: body["lang"] as? String ?? "tr", replyHandler)
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
        /// ticket bound to our PKCE challenge, which we exchange for this app's own session.
        private func login(lang: String, _ reply: @escaping (Any?, String?) -> Void) {
            guard auth == nil, let verifier = randomHex(32), let state = randomHex(16) else { reply(nil, "LOGIN_BUSY"); return }
            let challenge = hex(Array(SHA256.hash(data: Data(verifier.utf8))))
            var c = URLComponents(string: origin + "/app-login")!
            c.queryItems = [URLQueryItem(name: "challenge", value: challenge), URLQueryItem(name: "state", value: state),
                            URLQueryItem(name: "lang", value: lang.range(of: "^[a-z]{2}$", options: .regularExpression) != nil ? lang : "tr"),
                            URLQueryItem(name: "platform", value: "ios"), URLQueryItem(name: "app", value: "hunter")]
            auth = ASWebAuthenticationSession(url: c.url!, callbackURLScheme: "electrichunter") { [weak self] callback, error in
                guard let self = self else { reply(nil, "LOGIN_CANCELLED"); return }
                self.auth = nil
                guard error == nil, let callback = callback, callback.host == "signin",
                      let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems,
                      items.first(where: { $0.name == "state" })?.value == state,
                      let ticket = items.first(where: { $0.name == "ticket" })?.value,
                      ticket.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { reply(nil, "LOGIN_CANCELLED"); return }
                Task {
                    do {
                        let (status, json) = try await self.request("/native/exchange", ["ticket": ticket, "verifier": verifier])
                        let token = (json as? [String: Any])?["token"] as? String ?? ""
                        if status == 200, token.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil, SessionVault.write(token) {
                            await MainActor.run { reply(["ok": true], nil) }
                        } else { await MainActor.run { reply(nil, "LOGIN_EXPIRED") } }
                    } catch { await MainActor.run { reply(nil, "CONNECTION_FAILED") } }
                }
            }
            auth?.presentationContextProvider = self
            auth?.prefersEphemeralWebBrowserSession = false
            if auth?.start() != true { auth = nil; reply(nil, "LOGIN_UNAVAILABLE") }
        }
    }
}
