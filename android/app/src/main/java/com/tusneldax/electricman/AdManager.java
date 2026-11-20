package com.tusneldax.electricman;

import android.app.Activity;
import android.os.Handler;
import android.os.Looper;

import androidx.annotation.NonNull;

import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.appopen.AppOpenAd;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;

import com.unity3d.ads.IUnityAdsInitializationListener;
import com.unity3d.ads.IUnityAdsLoadListener;
import com.unity3d.ads.IUnityAdsShowListener;
import com.unity3d.ads.UnityAds;
import com.unity3d.ads.UnityAdsShowOptions;
import com.unity3d.ads.metadata.MetaData;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * AdMob: app-open ad on launch, interstitial every 5 cleared levels, rewarded ads for coins.
 * Consent (GDPR/UK) is collected with Google's UMP form before any ad request.
 * Debug builds use Google's official test units; release units come from CI.
 */
final class AdManager {
    private final Activity act;
    private final Handler main = new Handler(Looper.getMainLooper());
    private boolean ready, starting, showing;
    private final List<Runnable> waiting = new ArrayList<>();
    private InterstitialAd interstitial;
    private RewardedAd rewarded;

    AdManager(Activity act) { this.act = act; }

    /* 21 Ekim 2026: AdMob hesabı "kendi reklamını tıklama" nedeniyle 29 gün askıya alındı. Geliştirici telefonlarında
       (USB hata ayıklama açık) yalnız Google'ın resmi test reklamları yüklenir; sahibin ve test cihazlarının gerçek reklama dokunması imkânsızlaşır. */
    private boolean developerDevice() {
        // 19 Kasım 2026: ekip telefonları oyundaki gizli dokunuşla (logoya 7 kez) "test telefonu" yapılır; yalnız test reklamı görür
        if (act.getSharedPreferences("ads", Activity.MODE_PRIVATE).getBoolean("testPhone", false)) return true;
        try { return android.provider.Settings.Global.getInt(act.getContentResolver(), android.provider.Settings.Global.ADB_ENABLED, 0) == 1; }
        catch (Exception e) { return true; }
    }
    private String appOpenUnit() { return developerDevice() ? "ca-app-pub-3940256099942544/9257395921" : BuildConfig.AD_APP_OPEN; }
    private String interstitialUnit() { return developerDevice() ? "ca-app-pub-3940256099942544/1033173712" : BuildConfig.AD_INTERSTITIAL; }
    private String rewardedUnit() { return developerDevice() ? "ca-app-pub-3940256099942544/5224354917" : BuildConfig.AD_REWARDED; }

    /** Gizli test telefonu anahtarı; yeni durum bir sonraki açılışta tüm reklam birimlerine uygulanır. */
    boolean toggleTestPhone() {
        android.content.SharedPreferences p = act.getSharedPreferences("ads", Activity.MODE_PRIVATE);
        boolean on = !p.getBoolean("testPhone", false);
        p.edit().putBoolean("testPhone", on).apply();
        interstitial = null; rewarded = null; if (ready) preload();
        return on;
    }

    private static JSONObject result(boolean shown, boolean earned, boolean dismissed) {
        try { return new JSONObject().put("shown", shown).put("earned", earned).put("dismissed", dismissed); }
        catch (Exception e) { return new JSONObject(); }
    }

    private void ensure(Runnable then) {
        if (ready) { then.run(); return; }
        waiting.add(then);
        if (starting) return;
        starting = true;
        ConsentInformation ci = UserMessagingPlatform.getConsentInformation(act);
        ConsentRequestParameters params = new ConsentRequestParameters.Builder().build();
        ci.requestConsentInfoUpdate(act, params,
                () -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(act, formError -> start(ci)),
                error -> start(ci));
    }

    private void start(ConsentInformation ci) {
        if (!ci.canRequestAds()) { ready = true; flush(); return; }
        try { MetaData gdpr = new MetaData(act); gdpr.set("gdpr.consent", true); gdpr.commit(); } catch (Exception ignored) {}
        unityInit();
        new Thread(() -> MobileAds.initialize(act, status -> main.post(() -> { ready = true; preload(); flush(); }))).start();
    }

    private void flush() { List<Runnable> w = new ArrayList<>(waiting); waiting.clear(); for (Runnable r : w) r.run(); }

    private boolean allowed() { return UserMessagingPlatform.getConsentInformation(act).canRequestAds(); }

    private void preload() {
        if (!allowed()) return;
        if (interstitial == null && !BuildConfig.AD_INTERSTITIAL.isEmpty()) loadInterstitial(null);
        if (rewarded == null && !BuildConfig.AD_REWARDED.isEmpty()) loadRewarded(null);
    }

    private void loadInterstitial(Runnable after) {
        InterstitialAd.load(act, interstitialUnit(), new AdRequest.Builder().build(), new InterstitialAdLoadCallback() {
            @Override public void onAdLoaded(@NonNull InterstitialAd ad) { interstitial = ad; if (after != null) after.run(); }
            @Override public void onAdFailedToLoad(@NonNull LoadAdError e) { interstitial = null; if (after != null) after.run(); }
        });
    }

    private void loadRewarded(Runnable after) {
        RewardedAd.load(act, rewardedUnit(), new AdRequest.Builder().build(), new RewardedAdLoadCallback() {
            @Override public void onAdLoaded(@NonNull RewardedAd ad) { rewarded = ad; if (after != null) after.run(); }
            @Override public void onAdFailedToLoad(@NonNull LoadAdError e) { rewarded = null; if (after != null) after.run(); }
        });
    }

    void show(String kind, Cb cb) {
        main.post(() -> {
            if (showing) { cb.done("AD_BUSY", null); return; }
            ensure(() -> {
                if (!allowed()) { cb.done(null, result(false, false, false)); return; }
                switch (kind) {
                    case "appopen": appOpen(cb); break;
                    case "interstitial": showInterstitial(cb); break;
                    case "rewarded": showRewarded(cb); break;
                    default: cb.done("INVALID_AD", null);
                }
            });
        });
    }

    private void appOpen(Cb cb) {
        if (BuildConfig.AD_APP_OPEN.isEmpty()) { cb.done(null, result(false, false, false)); return; }
        final boolean[] settled = {false};
        // only show at launch: give up if the ad is not ready within a few seconds
        main.postDelayed(() -> { if (!settled[0]) { settled[0] = true; cb.done(null, result(false, false, false)); } }, 4500);
        AppOpenAd.load(act, appOpenUnit(), new AdRequest.Builder().build(), new AppOpenAd.AppOpenAdLoadCallback() {
            @Override public void onAdLoaded(@NonNull AppOpenAd ad) {
                if (settled[0]) return;
                settled[0] = true; showing = true;
                ad.setFullScreenContentCallback(new FullScreenContentCallback() {
                    @Override public void onAdDismissedFullScreenContent() { showing = false; cb.done(null, result(true, false, true)); }
                    @Override public void onAdFailedToShowFullScreenContent(@NonNull AdError e) { showing = false; cb.done(null, result(false, false, false)); }
                });
                ad.show(act);
            }
            @Override public void onAdFailedToLoad(@NonNull LoadAdError e) { if (!settled[0]) { settled[0] = true; cb.done(null, result(false, false, false)); } }
        });
    }

    private void showInterstitial(Cb cb) {
        if (interstitial == null) { if (!BuildConfig.AD_INTERSTITIAL.isEmpty()) loadInterstitial(null); unityShow("Interstitial_Android", false, cb); return; }
        InterstitialAd ad = interstitial; interstitial = null; showing = true;
        ad.setFullScreenContentCallback(new FullScreenContentCallback() {
            @Override public void onAdDismissedFullScreenContent() { showing = false; cb.done(null, result(true, false, true)); loadInterstitial(null); }
            @Override public void onAdFailedToShowFullScreenContent(@NonNull AdError e) { showing = false; cb.done(null, result(false, false, false)); loadInterstitial(null); }
        });
        ad.show(act);
    }

    private void showRewarded(Cb cb) {
        if (BuildConfig.AD_REWARDED.isEmpty()) { unityShow("Rewarded_Android", true, cb); return; }
        Runnable present = () -> {
            if (rewarded == null) { unityShow("Rewarded_Android", true, cb); return; }
            RewardedAd ad = rewarded; rewarded = null; showing = true;
            final boolean[] earned = {false};
            ad.setFullScreenContentCallback(new FullScreenContentCallback() {
                @Override public void onAdDismissedFullScreenContent() { showing = false; cb.done(null, result(true, earned[0], true)); loadRewarded(null); }
                @Override public void onAdFailedToShowFullScreenContent(@NonNull AdError e) { showing = false; cb.done("AD_PRESENT_FAILED", null); loadRewarded(null); }
            });
            ad.show(act, reward -> earned[0] = true);
        };
        if (rewarded != null) present.run(); else loadRewarded(present);
    }

    /* 20 Kasım 2026: Google reklamı gelmezse (ör. AdMob askısı) Unity Ads yedek olarak gösterilir.
       Oyun kimliği ads.env'deki EM_UNITY_GAME_ID_ANDROID'den gelir; boşsa Unity hiç çalışmaz. Test telefonlarında Unity deneme modunda açılır. */
    private boolean unityReady;
    private final java.util.Set<String> unityLoaded = new java.util.HashSet<>();

    private void unityInit() {
        if (BuildConfig.UNITY_GAME_ID.isEmpty() || UnityAds.isInitialized()) return;
        UnityAds.initialize(act.getApplicationContext(), BuildConfig.UNITY_GAME_ID, developerDevice() || BuildConfig.DEBUG, new IUnityAdsInitializationListener() {
            @Override public void onInitializationComplete() { main.post(() -> { unityReady = true; unityLoad("Interstitial_Android"); unityLoad("Rewarded_Android"); }); }
            @Override public void onInitializationFailed(UnityAds.UnityAdsInitializationError e, String m) { unityReady = false; }
        });
    }

    private void unityLoad(String placement) {
        if (!unityReady) return;
        UnityAds.load(placement, new IUnityAdsLoadListener() {
            @Override public void onUnityAdsAdLoaded(String id) { main.post(() -> unityLoaded.add(id)); }
            @Override public void onUnityAdsFailedToLoad(String id, UnityAds.UnityAdsLoadError e, String m) { main.post(() -> unityLoaded.remove(id)); }
        });
    }

    private void unityShow(String placement, boolean reward, Cb cb) {
        if (!unityReady || !unityLoaded.contains(placement)) {
            unityLoad(placement);
            if (reward) cb.done("AD_UNAVAILABLE", null); else cb.done(null, result(false, false, false));
            return;
        }
        unityLoaded.remove(placement); showing = true;
        final boolean[] settled = {false};
        UnityAds.show(act, placement, new UnityAdsShowOptions(), new IUnityAdsShowListener() {
            @Override public void onUnityAdsShowFailure(String id, UnityAds.UnityAdsShowError e, String m) { main.post(() -> { if (settled[0]) return; settled[0] = true; showing = false; if (reward) cb.done("AD_PRESENT_FAILED", null); else cb.done(null, result(false, false, false)); unityLoad(id); }); }
            @Override public void onUnityAdsShowStart(String id) {}
            @Override public void onUnityAdsShowClick(String id) {}
            @Override public void onUnityAdsShowComplete(String id, UnityAds.UnityAdsShowCompletionState st) { main.post(() -> { if (settled[0]) return; settled[0] = true; showing = false; cb.done(null, result(true, reward && st == UnityAds.UnityAdsShowCompletionState.COMPLETED, true)); unityLoad(id); }); }
        });
    }
}
