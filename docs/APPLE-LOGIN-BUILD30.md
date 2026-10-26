# Electric Man — Apple giriş incelemesi, build 30

Ret: 24 Ekim 2026, 2.1(a), gönderim 517ba6cf-6593-435f-915f-3909ba9fe7df; iPad Air 11-inch (M3), iPadOS 27.0.

Dal `codex5-em-apple30-20261026`; mevcut native düzeltme dalı `fix-ipad-apple-login` (`a7608a2`) temel alındı. Bu taban henüz main'de değildir; ona ait kaynak/entitlement düzeltmeleri bu teslimin önkoşuludur.

## Hazırlanan akış

- WKWebView içinde Apple açılır penceresi yerine ASAuthorizationController; bundle ID `com.tusneldax.electricman`, `com.apple.developer.applesignin = Default` ve CODE_SIGN_ENTITLEMENTS bağlantısı mevcut native düzeltmeden korunur.
- Sunucudan alınan tek kullanımlık nonce, Apple isteği ve sunucu RS256/JWKS/issuer/audience/expiry/nonce doğrulamasını bağlar. Yeni state dönüş kontrolü, yalnız mevcut controller/attempt yanıtını kabul etme, foreground pencereyi koruma ve kapanışta iptal eklendi. Hatalı JWT başlık/claim nesneleri de kontrollü 401 alır.
- Native Apple akışı web Services ID'sini kullanmaz. Alternatif sistem tarayıcısı akışında web Services ID `com.tusneldax.electricman.web`, dönüş `https://electricman.tusneldax.com/api/em/auth/apple/callback`; cookie/state/PKCE ve one-time ticket doğrulamaları korunur. Apple Developer portalındaki kayıt ve App ID capability bu işte anahtar/sertifika erişimi olmadan doğrulanamadı.
- Misafir olarak oyna / Play as guest, hesap ekranında ve sunucu ayarı alınamayan durumda açık düğmedir. Kayıt/giriş yapmaz; varsa bekleyen native Apple girişini iptal eder. Yeni etiket 13 dilde bulunur.
- Pazarlama sürümü 1.0.0, build 30. Release'te simülatör fixture'ı ve otomasyon yoktur. Oyun motoru, lig, satın alma ve mevcut kayıt biçimleri değiştirilmez.

## Canlı sunucu önkoşulu

26 Ekim salt kimliksiz hazırlık kontrolü: `/api/em/config` 200 ve yukarıdaki web Services ID; `/api/em/native/apple/nonce` POST (boş gövde, oturum yok) **401 LOGIN_REQUIRED**. Nonce/oturum jetonu kaydedilmedi; hesap açılmadı. Canlı worker yeni native uçları sunmuyor. Dolayısıyla bu istemciyle gerçek Apple girişini açmak için sunucu yaması da ayrıca devreye alınmalıdır. Bu işte üretim worker'ı, D1 oyuncu kayıtları ve mağaza değiştirilmedi.

## Doğrulama ayrımı

- Yerel: 58 genel API kontrolü; 39 Apple/native API güvenlik kontrolü; 36 kaynak/gerçek guest JS branch kontrolü. Anahtarlar yalnız RAM'de oluşturulmuş sentetik test anahtarları, SQLite yalnız bellektedir.
- Bulut: yalnız `ipad_check=true`, `upload=false` seçeneği. `build` isimli eski imzalama/yükleme işi atlanır; yeni iş `contents: read`, sparse kaynak checkout, imzasız simülatör ve imzasız Release archive içindir. Anahtar/sertifika/önceki cert branch'ini açmaz, ASC API kullanmaz, upload/export yapmaz.
- iPad ekranları ve native çağrı UI testi offline nonce/config fixture'ı kullanır. Bu **gerçek Apple hesabıyla tamamlanmış oturum açma değildir**. Güncel kurulu runtime ve seçilen iPad modelini CI selection.json kaydeder; iPadOS 27.0 olduğu varsayılmaz.
- Görüntüler incelenmeden Apple sheet'in görünürlüğü veya tüm girişin başarılı olduğu söylenmez. İmzasız cihaz arşivi ayrıca sahip kontrollü imzalama gerektirir; mağazaya yüklenebilir IPA diye sunulmaz.

## Sonuç ve teslim

**Apple giriş ret maddesi henüz kapanmadı; mağaza kabulü verilmedi.**

- `40291450525`: iPad Air 11-inch (M3), iPadOS 26.2 / Xcode 26.3. Sekiz UI/hamle kontrolü geçti; misafir 0→5 hamle yaptı. Native ASAuthorization isteği foreground pencereden çalıştı, ancak **1000** hatası aldı. Gerçek Apple hesabıyla başarılı giriş doğrulanmadı. Bu koşu UI'den sonraki arşiv adımında süreye takıldı.
- İlk `40290139590` otomatik sonucu görsel kabul sayılmaz: ilk görüntü boş, karakter seçimi paneli açık kaldı. İkinci koşunun İngilizce giriş ve misafir kareleri görsel olarak incelendi. `sheet-tr.png` de kayıtlı dil önceliği nedeniyle İngilizce çıktı; Türkçe kanıt diye sunulmaz.
- `40294040637`: **ARCHIVE SUCCEEDED**, 1.0.0 (30) imzasız fiziksel iOS Release arşivi; source commit `6c98fc5`. ZIP 10.322.432 byte; SHA-256 `b06d4f8b6b9f8af47019a85591651908a6062aae233fcb547b5a1154391dd921`.
- API kimliği 7368ZSQD95 ile yalnız okuma denemeleri `40294389042` / `40294716880`: takım ve bireysel JWT biçimleri **401**. Bu kimlik doğrulaması başarısız olduğundan App ID yetkisi sorgulanamadı. Hiçbir yetki/sertifika kaydı değiştirilmedi; mevcut CI secret yalnız RAM'de kullanıldı, anahtar dosyası açılmadı/yazılmadı.
- Yerel arşiv: `outputs/electric-man-ipad30/run-40294040637/ElectricMan-build30-unsigned-archive.zip`; simülatör uygulaması ve geçerli İngilizce ekranlar `run-40291450525/` altında. Bu yollar bu sohbetin çalışma kökündeki `outputs` dizinine göredir. CI artifact'ları üç gün saklanır; yerel kopyalar kalır.
- Dağıtım için native sunucu uçları, Apple App ID capability/provisioning ve geçerli CI kimliği birlikte doğrulanmalı; imzalı gerçek cihaz/Apple hesabı testi yapılmalı. Sonradan imzalama gerekir. Mağazaya yüklenebilir imzalı IPA üretilmiş gibi sunulmaz.

## Bütçe ve durma noktası

Bu işe özel üst bütçe 5 USD. Standart macOS runner yayımlanan tarifesi 0.062 USD/dakika; son workflow iş süresi 13 dakika, çalışma adımı 10 dakika ve artifact adımı 2 dakika ile sınırlı. Koşu sürelerinden toplam brüt tarife tahmini ve depolama ayrı raporlanır; hesap faturası/kalan dahil dakika teyidi diye sunulmaz. Artifact saklama üç gün. Mağaza/TestFlight/inceleme adımı yok; sonuç raporuyla durulur.

Kaynaklar:
- https://developer.apple.com/documentation/authenticationservices/asauthorizationcontroller
- https://developer.apple.com/documentation/signinwithapple/configuring-your-environment-for-sign-in-with-apple
- https://docs.github.com/en/billing/reference/actions-runner-pricing


Üç macOS koşusu (yuvarlanmış 8 + 19 + 3 dakika) ve iki kısa Linux koşusu toplamı yayımlanan tarifeyle **1.872 USD brüt runner tahmini**. İkinci koşunun timeout sonrası artifact süresi de bu hesaba dahil edildi. GitHub timing API billable alanları sıfır döndü; bu fatura teyidi sayılmadı. Depolama ücretinin hesap faturası doğrulanmadı; üç günlük küçük artifact'lar için 0.05 USD bütçe rezervi bırakıldı. 5 USD bütçenin altında kalındı; tüm koşular durdu. Ayrıntı: `APPLE-LOGIN-CLOUD-COST30.json`.
