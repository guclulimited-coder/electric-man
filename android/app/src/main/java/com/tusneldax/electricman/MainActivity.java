package com.tusneldax.electricman;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Collections;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

/**
 * Electric Man Android shell: the game ships inside the app (assets/www) and is served from
 * https://appassets.androidplatform.net/www/ by WebViewAssetLoader. The page talks to the app through an
 * origin-restricted web message listener ("EMBridge"): API calls (session kept in app storage), sign-in via the
 * system browser, AdMob ads and Google Play purchases.
 */
public class MainActivity extends AppCompatActivity {
    static final String ORIGIN = "https://electricman.tusneldax.com";
    static final String APP_HOST = "appassets.androidplatform.net";
    static final String START = "https://" + APP_HOST + "/www/index.html";
    private static final Pattern API_PATH = Pattern.compile("^/[a-z][a-z/-]{0,40}(\\?[A-Za-z0-9=&%._-]{0,200})?$");

    private WebView web;
    private SharedPreferences store, auth;
    private AdManager ads;
    private BillingManager billing;
    private final ExecutorService io = Executors.newCachedThreadPool();
    private final Handler main = new Handler(Looper.getMainLooper());
    private final SecureRandom random = new SecureRandom();

    // pending system-browser sign-in
    private JavaScriptReplyProxy loginProxy;
    private int loginId;
    private String loginVerifier, loginState;
    private boolean loginAway;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        store = getSharedPreferences("em_store", MODE_PRIVATE);
        auth = getSharedPreferences("em_auth", MODE_PRIVATE);
        ads = new AdManager(this);
        billing = new BillingManager(this);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(0x6E, 0xC6, 0xFF));
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(0xB9, 0xE6, 0xFF));
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets b = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            v.setPadding(b.left, b.top, b.right, b.bottom);
            return WindowInsetsCompat.CONSUMED;
        });

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(@NonNull WebView view, @NonNull WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }
            @Override
            public boolean shouldOverrideUrlLoading(@NonNull WebView view, @NonNull WebResourceRequest request) {
                Uri u = request.getUrl();
                if (APP_HOST.equals(u.getHost())) return false;
                if ("https".equals(u.getScheme())) openExternal(u);
                return true;
            }
        });

        Set<String> origins = Collections.singleton("https://" + APP_HOST);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "EMBridge", origins, (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                if (!isMainFrame || message.getType() != WebMessageCompat.TYPE_STRING) return;
                handle(message.getData(), replyProxy);
            });
        }
        String saved = store.getString("data", "{}");
        String shim = "(()=>{if(!window.EMBridge||window.EMNative)return;const cb={};let n=0;"
                + "EMBridge.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch(_){return}const c=cb[m.id];if(!c)return;delete cb[m.id];m.error?c.rej(new Error(m.error)):c.res(m.data)};"
                + "window.EMNative=Object.freeze({platform:'android',call:o=>new Promise((res,rej)=>{const id=++n;cb[id]={res,rej};EMBridge.postMessage(JSON.stringify(Object.assign({},o,{id})))})});"
                + "try{window.__EM_RESTORE=JSON.parse(" + JSONObject.quote(saved) + ")}catch(_){}})();";
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(web, shim, origins);
        }
        // store screenshots: `am start ... --ei emShot 1..6 --es emShotLang tr` opens the game's demo scenes
        int shot = getIntent().getIntExtra("emShot", 0);
        String shotLang = getIntent().getStringExtra("emShotLang");
        web.loadUrl(shot > 0 ? START + "?shot=" + shot + "&lang=" + (shotLang == null ? "" : shotLang) : START);
        handleIntent(getIntent());
    }

    /* ---------------- bridge ---------------- */
    private void handle(String raw, JavaScriptReplyProxy proxy) {
        int id = 0;
        try {
            JSONObject m = new JSONObject(raw);
            id = m.optInt("id");
            final int rid = id;
            String action = m.optString("action");
            switch (action) {
                case "persist": {
                    String data = m.optString("data", "{}");
                    if (data.length() > 2_000_000) { reply(proxy, rid, "TOO_LARGE", null); return; }
                    store.edit().putString("data", data).apply();
                    reply(proxy, rid, null, new JSONObject().put("ok", true));
                    return;
                }
                case "api": api(m, proxy, rid); return;
                case "login": startLogin(m.optString("lang", "tr"), proxy, rid); return;
                case "ad": ads.show(m.optString("kind"), (err, data) -> reply(proxy, rid, err, data)); return;
                case "products": billing.products(m.optJSONArray("ids"), (err, data) -> reply(proxy, rid, err, data)); return;
                case "buy": billing.buy(this, m.optString("id"), (err, data) -> reply(proxy, rid, err, data)); return;
                case "finish": billing.finish(m.optString("txn"), (err, data) -> reply(proxy, rid, err, data)); return;
                case "pending": billing.pending((err, data) -> reply(proxy, rid, err, data)); return;
                default: reply(proxy, rid, "INVALID_ACTION", null);
            }
        } catch (Exception e) {
            reply(proxy, id, "INVALID_MESSAGE", null);
        }
    }

    void reply(JavaScriptReplyProxy proxy, int id, String error, Object data) {
        main.post(() -> {
            try {
                JSONObject r = new JSONObject().put("id", id);
                if (error != null) r.put("error", error); else r.put("data", data == null ? JSONObject.NULL : data);
                proxy.postMessage(r.toString());
            } catch (Exception ignored) { }
        });
    }

    private void api(JSONObject m, JavaScriptReplyProxy proxy, int id) {
        final String path = m.optString("path"), method = "POST".equals(m.optString("method")) ? "POST" : "GET";
        final Object body = m.opt("body");
        if (!API_PATH.matcher(path).matches()) { reply(proxy, id, "INVALID_PATH", null); return; }
        io.execute(() -> {
            try {
                Object[] r = request(method, path, body);
                int status = (int) r[0];
                if (status == 200 && (path.equals("/logout") || path.equals("/delete-account"))) auth.edit().remove("token").apply();
                reply(proxy, id, null, new JSONObject().put("status", status).put("body", r[1]));
            } catch (Exception e) {
                reply(proxy, id, "CONNECTION_FAILED", null);
            }
        });
    }

    private Object[] request(String method, String path, Object body) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(ORIGIN + "/api/em" + path).openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(15000);
        c.setReadTimeout(20000);
        c.setInstanceFollowRedirects(false);
        c.setRequestProperty("Origin", ORIGIN);
        c.setRequestProperty("Accept", "application/json");
        String token = auth.getString("token", null);
        if (token != null) c.setRequestProperty("Cookie", "__Host-em-session=" + token);
        if ("POST".equals(method)) {
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            byte[] out = (body == null || body == JSONObject.NULL ? "{}" : body.toString()).getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = c.getOutputStream()) { os.write(out); }
        }
        int status = c.getResponseCode();
        InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
        String text = "{}";
        if (in != null) {
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            byte[] b = new byte[8192];
            int n, total = 0;
            while ((n = in.read(b)) > 0) { total += n; if (total > 2_000_000) throw new Exception("too large"); buf.write(b, 0, n); }
            in.close();
            text = buf.toString("UTF-8");
        }
        Object parsed;
        try { parsed = new JSONTokener(text).nextValue(); } catch (Exception e) { parsed = new JSONObject(); }
        return new Object[]{status, parsed};
    }

    /* ---------------- sign-in through the system browser (PKCE ticket) ---------------- */
    private String hex(byte[] b) { StringBuilder s = new StringBuilder(); for (byte x : b) s.append(String.format("%02x", x)); return s.toString(); }
    private String randomHex(int bytes) { byte[] b = new byte[bytes]; random.nextBytes(b); return hex(b); }

    private void startLogin(String lang, JavaScriptReplyProxy proxy, int id) {
        try {
            if (loginProxy != null) reply(loginProxy, loginId, "LOGIN_CANCELLED", null);
            loginProxy = proxy; loginId = id;
            loginVerifier = randomHex(32); loginState = randomHex(16);
            String challenge = hex(MessageDigest.getInstance("SHA-256").digest(loginVerifier.getBytes(StandardCharsets.UTF_8)));
            Uri u = Uri.parse(ORIGIN + "/app-login").buildUpon()
                    .appendQueryParameter("challenge", challenge).appendQueryParameter("state", loginState)
                    .appendQueryParameter("lang", lang.matches("^[a-z]{2}$") ? lang : "tr").appendQueryParameter("platform", "android").build();
            loginAway = true;
            new CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(this, u);
        } catch (Exception e) {
            reply(proxy, id, "LOGIN_UNAVAILABLE", null);
            loginProxy = null;
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        Uri u = intent == null ? null : intent.getData();
        if (u == null || !"electricman".equals(u.getScheme()) || !"signin".equals(u.getHost())) return;
        loginAway = false;
        final JavaScriptReplyProxy proxy = loginProxy;
        final int id = loginId;
        final String verifier = loginVerifier, state = loginState;
        loginProxy = null;
        String ticket = u.getQueryParameter("ticket"), st = u.getQueryParameter("state");
        if (proxy == null) return;
        if (ticket == null || !ticket.matches("^[a-f0-9]{64}$") || state == null || !state.equals(st)) { reply(proxy, id, "LOGIN_EXPIRED", null); return; }
        io.execute(() -> {
            try {
                Object[] r = request("POST", "/native/exchange", new JSONObject().put("ticket", ticket).put("verifier", verifier));
                JSONObject b = r[1] instanceof JSONObject ? (JSONObject) r[1] : new JSONObject();
                String token = b.optString("token");
                if ((int) r[0] == 200 && token.matches("^[a-f0-9]{64}$")) {
                    auth.edit().putString("token", token).apply();
                    reply(proxy, id, null, new JSONObject().put("ok", true));
                } else reply(proxy, id, "LOGIN_EXPIRED", null);
            } catch (Exception e) { reply(proxy, id, "CONNECTION_FAILED", null); }
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (loginAway) {
            // back from the browser without a sign-in callback → the user closed it
            main.postDelayed(() -> {
                if (loginAway && loginProxy != null) { loginAway = false; reply(loginProxy, loginId, "LOGIN_CANCELLED", null); loginProxy = null; }
            }, 1500);
        }
    }

    void openExternal(Uri u) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        billing.close();
        io.shutdown();
        super.onDestroy();
    }
}
