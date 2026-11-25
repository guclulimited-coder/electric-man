// HızırUsta — DXF proje okuyucu (25 Kasım 2026). Dış kütüphane yok.
// Okunanlar: LINE, LWPOLYLINE, POLYLINE/VERTEX, CIRCLE, ARC, TEXT, MTEXT, INSERT (blok; konum, ölçek, dönme).
// Çıktı: {birim, katmanlar, cizgiler: [{k: katman, p: [[x,y],...], kapali}], yazilar: [{k, x, y, h, t, a}], sinir}

export const BIRIM = {1: 'inç', 2: 'fit', 4: 'mm', 5: 'cm', 6: 'm'};
export const METRE = {1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1};

function ciftler(metin){
  const s = metin.split(/\r?\n/), out = [];
  for (let i = 0; i + 1 < s.length; i += 2) out.push([parseInt(s[i].trim(), 10), s[i + 1].trim()]);
  return out;
}

// Bir grup listesini varlıklara böl: [{tip, kod: [[kod, değer]...]}]
function varliklar(c, bas, son){
  const out = []; let cur = null;
  for (let i = bas; i < son; i++){
    const [k, v] = c[i];
    if (k === 0){ cur = {tip: v, kod: []}; out.push(cur); } else if (cur) cur.kod.push([k, v]);
  }
  return out;
}
const al = (e, k, v = 0) => { const x = e.kod.find(q => q[0] === k); return x ? (isNaN(+x[1]) ? x[1] : +x[1]) : v; };
const hepsi = (e, k) => e.kod.filter(q => q[0] === k).map(q => +q[1]);
const yazi = s => String(s).replace(/\\P/g, ' ').replace(/\\[A-Za-z][^;]*;/g, '').replace(/[{}]/g, '').replace(/%%c/gi, 'Ø').replace(/%%d/gi, '°').replace(/%%p/gi, '±');

function yay(cx, cy, r, a1, a2, adim){
  if (a2 < a1) a2 += 360; const n = Math.max(4, Math.ceil((a2 - a1) / (adim || 10))), p = [];
  for (let i = 0; i <= n; i++){ const a = (a1 + (a2 - a1) * i / n) * Math.PI / 180; p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return p;
}
// LWPOLYLINE çıkıntı (bulge) yayı: iki nokta arasına yay noktaları ekler
function cikinti(a, b, bulge){
  if (!bulge) return [];
  const th = 4 * Math.atan(bulge), d = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!d) return [];
  const r = d / (2 * Math.sin(th / 2)), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, h = r * Math.cos(th / 2);
  const nx = -(b[1] - a[1]) / d, ny = (b[0] - a[0]) / d, cx = mx + nx * h, cy = my + ny * h;
  const a0 = Math.atan2(a[1] - cy, a[0] - cx), n = Math.max(2, Math.ceil(Math.abs(th) / (Math.PI / 18))), p = [];
  for (let i = 1; i < n; i++){ const t = a0 + th * i / n; p.push([cx + Math.abs(r) * Math.cos(t), cy + Math.abs(r) * Math.sin(t)]); }
  return p;
}

function cevir(ents, katmanVars){
  const cizgiler = [], yazilar = [], ekler = [];
  for (let i = 0; i < ents.length; i++){
    const e = ents[i], k = String(al(e, 8, katmanVars));
    switch (e.tip){
      case 'LINE': cizgiler.push({k, p: [[al(e, 10), al(e, 20)], [al(e, 11), al(e, 21)]]}); break;
      case 'LWPOLYLINE': {
        const xs = [], p = [];
        // 10/20 sırayla, 42 çıkıntı o köşeye ait
        let cur = null; for (const [kod, v] of e.kod){ if (kod === 10){ cur = {x: +v, y: 0, b: 0}; xs.push(cur); } else if (kod === 20 && cur) cur.y = +v; else if (kod === 42 && cur) cur.b = +v; }
        const kapali = (al(e, 70) & 1) === 1;
        xs.forEach((q, j) => { p.push([q.x, q.y]); const n = xs[j + 1] || (kapali ? xs[0] : null); if (n && q.b) p.push(...cikinti([q.x, q.y], [n.x, n.y], q.b)); });
        if (kapali && p.length) p.push(p[0]);
        cizgiler.push({k, p, kapali}); break;
      }
      case 'POLYLINE': {
        const p = [], kapali = (al(e, 70) & 1) === 1; let j = i + 1;
        for (; j < ents.length && ents[j].tip !== 'SEQEND'; j++) if (ents[j].tip === 'VERTEX') p.push([al(ents[j], 10), al(ents[j], 20)]);
        if (kapali && p.length) p.push(p[0]);
        cizgiler.push({k, p, kapali}); i = j; break;
      }
      case 'CIRCLE': cizgiler.push({k, p: yay(al(e, 10), al(e, 20), al(e, 40), 0, 360, 10), kapali: true, merkez: [al(e, 10), al(e, 20)]}); break;
      case 'ARC': cizgiler.push({k, p: yay(al(e, 10), al(e, 20), al(e, 40), al(e, 50), al(e, 51), 8)}); break;
      case 'TEXT': case 'MTEXT': {
        const t = yazi(e.kod.filter(q => q[0] === 1 || q[0] === 3).map(q => q[1]).join(''));
        if (t) yazilar.push({k, x: al(e, 10), y: al(e, 20), h: al(e, 40, 2.5), t, a: e.tip === 'TEXT' ? al(e, 50) : (al(e, 50) || 0)}); break;
      }
      case 'INSERT': ekler.push({k, ad: String(al(e, 2)), x: al(e, 10), y: al(e, 20), sx: al(e, 41, 1) || 1, sy: al(e, 42, 1) || 1, r: al(e, 50)}); break;
    }
  }
  return {cizgiler, yazilar, ekler};
}

export function dxfOku(metin){
  if (/^AC10\d\d/.test(metin.slice(0, 6))) throw new Error('DWG');
  const c = ciftler(metin); if (!c.length) throw new Error('BOS');
  const bolum = ad => { for (let i = 0; i < c.length - 1; i++) if (c[i][0] === 0 && c[i][1] === 'SECTION' && c[i + 1][0] === 2 && c[i + 1][1] === ad){ let j = i + 2; while (j < c.length && !(c[j][0] === 0 && c[j][1] === 'ENDSEC')) j++; return [i + 2, j]; } return null; };
  // başlık: çizim birimi
  let birim = 0; const b = bolum('HEADER');
  if (b) for (let i = b[0]; i < b[1]; i++) if (c[i][0] === 9 && c[i][1] === '$INSUNITS' && c[i + 1]) birim = parseInt(c[i + 1][1], 10) || 0;
  // bloklar
  const bloklar = {}; const bb = bolum('BLOCKS');
  if (bb){ const v = varliklar(c, bb[0], bb[1]); let ad = null, ic = [], taban = [0, 0];
    for (const e of v){ if (e.tip === 'BLOCK'){ ad = String(al(e, 2)); ic = []; taban = [al(e, 10), al(e, 20)]; } else if (e.tip === 'ENDBLK'){ if (ad) bloklar[ad] = {ic: cevir(ic, '0'), taban}; ad = null; } else if (ad) ic.push(e); } }
  const eb = bolum('ENTITIES'); if (!eb) throw new Error('VARLIK');
  const ana = cevir(varliklar(c, eb[0], eb[1]), '0');
  const cizgiler = [...ana.cizgiler], yazilar = [...ana.yazilar];
  // blokları yerleştir (iç içe en fazla 4 kat)
  const yerlestir = (ek, derin, donustur) => {
    const bl = bloklar[ek.ad]; if (!bl || derin > 4) return;
    const r = ek.r * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
    const T = ([x, y]) => { x = (x - bl.taban[0]) * ek.sx; y = (y - bl.taban[1]) * ek.sy; return donustur([ek.x + x * cs - y * sn, ek.y + x * sn + y * cs]); };
    for (const ci of bl.ic.cizgiler) cizgiler.push({k: ci.k === '0' ? ek.k : ci.k, p: ci.p.map(T), kapali: ci.kapali, merkez: ci.merkez && T(ci.merkez)});
    for (const y of bl.ic.yazilar){ const [x2, y2] = T([y.x, y.y]); yazilar.push({...y, k: y.k === '0' ? ek.k : y.k, x: x2, y: y2, h: y.h * Math.abs(ek.sy), a: y.a + ek.r}); }
    for (const ic of bl.ic.ekler) yerlestir({...ic, k: ic.k === '0' ? ek.k : ic.k}, derin + 1, T);
  };
  for (const ek of ana.ekler) yerlestir(ek, 0, q => q);
  const temiz = cizgiler.filter(ci => ci.p.length > 1 && ci.p.every(q => isFinite(q[0]) && isFinite(q[1])));
  // sınır: aşırı uzak tek tük noktalar görünümü bozmasın diye yüzde 0,5 – 99,5 aralığı
  const xs = [], ys = []; for (const ci of temiz) for (const q of ci.p){ xs.push(q[0]); ys.push(q[1]); }
  for (const y of yazilar){ xs.push(y.x); ys.push(y.y); }
  if (!xs.length) throw new Error('VARLIK');
  const yuzde = (a, f) => { const s = a.slice().sort((m, n) => m - n); return s[Math.min(s.length - 1, Math.max(0, Math.floor(f * (s.length - 1))))]; };
  const sinir = xs.length > 200 ? [yuzde(xs, .005), yuzde(ys, .005), yuzde(xs, .995), yuzde(ys, .995)] : [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const katmanlar = [...new Set([...temiz.map(c2 => c2.k), ...yazilar.map(y => y.k)])].sort();
  return {birim, katmanlar, cizgiler: temiz, yazilar, sinir};
}

// Ölçü yardımcıları
export const uzunluk = p => p.reduce((t, q, i) => i ? t + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0, 0);
// En yakın uç noktaya yapışma: noktalar listesinde r yarıçapında en yakını döndürür
export function yapis(noktalar, x, y, r){
  let en = r * r, s = null;
  for (const q of noktalar){ const d = (q[0] - x) ** 2 + (q[1] - y) ** 2; if (d < en){ en = d; s = q; } }
  return s;
}
