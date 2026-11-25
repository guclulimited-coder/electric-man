// Elektrikçi Cebi — hesaplama motoru (25 Kasım 2026).
// Kaynaklar: TS HD 60364-5-52 (IEC 60364-5-52) Tablo B.52.4 (bakır, PVC yalıtım, 30 °C ortam),
// B.52.14 sıcaklık ve B.52.17 gruplama düzeltmeleri; Elektrik İç Tesisleri Yönetmeliği gerilim düşümü sınırları.
// Bütün fonksiyonlar saf: girdi alır, sonuç nesnesi döndürür; arayüz ve testler aynı kodu kullanır.

export const KESITLER = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120];
export const SIGORTALAR = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160];

// Taşıma kapasitesi (A): döşeme yöntemi -> yüklü iletken sayısı (2: monofaze, 3: trifaze)
export const KAPASITE = {
  // B2: duvar üstünde veya içinde boru/kanal içinde çok damarlı kablo (antigron, NYM boruda)
  B2: {2: [16.5, 23, 30, 38, 52, 69, 90, 111, 133, 168, 201, 232], 3: [15, 20, 27, 34, 46, 62, 80, 99, 118, 149, 179, 206]},
  // C: duvara doğrudan kelepçeli kablo (NYY, NYM açıkta)
  C: {2: [19.5, 27, 36, 46, 63, 85, 112, 138, 168, 213, 258, 299], 3: [17.5, 24, 32, 41, 57, 76, 96, 119, 144, 184, 223, 259]}
};
export const YONTEM_ADI = {B2: 'Boru veya kanal içinde', C: 'Duvara kelepçeli, açıkta'};

// PVC yalıtım ortam sıcaklığı düzeltmesi (30 °C = 1)
const SICAKLIK = {10: 1.22, 15: 1.17, 20: 1.12, 25: 1.06, 30: 1, 35: 0.94, 40: 0.87, 45: 0.79, 50: 0.71};
// Bir arada döşenmiş devre sayısı düzeltmesi
const GRUP = {1: 1, 2: 0.8, 3: 0.7, 4: 0.65, 5: 0.6, 6: 0.57, 7: 0.54, 8: 0.52, 9: 0.5, 12: 0.45, 16: 0.41, 20: 0.38};
const yakin = (tablo, x) => { const k = Object.keys(tablo).map(Number).sort((a, b) => a - b); let s = k[0]; for (const v of k) if (v <= x) s = v; return tablo[s]; };
export const sicaklikKatsayisi = t => yakin(SICAKLIK, Math.max(10, Math.min(50, Math.ceil(t / 5) * 5)));
export const grupKatsayisi = n => { const k = Object.keys(GRUP).map(Number).sort((a, b) => a - b); for (const v of k) if (n <= v) return GRUP[v]; return GRUP[20]; };

export const ILETKENLIK = {Cu: 56, Al: 35}; // m / (Ω·mm²)
export const GERILIM = {mono: 230, tri: 400};
const r = (x, n = 2) => Math.round(x * 10 ** n) / 10 ** n;

// Akım (A): P watt, faz 'mono' | 'tri'
export function akim({P, faz = 'mono', cos = 1, U}){
  U = U || GERILIM[faz];
  const I = faz === 'tri' ? P / (Math.sqrt(3) * U * cos) : P / (U * cos);
  return {I: r(I), U};
}

// Gerilim düşümü (%): P watt, L metre (tek yön), S mm²
export function gerilimDusumu({P, L, S, faz = 'mono', malzeme = 'Cu', U}){
  U = U || GERILIM[faz]; const k = ILETKENLIK[malzeme];
  const yuzde = faz === 'tri' ? (100 * P * L) / (k * S * U * U) : (200 * P * L) / (k * S * U * U);
  return {yuzde: r(yuzde, 2), volt: r(U * yuzde / 100, 2), U};
}

// Sınır: aydınlatma %1,5; priz ve kuvvet %3 (sayaçtan son noktaya)
export const DUSUM_SINIRI = {aydinlatma: 1.5, kuvvet: 3};

// Kablo kesiti ve sigorta seçimi: Ib <= In <= Iz koşulu + gerilim düşümü
export function kesitSec({P, L, faz = 'mono', cos = 1, yontem = 'B2', sicaklik = 30, devre = 1, devreTuru = 'kuvvet', malzeme = 'Cu'}){
  const {I: Ib} = akim({P, faz, cos});
  const kat = sicaklikKatsayisi(sicaklik) * grupKatsayisi(devre);
  const tablo = KAPASITE[yontem][faz === 'tri' ? 3 : 2];
  const sinir = DUSUM_SINIRI[devreTuru];
  const In = SIGORTALAR.find(x => x >= Ib);
  for (let i = 0; i < KESITLER.length; i++){
    const S = KESITLER[i], Iz = r(tablo[i] * kat, 1);
    if (In === undefined || In > Iz) continue;
    // kalıcı çarpılan kablolar: aydınlatmada en az 1,5, priz ve kuvvette en az 2,5 mm²
    if (devreTuru === 'kuvvet' && S < 2.5) continue;
    const d = gerilimDusumu({P, L, S, faz, malzeme});
    if (d.yuzde > sinir) continue;
    return {ok: true, Ib, In, S, Iz, dusum: d.yuzde, sinir, kat: r(kat, 2)};
  }
  return {ok: false, Ib, In, sinir, kat: r(kat, 2)};
}

// Kompanzasyon: P kW, mevcut ve hedef güç katsayısı -> gereken kondansatör gücü (kVAr)
export function kompanzasyon({P, cos1, cos2 = 0.98}){
  const tan = c => Math.tan(Math.acos(c));
  const Q = P * (tan(cos1) - tan(cos2));
  return {Q: r(Math.max(0, Q), 2), tan1: r(tan(cos1), 3), tan2: r(tan(cos2), 3), reaktifOran: r(tan(cos1) * 100, 1)};
}

// Topraklama: tek çubuk elektrot direnci (Ω) — R = ρ / (2πL) · ln(4L / d)
export const TOPRAK = {'Bataklık': 30, 'Killi, nemli toprak': 100, 'Tarla toprağı': 200, 'Kumlu, nemli': 500, 'Kumlu, kuru': 1000, 'Taşlı, çakıllı': 2000};
export function topraklama({rho, L = 1.5, d = 0.02, adet = 1}){
  const R1 = rho / (2 * Math.PI * L) * Math.log(4 * L / d);
  // aralarında en az çubuk boyu kadar mesafe olan paralel çubuklar için yaklaşık %20 karşılıklı etki payı
  const R = adet > 1 ? R1 / adet * 1.2 : R1;
  return {R1: r(R1, 1), R: r(R, 1)};
}
// TT sisteminde kaçak akım rölesi koşulu: Ra · IΔn ≤ 50 V
export function kacakAkimSiniri(mA){ return r(50 / (mA / 1000), 0); }

// Ohm kanunu: iki değer verilince diğerleri (U volt, I amper, R ohm, P watt)
export function ohm({U, I, R, P}){
  const v = x => x !== undefined && x !== null && x !== '' && !isNaN(x);
  if (v(U) && v(I)) return {U, I, R: r(U / I, 3), P: r(U * I, 2)};
  if (v(U) && v(R)) return {U, R, I: r(U / R, 3), P: r(U * U / R, 2)};
  if (v(I) && v(R)) return {I, R, U: r(I * R, 2), P: r(I * I * R, 2)};
  if (v(P) && v(U)) return {P, U, I: r(P / U, 3), R: r(U * U / P, 3)};
  if (v(P) && v(I)) return {P, I, U: r(P / I, 2), R: r(P / (I * I), 3)};
  if (v(P) && v(R)) return {P, R, U: r(Math.sqrt(P * R), 2), I: r(Math.sqrt(P / R), 3)};
  return null;
}

// Teklif toplamı: kalemler [{ad, miktar, birim, fiyat}], iskonto %, KDV %
export function teklifToplam(kalemler, {iskonto = 0, kdv = 20} = {}){
  const ara = kalemler.reduce((t, k) => t + (Number(k.miktar) || 0) * (Number(k.fiyat) || 0), 0);
  const isk = ara * iskonto / 100, matrah = ara - isk, vergi = matrah * kdv / 100;
  return {ara: r(ara), iskonto: r(isk), matrah: r(matrah), kdv: r(vergi), toplam: r(matrah + vergi)};
}
