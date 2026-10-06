# Electric Man — reklam materyalleri

- `electricman-playable.html` — oynanabilir reklam (tek dosya, ~230 KB, internet gerektirmez).
  Kullanıcı 4 evi aydınlatınca (ya da 30 sn sonra) mağaza kartı açılır; dokununca cihazına göre
  Google Play / App Store'a gider (MRAID `mraid.open` ve Google Ads `ExitApi` desteklenir).
  AppLovin, Unity Ads, Mintegral, ironSource, Meta gibi ağlar tek HTML dosyasını doğrudan kabul eder.
  Google Ads (App kampanyası, HTML5) için dosyayı `index.html` adıyla bir .zip içine koyup yükleyin.
- `electricman-promo-tr.mp4`, `electricman-promo-en.mp4` — 1080x1920 dikey tanıtım videosu
  (gerçek oyun görüntüsü). YouTube'a "liste dışı" yükleyip Play Console > Mağaza girişi > Video
  alanına bağlantısını ekleyebilir, Google Ads App kampanyalarında kullanabilirsiniz.
- Kaynak: `playable.src.html` → `node scripts/build-playable.mjs`
