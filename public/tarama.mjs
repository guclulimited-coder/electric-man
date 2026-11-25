// Takım Çantası — belge tarama yardımcıları (25 Kasım 2026). Dış kütüphane yok: telefonda internetsiz çalışır.
// kenarBul: fotoğrafta kâğıdın dört köşesini tahmin eder; duzelt: dört köşeyi dikdörtgen sayfaya açar;
// filtre: renkli / gri / siyah-beyaz; pdfYap: JPEG sayfalardan PDF dosyası üretir.

// 4 nokta eşlemesinden 3x3 dönüşüm matrisi (hedef -> kaynak). src, dst: [[x,y] x4]
export function homografi(dst, src){
  const A = [], b = [];
  for (let i = 0; i < 4; i++){
    const [x, y] = dst[i], [u, v] = src[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  // Gauss eleme
  const n = 8;
  for (let c = 0; c < n; c++){
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    for (let r = 0; r < n; r++){ if (r === c) continue; const f = A[r][c] / A[c][c]; for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
  }
  const h = b.map((x, i) => x / A[i][i]);
  return [...h, 1];
}
export function uygula(H, x, y){ const w = H[6] * x + H[7] * y + H[8]; return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w]; }

// Köşeleri sırala: sol üst, sağ üst, sağ alt, sol alt
export function sirala(p){
  const t = p.map(([x, y]) => ({x, y, s: x + y, d: x - y}));
  const su = t.reduce((a, b) => b.s < a.s ? b : a), sa = t.reduce((a, b) => b.s > a.s ? b : a);
  const ru = t.reduce((a, b) => b.d > a.d ? b : a), la = t.reduce((a, b) => b.d < a.d ? b : a);
  return [[su.x, su.y], [ru.x, ru.y], [sa.x, sa.y], [la.x, la.y]];
}

// gri: Uint8 parlaklık dizisi (w*h). Kâğıt arka plandan açık renklidir varsayımıyla en büyük açık bölgeyi bulur.
export function kenarBul(gri, w, h){
  const hist = new Array(256).fill(0); for (const v of gri) hist[v]++;
  // Otsu eşiği
  let top = 0; for (let i = 0; i < 256; i++) top += i * hist[i];
  let wB = 0, sB = 0, en = 0, esik = 128;
  for (let i = 0; i < 256; i++){ wB += hist[i]; if (!wB) continue; const wF = gri.length - wB; if (!wF) break; sB += i * hist[i];
    const mB = sB / wB, mF = (top - sB) / wF, ara = wB * wF * (mB - mF) ** 2; if (ara > en){ en = ara; esik = i; } }
  // en büyük açık bağlı bölge
  const etiket = new Int32Array(w * h).fill(-1); let enBuyuk = null, enBoy = 0; const yigin = [];
  for (let s = 0; s < w * h; s++){
    if (etiket[s] !== -1 || gri[s] <= esik) continue;
    const noktalar = []; etiket[s] = s; yigin.push(s);
    while (yigin.length){ const q = yigin.pop(); noktalar.push(q); const x = q % w, y = (q / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){ const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const n = ny * w + nx; if (etiket[n] === -1 && gri[n] > esik){ etiket[n] = s; yigin.push(n); } } }
    if (noktalar.length > enBoy){ enBoy = noktalar.length; enBuyuk = noktalar; }
  }
  const kenarPay = Math.round(Math.min(w, h) * 0.05);
  const varsayilan = [[kenarPay, kenarPay], [w - kenarPay, kenarPay], [w - kenarPay, h - kenarPay], [kenarPay, h - kenarPay]];
  // bölge çok küçük veya bütün kareyi kaplıyorsa güvenilmez
  if (!enBuyuk || enBoy < w * h * 0.12 || enBoy > w * h * 0.97) return {koseler: varsayilan, bulundu: false};
  let su, ru, sa, la; let a = Infinity, b = -Infinity, c = -Infinity, d = Infinity;
  for (const q of enBuyuk){ const x = q % w, y = (q / w) | 0, s = x + y, f = x - y;
    if (s < a){ a = s; su = [x, y]; } if (s > b){ b = s; sa = [x, y]; } if (f > c){ c = f; ru = [x, y]; } if (f < d){ d = f; la = [x, y]; } }
  return {koseler: [su, ru, sa, la], bulundu: true};
}

// Kaynak RGBA görüntüden dört köşeyi W x H sayfaya aç (çift doğrusal örnekleme)
export function duzelt(kaynak, sw, sh, koseler, W, Hh){
  const H = homografi([[0, 0], [W, 0], [W, Hh], [0, Hh]], koseler);
  const out = new Uint8ClampedArray(W * Hh * 4);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++){
    let [u, v] = uygula(H, x + .5, y + .5); u -= .5; v -= .5;
    const x0 = Math.max(0, Math.min(sw - 2, Math.floor(u))), y0 = Math.max(0, Math.min(sh - 2, Math.floor(v)));
    const fx = Math.max(0, Math.min(1, u - x0)), fy = Math.max(0, Math.min(1, v - y0)), o = (y * W + x) * 4;
    const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
    for (let k = 0; k < 3; k++) out[o + k] = (kaynak[i00 + k] * (1 - fx) + kaynak[i10 + k] * fx) * (1 - fy) + (kaynak[i01 + k] * (1 - fx) + kaynak[i11 + k] * fx) * fy;
    out[o + 3] = 255;
  }
  return out;
}

// Filtre: 'renk' | 'gri' | 'sb' (siyah-beyaz: yerel ortalamaya göre eşik, gölgeleri temizler)
export function filtre(px, W, H, tur){
  if (tur === 'renk') return px;
  const g = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) g[i] = .299 * px[i * 4] + .587 * px[i * 4 + 1] + .114 * px[i * 4 + 2];
  if (tur === 'gri'){ for (let i = 0; i < W * H; i++){ const v = Math.min(255, Math.max(0, (g[i] - 20) * 1.15)); px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v; } return px; }
  const I = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++){ let s = 0; for (let x = 0; x < W; x++){ s += g[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + s; } }
  const r = Math.max(8, Math.round(Math.min(W, H) / 40));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
    const x1 = Math.max(0, x - r), y1 = Math.max(0, y - r), x2 = Math.min(W, x + r + 1), y2 = Math.min(H, y + r + 1);
    const ort = (I[y2 * (W + 1) + x2] - I[y1 * (W + 1) + x2] - I[y2 * (W + 1) + x1] + I[y1 * (W + 1) + x1]) / ((x2 - x1) * (y2 - y1));
    const v = g[y * W + x] < ort * .88 ? 0 : 255, o = (y * W + x) * 4; px[o] = px[o + 1] = px[o + 2] = v;
  }
  return px;
}

// JPEG sayfalardan PDF: sayfalar [{jpeg: Uint8Array, w, h}] — her sayfa A4 genişliğine (595 pt) oranlanır
export function pdfYap(sayfalar){
  const enc = new TextEncoder(), parcalar = [], ofs = []; let boy = 0;
  const yaz = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parcalar.push(b); boy += b.length; };
  const nesne = (n, govde) => { ofs[n] = boy; yaz(`${n} 0 obj\n`); for (const g of [].concat(govde)) yaz(g); yaz('\nendobj\n'); };
  yaz('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const N = sayfalar.length, sayfaNo = i => 3 + i * 3;
  nesne(1, '<< /Type /Catalog /Pages 2 0 R >>');
  nesne(2, `<< /Type /Pages /Count ${N} /Kids [${sayfalar.map((_, i) => sayfaNo(i) + ' 0 R').join(' ')}] >>`);
  sayfalar.forEach((s, i) => {
    const pw = 595.28, ph = +(pw * s.h / s.w).toFixed(2), n = sayfaNo(i);
    nesne(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im${i} ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`);
    const icerik = `q ${pw} 0 0 ${ph} 0 0 cm /Im${i} Do Q`;
    nesne(n + 1, [`<< /Length ${icerik.length} >>\nstream\n`, icerik, '\nendstream']);
    nesne(n + 2, [`<< /Type /XObject /Subtype /Image /Width ${s.w} /Height ${s.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${s.jpeg.length} >>\nstream\n`, s.jpeg, '\nendstream']);
  });
  const toplam = 3 + N * 3, xref = boy;
  yaz(`xref\n0 ${toplam}\n0000000000 65535 f \n`);
  for (let i = 1; i < toplam; i++) yaz(String(ofs[i]).padStart(10, '0') + ' 00000 n \n');
  yaz(`trailer\n<< /Size ${toplam} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const out = new Uint8Array(boy); let p = 0; for (const b of parcalar){ out.set(b, p); p += b.length; } return out;
}
