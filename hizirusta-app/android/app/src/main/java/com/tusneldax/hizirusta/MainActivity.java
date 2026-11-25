package com.tusneldax.hizirusta;

import android.annotation.SuppressLint;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Color;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.FileProvider;
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

import java.io.File;
import java.io.FileOutputStream;
import java.util.Collections;
import java.util.Locale;
import java.util.Set;

/**
 * HızırUsta Android kabuğu (25 Kasım 2026): uygulama sayfaları assets/www içinde gelir ve
 * https://appassets.androidplatform.net/www/ adresinden WebViewAssetLoader ile sunulur.
 * Sayfa uygulamayla yalnız kendi adresinden gelen "EMBridge" mesajlarıyla konuşur:
 * reklam (AdMob), abonelik (Google Play), pusula algılayıcısı, dosya paylaşma, kamera ve galeri.
 */
public class MainActivity extends AppCompatActivity implements SensorEventListener {
    static final String APP_HOST = "appassets.androidplatform.net";
    static final String START = "https://" + APP_HOST + "/www/index.html";

    private WebView web;
    private AdManager ads;
    private BillingManager billing;
    private final Handler main = new Handler(Looper.getMainLooper());

    // pusula algılayıcısı: örnekler 60 ms'de bir toplu gönderilir
    private SensorManager sensors;
    private final StringBuilder magBuf = new StringBuilder();
    private int magCount;
    private boolean magOn;
    private final Runnable magFlush = this::flushMag;

    // dosya seçme / fotoğraf çekme
    private ValueCallback<Uri[]> fileCb;
    private Uri cameraUri;
    private ActivityResultLauncher<Intent> pickLauncher;
    private ActivityResultLauncher<Uri> cameraLauncher;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        ads = new AdManager(this);
        billing = new BillingManager(this);
        sensors = (SensorManager) getSystemService(SENSOR_SERVICE);

        pickLauncher = registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), r -> {
            ValueCallback<Uri[]> cb = fileCb; fileCb = null;
            if (cb == null) return;
            Uri[] out = null;
            Intent d = r.getData();
            if (r.getResultCode() == RESULT_OK && d != null) {
                ClipData clip = d.getClipData();
                if (clip != null) { out = new Uri[clip.getItemCount()]; for (int i = 0; i < out.length; i++) out[i] = clip.getItemAt(i).getUri(); }
                else if (d.getData() != null) out = new Uri[]{d.getData()};
            }
            cb.onReceiveValue(out);
        });
        cameraLauncher = registerForActivityResult(new ActivityResultContracts.TakePicture(), ok -> {
            ValueCallback<Uri[]> cb = fileCb; fileCb = null;
            if (cb != null) cb.onReceiveValue(ok && cameraUri != null ? new Uri[]{cameraUri} : null);
        });

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(0x14, 0x21, 0x3D));
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(0xF4, 0xF5, 0xF7));
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets b = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime());
            v.setPadding(b.left, b.top, b.right, b.bottom);
            return WindowInsetsCompat.CONSUMED;
        });

        if ((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) WebView.setWebContentsDebuggingEnabled(true);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
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
                openExternal(u);
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                try {
                    if (p.isCaptureEnabled()) {
                        File dir = new File(getCacheDir(), "kamera"); dir.mkdirs();
                        File f = new File(dir, "foto-" + System.currentTimeMillis() + ".jpg");
                        cameraUri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".dosyalar", f);
                        cameraLauncher.launch(cameraUri);
                    } else {
                        Intent it = p.createIntent();
                        if (p.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) it.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                        pickLauncher.launch(it);
                    }
                    return true;
                } catch (Exception e) { fileCb = null; return false; }
            }
            @Override
            public boolean onCreateWindow(WebView view, boolean dialog, boolean userGesture, android.os.Message resultMsg) { return false; }
        });
        // window.open (WhatsApp bağlantısı) WebView içinde açılmaz; sayfa tarafı location ile gider, burada dış uygulamaya yönlenir
        s.setSupportMultipleWindows(false);

        Set<String> origins = Collections.singleton("https://" + APP_HOST);
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "EMBridge", origins, (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                if (!isMainFrame || message.getType() != WebMessageCompat.TYPE_STRING) return;
                handle(message.getData(), replyProxy);
            });
        }
        String shim = "(()=>{if(!window.EMBridge||window.EMNative)return;const cb={};let n=0;"
                + "EMBridge.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch(_){return}const c=cb[m.id];if(!c)return;delete cb[m.id];m.error?c.rej(new Error(m.error)):c.res(m.data)};"
                + "window.EMNative=Object.freeze({platform:'android',call:o=>new Promise((res,rej)=>{const id=++n;cb[id]={res,rej};EMBridge.postMessage(JSON.stringify(Object.assign({},o,{id})))})});"
                + "window.open=(u)=>{try{EMBridge.postMessage(JSON.stringify({id:0,action:'open',url:String(u)}))}catch(_){}return null};})();";
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(web, shim, origins);
        }
        web.loadUrl(START);
    }

    /* ---------------- köprü ---------------- */
    private void handle(String raw, JavaScriptReplyProxy proxy) {
        int id = 0;
        try {
            JSONObject m = new JSONObject(raw);
            id = m.optInt("id");
            final int rid = id;
            switch (m.optString("action")) {
                case "ad": ads.show(m.optString("kind"), (err, data) -> reply(proxy, rid, err, data)); return;
                case "adtest": { boolean on = ads.toggleTestPhone(); reply(proxy, rid, null, new JSONObject().put("on", on)); return; }
                case "subscribe": billing.subscribe(this, m.optString("id"), (err, data) -> reply(proxy, rid, err, data)); return;
                case "subStatus": billing.status(m.optString("id"), (err, data) -> reply(proxy, rid, err, data)); return;
                case "subPrice": billing.price(m.optString("id"), (err, data) -> reply(proxy, rid, err, data)); return;
                case "magStart": main.post(() -> { boolean ok = startMag(); reply(proxy, rid, ok ? null : "NO_SENSOR", ok ? jsonOf("ok", true) : null); }); return;
                case "magStop": main.post(() -> { stopMag(); reply(proxy, rid, null, jsonOf("ok", true)); }); return;
                case "shareFile": shareFile(m, proxy, rid); return;
                case "print": { String ad = m.optString("name", "HizirUsta"); main.post(() -> {
                    try { android.print.PrintManager pm = (android.print.PrintManager) getSystemService(PRINT_SERVICE);
                        pm.print(ad, web.createPrintDocumentAdapter(ad), new android.print.PrintAttributes.Builder().setMediaSize(android.print.PrintAttributes.MediaSize.ISO_A4).build());
                        reply(proxy, rid, null, jsonOf("ok", true)); } catch (Exception e) { reply(proxy, rid, "PRINT_FAILED", null); } }); return; }
                case "open": { String u = m.optString("url"); if (u.startsWith("https://")) main.post(() -> openExternal(Uri.parse(u))); return; }
                default: reply(proxy, rid, "INVALID_ACTION", null);
            }
        } catch (Exception e) {
            reply(proxy, id, "INVALID_MESSAGE", null);
        }
    }

    void reply(JavaScriptReplyProxy proxy, int id, String error, Object data) {
        if (id == 0) return;
        main.post(() -> {
            try {
                JSONObject r = new JSONObject().put("id", id);
                if (error != null) r.put("error", error); else r.put("data", data == null ? JSONObject.NULL : data);
                proxy.postMessage(r.toString());
            } catch (Exception ignored) { }
        });
    }

    private static JSONObject jsonOf(String k, Object v) { try { return new JSONObject().put(k, v); } catch (Exception e) { return new JSONObject(); } }

    void openExternal(Uri u) {
        String sch = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
        if (!sch.equals("https") && !sch.equals("tel") && !sch.equals("mailto") && !sch.equals("whatsapp")) return;
        try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
    }

    /* ---------------- PDF paylaşma: sayfa base64 gönderir, dosya önbellekte oluşur, paylaş menüsü açılır ---------------- */
    private void shareFile(JSONObject m, JavaScriptReplyProxy proxy, int rid) {
        try {
            String name = m.optString("name", "belge.pdf").replaceAll("[^A-Za-z0-9ÇĞİÖŞÜçğıöşü ._-]", "-");
            String mime = "application/pdf".equals(m.optString("mime")) ? "application/pdf" : "image/jpeg";
            byte[] data = Base64.decode(m.optString("base64"), Base64.DEFAULT);
            if (data.length == 0 || data.length > 60_000_000) { reply(proxy, rid, "INVALID_FILE", null); return; }
            File dir = new File(getCacheDir(), "paylas"); dir.mkdirs();
            File[] old = dir.listFiles(); if (old != null) for (File f : old) if (System.currentTimeMillis() - f.lastModified() > 86_400_000L) f.delete();
            File f = new File(dir, name);
            try (FileOutputStream o = new FileOutputStream(f)) { o.write(data); }
            Uri u = FileProvider.getUriForFile(this, getPackageName() + ".dosyalar", f);
            Intent send = new Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, u).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            main.post(() -> { try { startActivity(Intent.createChooser(send, name)); } catch (Exception ignored) { } });
            reply(proxy, rid, null, jsonOf("ok", true));
        } catch (Exception e) { reply(proxy, rid, "SHARE_FAILED", null); }
    }

    /* ---------------- pusula algılayıcısı (metal ve akım bulucu) ---------------- */
    private boolean startMag() {
        if (magOn) return true;
        Sensor s = sensors == null ? null : sensors.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD);
        if (s == null) return false;
        magOn = sensors.registerListener(this, s, SensorManager.SENSOR_DELAY_FASTEST);
        if (magOn) main.postDelayed(magFlush, 60);
        return magOn;
    }

    private void stopMag() {
        if (!magOn) return;
        magOn = false; sensors.unregisterListener(this); main.removeCallbacks(magFlush);
        synchronized (magBuf) { magBuf.setLength(0); magCount = 0; }
    }

    @Override public void onSensorChanged(SensorEvent e) {
        if (e.sensor.getType() != Sensor.TYPE_MAGNETIC_FIELD) return;
        synchronized (magBuf) {
            if (magCount > 400) return;
            if (magBuf.length() > 0) magBuf.append(',');
            magBuf.append(String.format(Locale.ROOT, "%.2f,%.2f,%.2f", e.values[0], e.values[1], e.values[2]));
            magCount++;
        }
    }
    @Override public void onAccuracyChanged(Sensor sensor, int accuracy) { }

    private void flushMag() {
        if (!magOn) return;
        String data;
        synchronized (magBuf) { data = magBuf.toString(); magBuf.setLength(0); magCount = 0; }
        if (!data.isEmpty() && web != null) web.evaluateJavascript("window.__magOrnek&&window.__magOrnek([" + data + "])", null);
        main.postDelayed(magFlush, 60);
    }

    @Override protected void onPause() { stopMag(); super.onPause(); }

    @Override
    public void onBackPressed() {
        if (web != null) web.evaluateJavascript("window.__geri?window.__geri():false", v -> { if (!"true".equals(v)) MainActivity.super.onBackPressed(); });
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        stopMag();
        main.removeCallbacksAndMessages(null);
        if (web != null) web.destroy();
        billing.close();
        super.onDestroy();
    }
}
