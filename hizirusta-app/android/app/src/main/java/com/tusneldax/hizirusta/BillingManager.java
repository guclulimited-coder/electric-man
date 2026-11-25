package com.tusneldax.hizirusta;

import android.app.Activity;

import androidx.annotation.NonNull;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;

import org.json.JSONObject;

import java.util.Collections;
import java.util.List;

/** Google Play aboneliği: Usta Paketi (usta_paketi_aylik). Satın alınınca onaylanır; durum her açılışta Play'den okunur. */
final class BillingManager implements PurchasesUpdatedListener {
    private final BillingClient client;
    private ProductDetails details;
    private Cb buyCb;

    BillingManager(Activity act) {
        client = BillingClient.newBuilder(act)
                .setListener(this)
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .build();
    }

    private void connected(Runnable then, Cb onError) {
        if (client.isReady()) { then.run(); return; }
        client.startConnection(new BillingClientStateListener() {
            @Override public void onBillingSetupFinished(@NonNull BillingResult r) {
                if (r.getResponseCode() == BillingClient.BillingResponseCode.OK) then.run();
                else onError.done("BILLING_UNAVAILABLE", null);
            }
            @Override public void onBillingServiceDisconnected() { }
        });
    }

    private void query(String id, Cb cb) {
        if (details != null && details.getProductId().equals(id)) { cb.done(null, details); return; }
        QueryProductDetailsParams.Product p = QueryProductDetailsParams.Product.newBuilder().setProductId(id).setProductType(BillingClient.ProductType.SUBS).build();
        client.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(Collections.singletonList(p)).build(), (r, result) -> {
            List<ProductDetails> l = result.getProductDetailsList();
            if (r.getResponseCode() != BillingClient.BillingResponseCode.OK || l.isEmpty()) { cb.done("PRODUCT_UNAVAILABLE", null); return; }
            details = l.get(0); cb.done(null, details);
        });
    }

    void price(String id, Cb cb) {
        connected(() -> query(id, (err, d) -> {
            if (err != null) { cb.done(err, null); return; }
            try {
                ProductDetails pd = (ProductDetails) d;
                List<ProductDetails.SubscriptionOfferDetails> offers = pd.getSubscriptionOfferDetails();
                String price = "";
                if (offers != null && !offers.isEmpty()) {
                    List<ProductDetails.PricingPhase> ph = offers.get(0).getPricingPhases().getPricingPhaseList();
                    price = ph.get(ph.size() - 1).getFormattedPrice();
                }
                cb.done(null, new JSONObject().put("price", price));
            } catch (Exception e) { cb.done("PRODUCT_UNAVAILABLE", null); }
        }), cb);
    }

    void subscribe(Activity act, String id, Cb cb) {
        if (buyCb != null) { cb.done("BUY_BUSY", null); return; }
        connected(() -> query(id, (err, d) -> {
            if (err != null) { cb.done(err, null); return; }
            ProductDetails pd = (ProductDetails) d;
            List<ProductDetails.SubscriptionOfferDetails> offers = pd.getSubscriptionOfferDetails();
            if (offers == null || offers.isEmpty()) { cb.done("PRODUCT_UNAVAILABLE", null); return; }
            buyCb = cb;
            BillingFlowParams params = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(Collections.singletonList(BillingFlowParams.ProductDetailsParams.newBuilder()
                            .setProductDetails(pd).setOfferToken(offers.get(0).getOfferToken()).build()))
                    .build();
            act.runOnUiThread(() -> {
                BillingResult r = client.launchBillingFlow(act, params);
                if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) { Cb c = buyCb; buyCb = null; if (c != null) c.done("BUY_FAILED", null); }
            });
        }), cb);
    }

    @Override
    public void onPurchasesUpdated(@NonNull BillingResult r, List<Purchase> purchases) {
        Cb cb = buyCb; buyCb = null;
        int code = r.getResponseCode();
        if (code == BillingClient.BillingResponseCode.OK && purchases != null) for (Purchase p : purchases) acknowledge(p);
        if (cb == null) return;
        if (code == BillingClient.BillingResponseCode.USER_CANCELED) { cb.done("CANCELLED", null); return; }
        if (code == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) { cb.done(null, ok(true)); return; }
        if (code != BillingClient.BillingResponseCode.OK || purchases == null || purchases.isEmpty()) { cb.done("BUY_FAILED", null); return; }
        Purchase p = purchases.get(0);
        if (p.getPurchaseState() == Purchase.PurchaseState.PENDING) { cb.done("PENDING", null); return; }
        cb.done(null, ok(true));
    }

    private void acknowledge(Purchase p) {
        if (p.getPurchaseState() != Purchase.PurchaseState.PURCHASED || p.isAcknowledged()) return;
        client.acknowledgePurchase(AcknowledgePurchaseParams.newBuilder().setPurchaseToken(p.getPurchaseToken()).build(), r -> { });
    }

    /** Abonelik sürüyor mu? (iptal edilen abonelik dönem sonuna kadar etkin sayılır; süresi biteni Play listelemez) */
    void status(String id, Cb cb) {
        connected(() -> client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(), (r, list) -> {
            if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) { cb.done("STATUS_UNAVAILABLE", null); return; }
            boolean active = false;
            for (Purchase p : list) if (p.getPurchaseState() == Purchase.PurchaseState.PURCHASED && p.getProducts().contains(id)) { active = true; acknowledge(p); }
            cb.done(null, ok(active));
        }), cb);
    }

    private static JSONObject ok(boolean v) { try { return new JSONObject().put("ok", v).put("active", v); } catch (Exception e) { return new JSONObject(); } }

    void close() { try { client.endConnection(); } catch (Exception ignored) { } }
}
