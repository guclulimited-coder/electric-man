package com.tusneldax.electricman;

import android.app.Activity;

import androidx.annotation.NonNull;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ConsumeParams;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Google Play Billing for consumable coin packs (em_coins_500). The game grants coins, then asks to consume. */
final class BillingManager implements PurchasesUpdatedListener {
    private final BillingClient client;
    private final Map<String, ProductDetails> details = new HashMap<>();
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

    private void query(List<String> ids, Cb cb) {
        List<QueryProductDetailsParams.Product> list = new ArrayList<>();
        for (String id : ids) list.add(QueryProductDetailsParams.Product.newBuilder().setProductId(id).setProductType(BillingClient.ProductType.INAPP).build());
        client.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(list).build(), (r, result) -> {
            if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) { cb.done("PRODUCTS_UNAVAILABLE", null); return; }
            try {
                JSONArray out = new JSONArray();
                for (ProductDetails pd : result.getProductDetailsList()) {
                    details.put(pd.getProductId(), pd);
                    ProductDetails.OneTimePurchaseOfferDetails offer = pd.getOneTimePurchaseOfferDetails();
                    out.put(new JSONObject().put("id", pd.getProductId()).put("price", offer == null ? "" : offer.getFormattedPrice()));
                }
                cb.done(null, out);
            } catch (Exception e) { cb.done("PRODUCTS_UNAVAILABLE", null); }
        });
    }

    void products(JSONArray ids, Cb cb) {
        List<String> list = new ArrayList<>();
        if (ids != null) for (int i = 0; i < ids.length(); i++) list.add(ids.optString(i));
        if (list.isEmpty()) { cb.done(null, new JSONArray()); return; }
        connected(() -> query(list, cb), cb);
    }

    void buy(Activity act, String id, Cb cb) {
        if (buyCb != null) { cb.done("BUY_BUSY", null); return; }
        connected(() -> {
            Runnable launch = () -> {
                ProductDetails pd = details.get(id);
                if (pd == null) { cb.done("PRODUCT_UNAVAILABLE", null); return; }
                buyCb = cb;
                BillingFlowParams params = BillingFlowParams.newBuilder()
                        .setProductDetailsParamsList(Collections.singletonList(BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(pd).build()))
                        .build();
                act.runOnUiThread(() -> {
                    BillingResult r = client.launchBillingFlow(act, params);
                    if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) { Cb c = buyCb; buyCb = null; if (c != null) c.done("BUY_FAILED", null); }
                });
            };
            if (details.containsKey(id)) launch.run();
            else query(Collections.singletonList(id), (err, data) -> { if (err != null) cb.done(err, null); else launch.run(); });
        }, cb);
    }

    @Override
    public void onPurchasesUpdated(@NonNull BillingResult r, List<Purchase> purchases) {
        Cb cb = buyCb; buyCb = null;
        if (cb == null) return;
        int code = r.getResponseCode();
        if (code == BillingClient.BillingResponseCode.USER_CANCELED) { cb.done("CANCELLED", null); return; }
        if (code != BillingClient.BillingResponseCode.OK || purchases == null || purchases.isEmpty()) { cb.done("BUY_FAILED", null); return; }
        Purchase p = purchases.get(0);
        if (p.getPurchaseState() == Purchase.PurchaseState.PENDING) { cb.done("PENDING", null); return; }
        try { cb.done(null, new JSONObject().put("ok", true).put("id", p.getProducts().get(0)).put("txn", p.getPurchaseToken())); }
        catch (Exception e) { cb.done("BUY_FAILED", null); }
    }

    void finish(String token, Cb cb) {
        if (token == null || token.isEmpty()) { cb.done("INVALID_TXN", null); return; }
        connected(() -> client.consumeAsync(ConsumeParams.newBuilder().setPurchaseToken(token).build(), (r, t) -> {
            try { cb.done(null, new JSONObject().put("ok", r.getResponseCode() == BillingClient.BillingResponseCode.OK)); }
            catch (Exception e) { cb.done(null, null); }
        }), cb);
    }

    void pending(Cb cb) {
        connected(() -> client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(), (r, list) -> {
            JSONArray out = new JSONArray();
            try {
                for (Purchase p : list) if (p.getPurchaseState() == Purchase.PurchaseState.PURCHASED)
                    out.put(new JSONObject().put("id", p.getProducts().get(0)).put("txn", p.getPurchaseToken()));
            } catch (Exception ignored) { }
            cb.done(null, out);
        }), cb);
    }

    void close() { try { client.endConnection(); } catch (Exception ignored) { } }
}
