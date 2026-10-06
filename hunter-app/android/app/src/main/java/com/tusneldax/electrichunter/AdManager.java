package com.tusneldax.electrichunter;

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
        InterstitialAd.load(act, BuildConfig.AD_INTERSTITIAL, new AdRequest.Builder().build(), new InterstitialAdLoadCallback() {
            @Override public void onAdLoaded(@NonNull InterstitialAd ad) { interstitial = ad; if (after != null) after.run(); }
            @Override public void onAdFailedToLoad(@NonNull LoadAdError e) { interstitial = null; if (after != null) after.run(); }
        });
    }

    private void loadRewarded(Runnable after) {
        RewardedAd.load(act, BuildConfig.AD_REWARDED, new AdRequest.Builder().build(), new RewardedAdLoadCallback() {
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
        AppOpenAd.load(act, BuildConfig.AD_APP_OPEN, new AdRequest.Builder().build(), new AppOpenAd.AppOpenAdLoadCallback() {
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
        if (BuildConfig.AD_INTERSTITIAL.isEmpty()) { cb.done(null, result(false, false, false)); return; }
        if (interstitial == null) { loadInterstitial(null); cb.done(null, result(false, false, false)); return; }
        InterstitialAd ad = interstitial; interstitial = null; showing = true;
        ad.setFullScreenContentCallback(new FullScreenContentCallback() {
            @Override public void onAdDismissedFullScreenContent() { showing = false; cb.done(null, result(true, false, true)); loadInterstitial(null); }
            @Override public void onAdFailedToShowFullScreenContent(@NonNull AdError e) { showing = false; cb.done(null, result(false, false, false)); loadInterstitial(null); }
        });
        ad.show(act);
    }

    private void showRewarded(Cb cb) {
        if (BuildConfig.AD_REWARDED.isEmpty()) { cb.done("AD_UNAVAILABLE", null); return; }
        Runnable present = () -> {
            if (rewarded == null) { cb.done("AD_UNAVAILABLE", null); return; }
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
}
