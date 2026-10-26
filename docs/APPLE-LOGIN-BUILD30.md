# Electric Man — Apple giriş incelemesi, build 30

Ret: 24 Ekim 2026, 2.1(a), gönderim 517ba6cf-6593-435f-915f-3909ba9fe7df; iPad Air 11-inch (M3), iPadOS 27.0.

Dal `codex5-em-apple30-20261026`; mevcut native düzeltme dalı `fix-ipad-apple-login` (`a7608a2`) temel alındı. Bu taban henüz main'de değildir; ona ait kaynak/entitlement düzeltmeleri bu teslimin önkoşuludur.

## 26 Ekim güncellemesi — test sunucusu

**Sunucu yaması canlıya hazır; yayın yapılmadı.** Test: https://em-apple30-test-20261026.guclu-limited.workers.dev

- Electric Man için tam eşleşmeyle `com.tusneldax.electricman` ve `com.tusneldax.electricman.web` kabul edilir. Hunter audience ayrımı korunur. Issuer, Apple JWKS/RS256, süre, nonce/state ve tek kullanım kontrolleri kaldırılmaz.
- Canlıdaki nonce isteği jeton gönderilmeden 401 dönüyordu: audience kontrolünden önce eksik native route sürümü sorunu vardır. Ek olarak Cloudflare gerçek isteğinde `redirect:error` TypeError/503 ürettiği kanıtlandı; JWKS isteği `manual` yapıldı, yönlendirme 3xx yanıtı reddedilir.
- 139 yerel kontrol (58 genel + 45 Apple + 36 native/guest) ve test ortamında 20 kontrol geçti. Test ortamının normal API yolu gerçek Apple JWKS'ini kullanır (200, 3 anahtar); sentetik anahtarı reddeder. Ayrı `/__oracle` yalnız test Worker'ında bağımlılık enjeksiyonuyla iki audience başarı/replay/imza/nonce/issuer/süre testini çalıştırır, oturum jetonunu dışarı vermez. Bu, gerçek Apple hesabıyla giriş kanıtı değildir.
- Ayrı D1: `em-apple30-test-20261026` / `a4f8f4d2-1475-4599-8df8-b9bbfabcf160`. Üretim D1 kullanılmadı. Test callback adresi Apple'a kaydedilmedi; gerçek web OAuth kabulü iddia edilmez. Üretimin mevcut Services ID/callback ayarı değiştirilmedi.
- App ID `DQQ5B4RP2Z`, platform UNIVERSAL. Apple giriş capability'si başlangıçta yoktu; istenen giriş düzeltmesi kapsamında API 201 ile APPLE_ID_AUTH etkinleştirildi ve tekrar okunarak doğrulandı. Mevcut CI anahtarı AMWHRWY3U4 çalışıyor; 7368ZSQD95 kimliğiyle JWT denemeleri 401 veriyor. Hiçbir anahtar içeriği görüntülenmedi.
- API kanıtı: Actions 40326625631; test Worker sürümü `39959972-5019-40e3-99fc-125f048dd5cb`. Üretim yayını, TestFlight ve mağaza yüklemesi yok.

### İmzalı build 30 teslimi

Actions `40327446648` / kaynak `9e1a851`: mevcut arşiv yeniden derlenmeden imzalandı. Xcode EXPORT SUCCEEDED, `codesign --verify --deep --strict` geçti; son IPA'da Apple entitlement `Default`, doğru application identifier ve debugger kapalı durumu doğrulandı. Windows'a indirilen dosyada SHA256 ve Mach-O entitlement bağımsız tekrar kontrol edildi.

- IPA: `outputs/electric-man-ipad30/run-40327446648/ElectricMan.ipa`, 9.460.853 byte.
- SHA256: `a55dd751618613ec6a0d49ffc20c9b9e9fd856027d99e0c31817bc27e938f3d9`.
- İlk export `40327048970` Apple entitlement taşımadığı için kabul edilmedi; dosyaları silinmedi, DO-NOT-UPLOAD notuyla işaretlendi. Son export arşive istenen entitlement'ı ad-hoc aşamada ekler, ardından dağıtım imzası ve entitlement'ı zorunlu doğrular.
- Mevcut CI sırrı yalnız Xcode'a korumalı geçici dosya olarak verildi; içeriği okunup gösterilmedi ve artifact'a alınmadı. API anahtarı/sertifika içeriği incelenmedi. Aktif 3+3 dağıtım sertifikası iptal edilmedi; otomatik Xcode dışa aktarımı kullanıldı. Üretim/mağaza/TestFlight yüklemesi yapılmadı.
- Tüm işin brüt runner fiyat tahmini **2,02 USD / 5 USD**; fatura doğrulanmadı, kısa süreli artifact depolama ayrıca doğrulanmadı. Gerçek Apple hesabıyla oturum ve iPadOS 27 kabulü henüz yoktur; önceki iPad M3/26.2 misafir UI kanıtı geçerlidir.

### Canlıya alma sınırı

Onay sonrası yalnız sunucu değişikliği, native route önkoşulunu içeren bu dal üzerinden mevcut üretim dağıtımına uygulanmalı. Sparse `public/` dizinini tam site diye yayımlamayın: mevcut site varlıklarını düşürebilir. `tests/apple-staging/` giriş noktası, test D1 ve `/__oracle` üretime kesinlikle taşınmamalı. Mevcut üretim ortam değişkenleri/D1 bağları korunmalı. Bu iş canlıyı yayımlamaz.

## İstemci ve kabul sınırı

İstemci tabanı `fix-ipad-apple-login` (`a7608a2`); native ASAuthorizationController, foreground pencere, state/nonce, tek istek ömrü ve görünür misafir düğmesi korunur. Oyun motoru/kayıt biçimi değiştirilmedi. Önceki iPad Air M3 / iPadOS 26.2 koşusunda misafir 0→5 hamle yaptı; Apple hesabı olmayan simülatör error 1000 verdi. Gerçek Apple hesabı ve iPadOS 27.0 kabulü henüz doğrulanmadı. İmzalı IPA'nın hazırlanması bu kabulün yerine geçmez.

Yerel kanıtlar bu sohbetin `outputs/electric-man-ipad30/` klasöründe: geçerli UI `run-40291450525`, imzasız kaynak arşivi `run-40294040637`, capability `run-40326625631`, son imzalı IPA `run-40327446648`. İlk imzasız arşivin SHA256 değeri ve geçmiş koşular JSON teslim kayıtlarında korunur. GitHub artifact saklama süresi üç gündür.

Kaynak doğrulama kuralları: https://developer.apple.com/documentation/signinwithapple/verifying-a-user

