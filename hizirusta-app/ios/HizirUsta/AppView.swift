import SwiftUI
import WebKit
import CoreMotion

/// Uygulama sayfaları (www/) huapp://app/ altında sunulur; ES modülleri internet sürümündeki gibi çalışır.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "huapp"
    let root = Bundle.main.resourceURL!.appendingPathComponent("www", isDirectory: true)
    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url, url.host == "app" else { task.didFailWithError(URLError(.badURL)); return }
        var path = url.path; if path.isEmpty || path == "/" { path = "/index.html" }
        let file = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
        guard file.path.hasPrefix(root.standardizedFileURL.path + "/"), let data = try? Data(contentsOf: file) else {
            task.didReceive(HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: [:])!); task.didFinish(); return
        }
        let types = ["html": "text/html; charset=utf-8", "mjs": "text/javascript; charset=utf-8", "js": "text/javascript; charset=utf-8", "png": "image/png", "svg": "image/svg+xml"]
        let headers = ["Content-Type": types[file.pathExtension.lowercased()] ?? "application/octet-stream", "Content-Length": String(data.count), "Cache-Control": "no-cache"]
        task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!)
        task.didReceive(data); task.didFinish()
    }
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

struct AppView: UIViewRepresentable {
    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(context.coordinator.files, forURLScheme: BundleSchemeHandler.scheme)
        config.websiteDataStore = .default()
        config.userContentController.addScriptMessageHandler(context.coordinator, contentWorld: .page, name: "em")
        let shim = "(()=>{window.EMNative=Object.freeze({platform:'ios',call:o=>window.webkit.messageHandlers.em.postMessage(o)});})();"
        config.userContentController.addUserScript(WKUserScript(source: shim, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let view = WKWebView(frame: .zero, configuration: config)
        view.isOpaque = false
        view.backgroundColor = UIColor(red: 0.96, green: 0.96, blue: 0.97, alpha: 1)
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.navigationDelegate = context.coordinator
        view.uiDelegate = context.coordinator
        context.coordinator.view = view
        view.load(URLRequest(url: URL(string: "\(BundleSchemeHandler.scheme)://app/index.html")!))
        return view
    }
    func updateUIView(_ view: WKWebView, context: Context) {}
    static func dismantleUIView(_ view: WKWebView, coordinator: Coordinator) {
        view.configuration.userContentController.removeScriptMessageHandler(forName: "em", contentWorld: .page)
        coordinator.stopMag()
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandlerWithReply {
        let files = BundleSchemeHandler()
        let ads = AdManager()
        let store = StoreManager()
        let motion = CMMotionManager()
        weak var view: WKWebView?
        private var magBuf: [Double] = []
        private var magTimer: Timer?

        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = action.request.url else { decisionHandler(.cancel); return }
            if url.scheme == BundleSchemeHandler.scheme && url.host == "app" { decisionHandler(.allow); return }
            if url.scheme == "about" || url.scheme == "blob" || url.scheme == "data" { decisionHandler(.allow); return }
            decisionHandler(.cancel)
            if ["https", "tel", "mailto", "whatsapp"].contains(url.scheme ?? "") { UIApplication.shared.open(url) }
        }
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = action.request.url, ["https", "whatsapp"].contains(url.scheme ?? "") { UIApplication.shared.open(url) }
            return nil
        }
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
            guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.scheme == BundleSchemeHandler.scheme,
                  let body = message.body as? [String: Any], let action = body["action"] as? String else { replyHandler(nil, "INVALID_SOURCE"); return }
            let root = view?.window?.rootViewController
            switch action {
            case "ad":
                guard let root = root else { replyHandler(nil, "SCREEN_UNAVAILABLE"); return }
                ads.show(kind: body["kind"] as? String ?? "", from: root, reply: replyHandler)
            case "subscribe": Task { await store.subscribe(id: body["id"] as? String ?? "", reply: replyHandler) }
            case "subStatus": Task { await store.status(id: body["id"] as? String ?? "", reply: replyHandler) }
            case "subPrice": Task { await store.price(id: body["id"] as? String ?? "", reply: replyHandler) }
            case "magStart": let ok = startMag(); replyHandler(ok ? ["ok": true] : nil, ok ? nil : "NO_SENSOR")
            case "magStop": stopMag(); replyHandler(["ok": true], nil)
            case "shareFile": shareFile(body, root, replyHandler)
            case "print": printPage(body["name"] as? String ?? "HizirUsta", replyHandler)
            default: replyHandler(nil, "INVALID_ACTION")
            }
        }

        // PDF paylaşma: sayfa base64 gönderir, geçici dosya paylaş menüsüyle açılır
        private func shareFile(_ body: [String: Any], _ root: UIViewController?, _ reply: @escaping (Any?, String?) -> Void) {
            guard let root = root, let b64 = body["base64"] as? String, let data = Data(base64Encoded: b64), data.count < 60_000_000 else { reply(nil, "INVALID_FILE"); return }
            let raw = (body["name"] as? String ?? "belge.pdf").components(separatedBy: CharacterSet(charactersIn: "/\\:")).joined(separator: "-")
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(raw.isEmpty ? "belge.pdf" : raw)
            do { try data.write(to: url, options: .atomic) } catch { reply(nil, "SHARE_FAILED"); return }
            let vc = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            vc.popoverPresentationController?.sourceView = root.view
            root.present(vc, animated: true); reply(["ok": true], nil)
        }

        // Belge / PDF: iOS yazdırma ekranı (iki parmakla büyütünce PDF olarak paylaşılabilir)
        private func printPage(_ name: String, _ reply: @escaping (Any?, String?) -> Void) {
            guard let v = view else { reply(nil, "PRINT_FAILED"); return }
            let info = UIPrintInfo(dictionary: nil); info.jobName = name; info.outputType = .general
            let pc = UIPrintInteractionController.shared
            pc.printInfo = info; pc.printFormatter = v.viewPrintFormatter()
            pc.present(animated: true) { _, _, _ in }
            reply(["ok": true], nil)
        }

        // pusula algılayıcısı (metal ve akım bulucu): ham manyetometre, 60 ms'de bir toplu gönderim
        func startMag() -> Bool {
            if motion.isMagnetometerActive { return true }
            guard motion.isMagnetometerAvailable else { return false }
            motion.magnetometerUpdateInterval = 1.0 / 100.0
            motion.startMagnetometerUpdates(to: .main) { [weak self] d, _ in
                guard let f = d?.magneticField, let self = self, self.magBuf.count < 1200 else { return }
                self.magBuf += [f.x, f.y, f.z]
            }
            magTimer = Timer.scheduledTimer(withTimeInterval: 0.06, repeats: true) { [weak self] _ in
                guard let self = self, !self.magBuf.isEmpty else { return }
                let s = self.magBuf.map { String(format: "%.2f", $0) }.joined(separator: ","); self.magBuf.removeAll()
                self.view?.evaluateJavaScript("window.__magOrnek&&window.__magOrnek([\(s)])", completionHandler: nil)
            }
            return true
        }
        func stopMag() { motion.stopMagnetometerUpdates(); magTimer?.invalidate(); magTimer = nil; magBuf.removeAll() }
    }
}
