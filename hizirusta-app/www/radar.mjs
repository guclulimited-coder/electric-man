// HızırUsta — metal ve akım bulucu çözümleyicisi (25 Kasım 2026).
// Telefonun pusula algılayıcısından (manyetometre, mikrotesla) gelen örnekleri işler.
// Güvenlik aracı DEĞİLDİR: gerilim ölçmez; yalnız manyetik alan değişimini sezer.
//  - metal: sabit alanın ayardaki değerden sapması (demir, çivi, çelik, kablo kanalı)
//  - akım: hızlı dalgalanma (yük altındaki kablonun 50 Hz alanı; algılayıcı hızı yetmezse zayıf görünür)

export class Radar {
  constructor({pencere = 64} = {}){ this.pencere = pencere; this.ornek = []; this.taban = null; this.tabanSayi = 0; }
  // Ayar: telefon duvardan uzakta tutulurken ortam alanını öğren
  ayarla(){ this.taban = null; this.tabanSayi = 0; this.ornek = []; }
  ekle(x, y, z){
    const m = Math.hypot(x, y, z); if (!isFinite(m)) return this.durum();
    if (this.tabanSayi < 30){ this.taban = this.taban === null ? m : this.taban + (m - this.taban) / (this.tabanSayi + 1); this.tabanSayi++; }
    this.ornek.push(m); if (this.ornek.length > this.pencere) this.ornek.shift();
    return this.durum();
  }
  durum(){
    const n = this.ornek.length; if (n < 8 || this.taban === null) return {hazir: false, metal: 0, akim: 0, guc: 0, alan: n ? this.ornek[n - 1] : 0};
    const ort = this.ornek.reduce((t, v) => t + v, 0) / n;
    // yüksek geçiren: ardışık farkların ortalama karekökü (yavaş el hareketini büyük ölçüde eler)
    let f = 0; for (let i = 1; i < n; i++) f += (this.ornek[i] - this.ornek[i - 1]) ** 2;
    const dalga = Math.sqrt(f / (n - 1));
    // ölçek: 15 µT sapma = tam metal; 1,5 µT dalgalanma = tam akım (deneyle ayarlanacak)
    const metal = Math.min(1, Math.abs(ort - this.taban) / 15), akim = Math.min(1, Math.max(0, dalga - 0.15) / 1.5);
    return {hazir: true, metal: +metal.toFixed(3), akim: +akim.toFixed(3), guc: +Math.max(metal, akim).toFixed(3), alan: +ort.toFixed(1), taban: +this.taban.toFixed(1)};
  }
}
// Güce göre bip aralığı (ms): güç arttıkça sıklaşır; 0,08 altında sessiz
export const bipAraligi = g => g < 0.08 ? 0 : Math.round(900 - 820 * Math.min(1, g));
