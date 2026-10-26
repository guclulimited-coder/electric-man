# Electric Man — build 30 teslimi

Electric Man 1.0 / build 30 yeniden imzalandı, App Store Connect'e yüklendi ve incelemeye yeniden gönderildi. API geri okumasında hem sürüm hem gönderim **WAITING_FOR_REVIEW**. Apple onayı henüz verilmiş değildir.

## 20:40 onayı ve sertifika sınırı

- Önce diğer hatlar kontrol edildi. Usta Şehri/MASTERCITY ve Bus Rush'ın APPLE_SIGNING_BUNDLE kimliği `8MN67BCJ83`; kullanılan profiller de aynı sertifikaya bağlı. Ayrı denetim dallarında yalnız kimlik seri numaraları karşılaştırıldı; ana dallar, uygulama kodları ve sırları değiştirilmedi.
- Usta denetimleri: 40372030152, 40372376061; Bus Rush/MASTERCITY sırrı: 40372046676. MASTERCITY kaynak paketindeki profil yalnız byte-range ile okunup sertifika metadatası kontrol edildi. Bus Rush profilleri 4FDQHXXN8T ve VJMK2JDCX8, yenileme işinde tekrar kontrol edildi.
- Bütün kullanım kapıları geçtikten sonra yalnız onaylı eski Electric Man sertifikası `3S37L2JAP7` iptal edildi. Yeni kimlik `KZ6622463A`, yalnız Electric Man profili `B63L63L3KP`.
- Hunter kayıt dalı ve aktif sertifikası `H3TYN7QW8J` yeniden okunup korundu. Başka sertifika iptali yok.
- Yeni imzalama paketi, RAM'de GitHub'ın genel anahtarıyla mühürlendi; yalnız şifreli yük yerel araca aktarıldı ve `EM_IOS_SIGNING_BUNDLE` Actions sırrına kaydedildi. Düz metin anahtar/şifre/PKCS12 artifact'ı yok; sır içeriği yazdırılmadı. İmzalama aracı yalnız korumalı geçici CI kimliğini kullandı.

## İmzalama, yükleme ve yeniden inceleme

- Arşiv kaynak kodu yeniden derlenmedi: mevcut Release cihaz arşivi kullanıldı, build 30 ve bundle ID `com.tusneldax.electricman` doğrulandı. Oyun/kayıt motoru değişmedi.
- İki kitaplık ve ana uygulama yeni Electric Man kimliğiyle imzalandı. Apple zinciri + Distribution işareti + takım + paket kimliği gereksinimleri, imza ve Apple giriş entitlement `Default` doğrulandı. Eski cloud imza yoluna bağlı kalınmadı.
- Yükleme ve gönderim koşusu: https://github.com/guclulimited-coder/electric-man/actions/runs/40373970488
- IPA: bu sohbetin `outputs/electric-man-ipad30/run-40373970488/ElectricMan-build30.ipa`, 9.450.569 byte; SHA256 `72078f86e05b6419a1344db3e3a9ddd796956b7b0626a4401c7bbe07d6dc27f6`.
- Apple build kaydı `c6af3180-6daa-45f7-ab09-a4d2d125a6b3`, işleme sonucu VALID. Electric Man 1.0 sürümü `aef8e18c-40c2-41d1-bc06-272b59c8d73d` ile ilişkilendirildi.
- iPad Apple giriş düzeltmesi ve görünür misafir seçeneği inceleme notuna eklendi; önceki notlar/inceleme hesap bilgileri korundu.
- Önceki gönderim `517ba6cf-6593-435f-915f-3909ba9fe7df` düzeltildi ve yeniden gönderildi: WAITING_FOR_REVIEW.

## Canlı sunucu ve kabul sınırı

18:09 onayıyla yayımlanan Electric Man Apple API yaması canlıdadır. Geri dönüş noktası `b21765f6` / `5eb9883`, geçerli dağıtım `c64455cd`; sadece Electric Man alan adındaki dört Apple giriş uç noktası yamaya gider. Diğer host/endpoint'ler orijinal Worker'ı kullanır. Canlı web yönlendirmesi 302, native nonce 200; geçersiz token ve callback reddi testleri geçti. Mevcut oyuncu hesabı veya kayıt işlemi yapılmadı. Diğer uygulamaların oyun dosyaları ve Hunter ana sayfa özetleri korundu.

Yerel kontroller: 58 genel API, 45 Apple güvenlik, 36 native/guest kontrolü; 2 gönderim kapsamı fixture testi. İzole test sunucusunda 20 senaryo. Önceki iPad Air M3/26.2 simülatöründe misafir 0→5 hamle yaptı; Apple hesabı olmayan simülatör 1000 verdi. Gerçek Apple hesabıyla fiziksel iPad giriş kabulü bağımsız doğrulanmadı; Apple incelemesi bekleniyor.

İlk iki export ve önceki yükleme denemeleri Invalid Signature nedeniyle kabul edilmedi; dosyalar silinmedi ve DO-NOT-UPLOAD notuyla işaretlendi. Geçerli teslim yukarıdaki yeni IPA'dır. Geçmiş ve güncel kanıtlar JSON kayıtlarında ayrıdır.

Toplam brüt runner fiyat tahmini: **2.564 USD / 5 USD**. Fatura ve depolama bedeli doğrulanmadı; tüm görev koşuları tamamlandı. Ayrıntı: APPLE-LOGIN-CLOUD-2.56430.json, CERTIFICATE30-RESULT.json ve APPLE-PRODUCTION30.json.
