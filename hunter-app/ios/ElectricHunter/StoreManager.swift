import StoreKit

/// StoreKit 2 for consumable coin packs (em_coins_500). The game grants coins, then asks us to finish the transaction.
@MainActor final class StoreManager {
    private var cache: [String: Product] = [:]
    private var unfinished: [String: Transaction] = [:]
    private var updates: Task<Void, Never>?

    init() {
        updates = Task { [weak self] in
            for await result in Transaction.updates {
                if case .verified(let t) = result { await MainActor.run { self?.unfinished[String(t.id)] = t } }
            }
        }
    }

    func products(ids: [String], reply: @escaping (Any?, String?) -> Void) async {
        do {
            let list = try await Product.products(for: ids)
            for p in list { cache[p.id] = p }
            reply(list.map { ["id": $0.id, "price": $0.displayPrice] }, nil)
        } catch { reply(nil, "PRODUCTS_UNAVAILABLE") }
    }

    func buy(id: String, reply: @escaping (Any?, String?) -> Void) async {
        do {
            var product = cache[id]
            if product == nil { product = try await Product.products(for: [id]).first }
            guard let p = product else { reply(nil, "PRODUCT_UNAVAILABLE"); return }
            switch try await p.purchase() {
            case .success(let verification):
                guard case .verified(let t) = verification else { reply(nil, "BUY_FAILED"); return }
                unfinished[String(t.id)] = t
                reply(["ok": true, "id": t.productID, "txn": String(t.id)], nil)
            case .userCancelled: reply(nil, "CANCELLED")
            case .pending: reply(nil, "PENDING")
            @unknown default: reply(nil, "BUY_FAILED")
            }
        } catch { reply(nil, "BUY_FAILED") }
    }

    func finish(txn: String, reply: @escaping (Any?, String?) -> Void) async {
        if let t = unfinished.removeValue(forKey: txn) { await t.finish(); reply(["ok": true], nil); return }
        for await result in Transaction.unfinished {
            if case .verified(let t) = result, String(t.id) == txn { await t.finish(); reply(["ok": true], nil); return }
        }
        reply(["ok": false], nil)
    }

    func pending(reply: @escaping (Any?, String?) -> Void) async {
        var out: [[String: Any]] = []
        for await result in Transaction.unfinished {
            if case .verified(let t) = result, t.productType == .consumable, t.revocationDate == nil {
                unfinished[String(t.id)] = t
                out.append(["id": t.productID, "txn": String(t.id)])
            }
        }
        reply(out, nil)
    }
}
