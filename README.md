# Electric Man

TusneldaX'in 3D kablo döndürme bulmacası. Web: **https://electricman.tusneldax.com**

Hesaplar Bus Rush'tan tamamen ayrıdır (ayrı veritabanı tabloları, ayrı oturum çerezleri).

## Yapı

| Yol | Ne |
|---|---|
| `src/engine.mjs` | Bulmaca motoru (300 bölüm, zorluk eğrisi, sunucu doğrulaması). Oyun ve sunucu aynı dosyayı kullanır. |
| `src/api.mjs` | Sunucu: giriş (Google, e-posta kodu), bulut kayıt, haftalık lig, arkadaşlar, hesap silme. |
| `public/` | Yayınlanan site. `index.html` oyun, `_worker.js` ve `engine.js` derleme çıktısıdır. |
| `schema.sql` | D1 veritabanı şeması (bir kez çalıştırılır). |
| `tests/api.test.mjs` | Gerçek SQLite üzerinde uçtan uca API testi. |

`public/_worker.js` ve `public/engine.js` elle düzenlenmez: `src/` değişince `npm run build` çalıştırılır.

## Komutlar

```
npm run build   # src → public/_worker.js, public/engine.js
npm test        # derle + 23 API kontrolü
```

## Cloudflare Pages kurulumu (bir kez)

1. **D1:** Workers & Pages → D1 → Create database → ad: `electric-man`. Console sekmesinde `schema.sql` içeriğini çalıştır.
2. **Pages:** Workers & Pages → Create → Pages → Connect to Git → bu depo.
   - Framework: None · Build command: boş · Build output directory: `public`
3. **Bağlama:** Pages projesi → Settings → Bindings → D1 database → değişken adı `DB` → `electric-man`.
4. **Ortam değişkenleri** (Settings → Variables and Secrets):
   - `EM_GOOGLE_CLIENT_ID` — Google OAuth web istemci kimliği (yetkili kaynak: https://electricman.tusneldax.com)
   - `EM_EMAIL_ENABLED` = `true`, `EM_EMAIL_FROM` = `Electric Man <giris@mail.tusneldax.com>`
   - `EM_RESEND_API_KEY` (gizli), `EM_EMAIL_OTP_SECRET` (gizli, en az 32 rastgele karakter)
5. **Alan adı:** Pages projesi → Custom domains → `electricman.tusneldax.com`. Porkbun'da: CNAME `electricman` → `<proje>.pages.dev`.

Değişken eklenmeden de oyun çalışır; giriş seçenekleri yalnızca yapılandırılınca görünür.
