import UIKit
import GoogleMobileAds
import UserMessagingPlatform
import AppTrackingTransparency

/// AdMob: app-open ad at launch, interstitial every 5 cleared levels, rewarded ads for coins.
/// Consent (UMP) and the App Tracking Transparency prompt come first. Debug/TestFlight builds use Google's test units.
@MainActor final class AdManager: NSObject, FullScreenContentDelegate {
    static var test: Bool {
        #if DEBUG || targetEnvironment(simulator)
        return true
        #else
        return Bundle.main.appStoreReceiptURL?.lastPathComponent == "sandboxReceipt"
        #endif
    }
    private func unit(_ key: String, test id: String) -> String {
        if Self.test { return id }
        return (Bundle.main.object(forInfoDictionaryKey: key) as? String) ?? ""
    }
    private var appOpenUnit: String { unit("EMAdAppOpen", test: "ca-app-pub-3940256099942544/5575463023") }
    private var interstitialUnit: String { unit("EMAdInterstitial", test: "ca-app-pub-3940256099942544/4411468910") }
    private var rewardedUnit: String { unit("EMAdRewarded", test: "ca-app-pub-3940256099942544/1712485313") }

    private var started = false
    private var reply: ((Any?, String?) -> Void)?
    private var earned = false
    private var current: FullScreenPresentingAd?
    private var interstitial: InterstitialAd?
    private var rewarded: RewardedAd?

    private func prepare(from root: UIViewController) async -> Bool {
        if started { return ConsentInformation.shared.canRequestAds }
        do {
            try await ConsentInformation.shared.requestConsentInfoUpdate(with: RequestParameters())
            try await ConsentForm.loadAndPresentIfRequired(from: root)
        } catch { }
        if ATTrackingManager.trackingAuthorizationStatus == .notDetermined {
            _ = await ATTrackingManager.requestTrackingAuthorization()
        }
        guard ConsentInformation.shared.canRequestAds else { return false }
        await MobileAds.shared.start()
        started = true
        preload()
        return true
    }
    private func preload() {
        if interstitial == nil, !interstitialUnit.isEmpty { Task { interstitial = try? await InterstitialAd.load(with: interstitialUnit, request: Request()) } }
        if rewarded == nil, !rewardedUnit.isEmpty { Task { rewarded = try? await RewardedAd.load(with: rewardedUnit, request: Request()) } }
    }
    private func result(_ shown: Bool, _ dismissed: Bool) -> [String: Any] { ["shown": shown, "earned": earned, "dismissed": dismissed] }

    func show(kind: String, from root: UIViewController, reply: @escaping (Any?, String?) -> Void) {
        guard self.reply == nil else { reply(nil, "AD_BUSY"); return }
        guard root.presentedViewController == nil else { reply(nil, "SCREEN_BUSY"); return }
        self.reply = reply; earned = false
        Task { @MainActor in
            guard await prepare(from: root) else { finish(shown: false); return }
            do {
                switch kind {
                case "appopen":
                    guard !appOpenUnit.isEmpty else { finish(shown: false); return }
                    // launch only: skip if the ad takes too long
                    let unitId = appOpenUnit
                    let ad = try await withThrowingTaskGroup(of: AppOpenAd?.self) { g -> AppOpenAd? in
                        g.addTask { try await AppOpenAd.load(with: unitId, request: Request()) }
                        g.addTask { try await Task.sleep(nanoseconds: 4_500_000_000); return nil }
                        let first = try await g.next() ?? nil; g.cancelAll(); return first
                    }
                    guard let ad = ad else { finish(shown: false); return }
                    current = ad; ad.fullScreenContentDelegate = self; ad.present(from: root)
                case "interstitial":
                    guard let ad = interstitial else { preload(); finish(shown: false); return }
                    interstitial = nil; current = ad; ad.fullScreenContentDelegate = self; ad.present(from: root)
                case "rewarded":
                    guard !rewardedUnit.isEmpty else { fail("AD_UNAVAILABLE"); return }
                    let ad: RewardedAd
                    if let r = rewarded { ad = r } else { ad = try await RewardedAd.load(with: rewardedUnit, request: Request()) }
                    rewarded = nil; current = ad; ad.fullScreenContentDelegate = self
                    ad.present(from: root) { [weak self] in self?.earned = true }
                default: fail("INVALID_AD")
                }
            } catch { fail("AD_UNAVAILABLE") }
        }
    }
    nonisolated func adDidDismissFullScreenContent(_ ad: FullScreenPresentingAd) { Task { @MainActor in finish(shown: true, dismissed: true); preload() } }
    nonisolated func ad(_ ad: FullScreenPresentingAd, didFailToPresentFullScreenContentWithError error: Error) { Task { @MainActor in fail("AD_PRESENT_FAILED"); preload() } }
    private func finish(shown: Bool, dismissed: Bool = false) { let r = reply; reply = nil; current = nil; r?(result(shown, dismissed), nil) }
    private func fail(_ code: String) { let r = reply; reply = nil; current = nil; r?(nil, code) }
}
