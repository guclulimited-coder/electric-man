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


## Apple web login (7 October 2026)

`EM_APPLE_SERVICE_ID=com.tusneldax.electricman.web` enables Apple alongside the existing Google/email methods for Electric Man, Hunter and the native browser login page. Registered callbacks:
- https://electricman.tusneldax.com/api/em/auth/apple/callback
- https://portal.tusneldax.com/api/em/auth/apple/callback

The server validates Apple's RS256 signature, issuer, audience, nonce and time bounds. Short-lived browser-bound state is consumed once. Cancellation, invalid tokens and replays grant no session. The Apple flow cookie uses Secure/HttpOnly/SameSite=None for Apple's cross-site form POST; ordinary sessions remain SameSite=Lax. Existing identities and saves are not migrated or merged by email. Existing players must use their original provider to keep their original account; Apple creates a separate identity unless a future verified account-linking feature is implemented.

Run `npm test`: existing API checks plus `tests/apple-login.test.mjs`. Tests use generated test signing keys and in-memory SQLite, never production player records. TikTok remains disabled until its existing Login Kit configuration is explicitly completed; do not substitute Bus Rush's sandbox credentials into production.

Usta Şehri already exposes Google and its TUSNELDAX broker path for Apple/email at https://oyun.tusneldax.com/hesap. This change does not modify its source or database.
