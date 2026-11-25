import StoreKit

/// StoreKit 2 aboneliği: Usta Paketi (usta_paketi_aylik). Durum her açılışta mağazadan okunur.
@MainActor final class StoreManager {
    private var updates: Task<Void, Never>?
    init() {
        updates = Task {
            for await result in Transaction.updates { if case .verified(let t) = result { await t.finish() } }
        }
    }
    func price(id: String, reply: @escaping (Any?, String?) -> Void) async {
        guard let p = try? await Product.products(for: [id]).first else { reply(nil, "PRODUCT_UNAVAILABLE"); return }
        reply(["price": p.displayPrice], nil)
    }
    func subscribe(id: String, reply: @escaping (Any?, String?) -> Void) async {
        do {
            guard let p = try await Product.products(for: [id]).first else { reply(nil, "PRODUCT_UNAVAILABLE"); return }
            switch try await p.purchase() {
            case .success(let v):
                guard case .verified(let t) = v else { reply(nil, "BUY_FAILED"); return }
                await t.finish(); reply(["ok": true, "active": true], nil)
            case .userCancelled: reply(nil, "CANCELLED")
            case .pending: reply(nil, "PENDING")
            @unknown default: reply(nil, "BUY_FAILED")
            }
        } catch { reply(nil, "BUY_FAILED") }
    }
    func status(id: String, reply: @escaping (Any?, String?) -> Void) async {
        var active = false
        for await r in Transaction.currentEntitlements {
            if case .verified(let t) = r, t.productID == id, t.revocationDate == nil, (t.expirationDate ?? .distantFuture) > Date() { active = true }
        }
        reply(["ok": active, "active": active], nil)
    }
}
