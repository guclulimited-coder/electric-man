// HızırUsta — DXF proje okuyucu (25 Kasım 2026, 2. sürüm). Dış kütüphane yok.
// DWG dosyaları sunucuda DXF'e çevrilip bu okuyucuya verilir.
// Okunanlar: LINE, LWPOLYLINE, POLYLINE/VERTEX, CIRCLE, ARC, ELLIPSE, SPLINE, SOLID, 3DFACE, LEADER, TEXT, MTEXT,
// ATTRIB, INSERT (konum, ölçek, ayna, dönme, iç içe bloklar), DIMENSION (ölçü bloğu), katman tablosu (renk, kapalı/dondurulmuş).
// Çıktı: {birim, katmanlar, katmanBilgi, cizgiler: [{k, r, p, kapali?, merkez?}], yazilar: [{k, r, x, y, h, t, a, ha, va}], sinir}

export const BIRIM = {1: 'inç', 2: 'fit', 4: 'mm', 5: 'cm', 6: 'm'};
export const METRE = {1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1};

// AutoCAD renk dizini (ACI) -> #rrggbb (7 = siyah zeminde beyaz)
export function aci(n){
  const sabit = {1: '#ff0000', 2: '#ffff00', 3: '#00ff00', 4: '#00ffff', 5: '#0000ff', 6: '#ff00ff', 7: '#ffffff', 8: '#808080', 9: '#c0c0c0'};
  if (sabit[n]) return sabit[n];
  if (n >= 250 && n <= 255){ const g = [51, 91, 132, 173, 214, 255][n - 250]; return '#' + g.toString(16).padStart(2, '0').repeat(3); }
  if (n < 10 || n > 249) return '#ffffff';
  const h = Math.floor((n - 10) / 10) * 15, v = (n - 10) % 10, parlak = [1, 1, .65, .65, .5, .5, .3, .3, .15, .15][v], doy = v % 2 ? .5 : 1;
  const f = k => { const kk = (k + h / 60) % 6; return parlak * (1 - doy * Math.max(0, Math.min(kk, 4 - kk, 1))); };
  return '#' + [f(5), f(3), f(1)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}
const gercekRenk = v => '#' + (v & 0xffffff).toString(16).padStart(6, '0');

function ciftler(metin){
  const s = metin.split(/\r?\n/), out = new Array(s.length >> 1);
  for (let i = 0, j = 0; i + 1 < s.length; i += 2, j++) out[j] = [parseInt(s[i], 10), s[i + 1].trim()];
  return out;
}
function varliklar(c, bas, son){
  const out = []; let cur = null;
  for (let i = bas; i < son; i++){
    const [k, v] = c[i];
    if (k === 0){ cur = {tip: v, kod: []}; out.push(cur); } else if (cur) cur.kod.push([k, v]);
  }
  return out;
}
const al = (e, k, v = 0) => { for (const q of e.kod) if (q[0] === k) return isNaN(+q[1]) ? q[1] : +q[1]; return v; };
const yazi = s => String(s).replace(/\\P/g, '\n').replace(/\\[ACFHQTWfhpq][^;]*;/g, '').replace(/\\[LlOoKk]/g, '').replace(/\\S([^;^#/]*)[\^#/]([^;]*);/g, '$1/$2')
  .replace(/\\~/g, ' ').replace(/[{}]/g, '').replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').replace(/%%[uUoO]/g, '').replace(/\\\\/g, '\\');

function yay(cx, cy, r, a1, a2, adim){
  while (a2 <= a1) a2 += 360; const n = Math.max(4, Math.ceil((a2 - a1) / (adim || 10))), p = [];
  for (let i = 0; i <= n; i++){ const a = (a1 + (a2 - a1) * i / n) * Math.PI / 180; p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return p;
}
function cikinti(a, b, bulge){
  if (!bulge) return [];
  const th = 4 * Math.atan(bulge), d = Math.hypot(b[0] - a[0], b[1] - a[1]); if (!d) return [];
  const r = d / (2 * Math.sin(th / 2)), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, h = r * Math.cos(th / 2);
  const nx = -(b[1] - a[1]) / d, ny = (b[0] - a[0]) / d, cx = mx + nx * h, cy = my + ny * h;
  const a0 = Math.atan2(a[1] - cy, a[0] - cx), n = Math.max(2, Math.ceil(Math.abs(th) / (Math.PI / 18))), p = [];
  for (let i = 1; i < n; i++){ const t = a0 + th * i / n; p.push([cx + Math.abs(r) * Math.cos(t), cy + Math.abs(r) * Math.sin(t)]); }
  return p;
}
// B eğrisi (SPLINE): de Boor ile örnekleme; denetim noktası yoksa uyum noktalarını birleştir
function egri(e){
  const der = al(e, 71, 3), dug = [], kn = [], uy = []; let cur = null, ucur = null;
  for (const [k, v] of e.kod){
    if (k === 40) dug.push(+v);
    else if (k === 10){ cur = [+v, 0]; kn.push(cur); } else if (k === 20 && cur) cur[1] = +v;
    else if (k === 11){ ucur = [+v, 0]; uy.push(ucur); } else if (k === 21 && ucur) ucur[1] = +v;
  }
  if (kn.length <= der || dug.length !== kn.length + der + 1) return uy.length > 1 ? uy : kn;
  const p = [], t0 = dug[der], t1 = dug[kn.length], N = Math.min(200, kn.length * 8);
  for (let s = 0; s <= N; s++){
    const t = t0 + (t1 - t0) * s / N; let k = der; while (k < kn.length - 1 && dug[k + 1] <= t) k++;
    const d = []; for (let j = 0; j <= der; j++) d.push(kn[j + k - der].slice());
    for (let r = 1; r <= der; r++) for (let j = der; j >= r; j--){
      const i = j + k - der, al2 = (t - dug[i]) / ((dug[i + der + 1 - r] - dug[i]) || 1);
      d[j] = [(1 - al2) * d[j - 1][0] + al2 * d[j][0], (1 - al2) * d[j - 1][1] + al2 * d[j][1]];
    }
    p.push(d[der]);
  }
  return p;
}

function cevir(ents, katmanVars){
  const cizgiler = [], yazilar = [], ekler = [];
  const renk = e => { const tc = al(e, 420, null); if (tc !== null && tc !== '') return gercekRenk(+tc); const n = al(e, 62, 256); return n === 256 ? null : n === 0 ? 'BLOK' : aci(Math.abs(n)); };
  for (let i = 0; i < ents.length; i++){
    const e = ents[i], k = String(al(e, 8, katmanVars)), r = renk(e);
    if (al(e, 60, 0) === 1) continue; // görünmez
    const ciz = (p, ek) => cizgiler.push(Object.assign({k, r, p}, ek || {}));
    switch (e.tip){
      case 'LINE': ciz([[al(e, 10), al(e, 20)], [al(e, 11), al(e, 21)]]); break;
      case 'LWPOLYLINE': {
        const xs = [], p = []; let cur = null;
        for (const [kod, v] of e.kod){ if (kod === 10){ cur = {x: +v, y: 0, b: 0}; xs.push(cur); } else if (kod === 20 && cur) cur.y = +v; else if (kod === 42 && cur) cur.b = +v; }
        const kapali = (al(e, 70) & 1) === 1;
        xs.forEach((q, j) => { p.push([q.x, q.y]); const n = xs[j + 1] || (kapali ? xs[0] : null); if (n && q.b) p.push(...cikinti([q.x, q.y], [n.x, n.y], q.b)); });
        if (kapali && p.length) p.push(p[0]);
        ciz(p, {kapali}); break;
      }
      case 'POLYLINE': {
        const v = [], kapali = (al(e, 70) & 1) === 1; let j = i + 1;
        for (; j < ents.length && ents[j].tip !== 'SEQEND'; j++) if (ents[j].tip === 'VERTEX') v.push({x: al(ents[j], 10), y: al(ents[j], 20), b: al(ents[j], 42)});
        const p = []; v.forEach((q, m) => { p.push([q.x, q.y]); const n = v[m + 1] || (kapali ? v[0] : null); if (n && q.b) p.push(...cikinti([q.x, q.y], [n.x, n.y], q.b)); });
        if (kapali && p.length) p.push(p[0]);
        ciz(p, {kapali}); i = j; break;
      }
      case 'CIRCLE': ciz(yay(al(e, 10), al(e, 20), al(e, 40), 0, 360, 10), {kapali: true, merkez: [al(e, 10), al(e, 20)]}); break;
      case 'ARC': ciz(yay(al(e, 10), al(e, 20), al(e, 40), al(e, 50), al(e, 51), 8)); break;
      case 'ELLIPSE': {
        const cx = al(e, 10), cy = al(e, 20), mx = al(e, 11), my = al(e, 21), oran = al(e, 40, 1);
        let t1 = al(e, 41, 0), t2 = al(e, 42, Math.PI * 2); while (t2 <= t1) t2 += Math.PI * 2;
        const n = Math.max(8, Math.ceil((t2 - t1) / (Math.PI / 24))), p = [];
        for (let s = 0; s <= n; s++){ const t = t1 + (t2 - t1) * s / n, c = Math.cos(t), sn = Math.sin(t) * oran; p.push([cx + mx * c - my * sn, cy + my * c + mx * sn]); }
        ciz(p); break;
      }
      case 'SPLINE': { const p = egri(e); if (p.length > 1) ciz(p); break; }
      case 'SOLID': case 'TRACE': case '3DFACE': {
        const q = [[al(e, 10), al(e, 20)], [al(e, 11), al(e, 21)], [al(e, 13), al(e, 23)], [al(e, 12), al(e, 22)]];
        ciz(e.tip === '3DFACE' ? [q[0], q[1], q[3], q[2], q[0]] : [...q, q[0]], {kapali: true}); break;
      }
      case 'LEADER': {
        const p = []; let cur = null; for (const [kod, v] of e.kod){ if (kod === 10){ cur = [+v, 0]; p.push(cur); } else if (kod === 20 && cur) cur[1] = +v; }
        if (p.length > 1) ciz(p); break;
      }
      case 'TEXT': case 'ATTRIB': {
        if (e.tip === 'ATTRIB' && (al(e, 70, 0) & 1)) break; // gizli öznitelik
        const t = yazi(al(e, 1, '')); if (!t) break;
        const ha = al(e, 72, 0), va = e.tip === 'TEXT' ? al(e, 73, 0) : al(e, 74, 0), hiza = ha || va;
        yazilar.push({k, r, x: hiza ? al(e, 11) : al(e, 10), y: hiza ? al(e, 21) : al(e, 20), h: al(e, 40, 2.5), t, a: al(e, 50), ha: ha > 2 ? 1 : ha, va});
        break;
      }
      case 'MTEXT': {
        const t = yazi(e.kod.filter(q => q[0] === 3).map(q => q[1]).join('') + al(e, 1, '')); if (!t) break;
        const ek = al(e, 71, 1), dx = al(e, 11, null), dy = al(e, 21, 0);
        const a = dx !== null && (dx || dy) ? Math.atan2(dy, dx) * 180 / Math.PI : al(e, 50);
        yazilar.push({k, r, x: al(e, 10), y: al(e, 20), h: al(e, 40, 2.5), t, a, ha: (ek - 1) % 3, va: 3 - Math.floor((ek - 1) / 3), m: 1});
        break;
      }
      case 'INSERT': case 'DIMENSION': {
        const dim = e.tip === 'DIMENSION';
        const ins = {k, r, ad: String(al(e, 2)), x: dim ? 0 : al(e, 10), y: dim ? 0 : al(e, 20), sx: dim ? 1 : (al(e, 41, 1) || 1), sy: dim ? 1 : (al(e, 42, 1) || 1), d: dim ? 0 : al(e, 50),
          kol: dim ? 1 : Math.max(1, al(e, 70, 1)), sat: dim ? 1 : Math.max(1, al(e, 71, 1)), kx: al(e, 44, 0), ky: al(e, 45, 0)};
        ekler.push(ins);
        // öznitelikler (ATTRIB) INSERT'ten sonra gelir; dünya koordinatındadırlar
        if (!dim && al(e, 66, 0) === 1){ let j = i + 1; const alt = []; for (; j < ents.length && ents[j].tip !== 'SEQEND'; j++) alt.push(ents[j]); const s = cevir(alt, k); yazilar.push(...s.yazilar.map(y => Object.assign(y, {r: y.r === 'BLOK' ? r : y.r}))); i = j; }
        break;
      }
    }
  }
  return {cizgiler, yazilar, ekler};
}

export function dxfOku(metin){
  if (/^AC10\d\d/.test(metin.slice(0, 6))) throw new Error('DWG');
  const c = ciftler(metin); if (!c.length) throw new Error('BOS');
  const bolum = ad => { for (let i = 0; i < c.length - 1; i++) if (c[i][0] === 0 && c[i][1] === 'SECTION' && c[i + 1][0] === 2 && c[i + 1][1] === ad){ let j = i + 2; while (j < c.length && !(c[j][0] === 0 && c[j][1] === 'ENDSEC')) j++; return [i + 2, j]; } return null; };
  let birim = 0; const b = bolum('HEADER');
  if (b) for (let i = b[0]; i < b[1]; i++) if (c[i][0] === 9 && c[i][1] === '$INSUNITS' && c[i + 1]) birim = parseInt(c[i + 1][1], 10) || 0;
  // katman tablosu
  const katmanBilgi = {}; const tb = bolum('TABLES');
  if (tb) for (const e of varliklar(c, tb[0], tb[1])) if (e.tip === 'LAYER'){
    const ad = String(al(e, 2)), n = al(e, 62, 7), tc = al(e, 420, null), bay = al(e, 70, 0);
    katmanBilgi[ad] = {renk: tc !== null && tc !== '' ? gercekRenk(+tc) : aci(Math.abs(n) || 7), gizli: n < 0 || (bay & 1) === 1};
  }
  const bloklar = {}; const bb = bolum('BLOCKS');
  if (bb){ const v = varliklar(c, bb[0], bb[1]); let ad = null, ic = [], taban = [0, 0];
    for (const e of v){ if (e.tip === 'BLOCK'){ ad = String(al(e, 2)); ic = []; taban = [al(e, 10), al(e, 20)]; } else if (e.tip === 'ENDBLK'){ if (ad) bloklar[ad] = {ic: null, ham: ic, taban}; ad = null; } else if (ad) ic.push(e); } }
  const blok = ad => { const bl = bloklar[ad]; if (bl && !bl.ic) bl.ic = cevir(bl.ham, '0'); return bl; };
  const eb = bolum('ENTITIES'); if (!eb) throw new Error('VARLIK');
  const ana = cevir(varliklar(c, eb[0], eb[1]), '0');
  const cizgiler = ana.cizgiler, yazilar = ana.yazilar;
  let sayac = 0;
  const yerlestir = (ek, derin, donustur, olcek, ustRenk) => {
    const bl = blok(ek.ad); if (!bl || derin > 8 || sayac > 400000) return;
    const rad = ek.d * Math.PI / 180, cs = Math.cos(rad), sn = Math.sin(rad), ayna = ek.sx * ek.sy < 0;
    const benimRenk = ek.r === 'BLOK' ? ustRenk : ek.r;
    for (let a = 0; a < ek.sat; a++) for (let b2 = 0; b2 < ek.kol; b2++){
      const ox = b2 * ek.kx, oy = a * ek.ky;
      const T = ([x, y]) => { x = (x - bl.taban[0]) * ek.sx + ox; y = (y - bl.taban[1]) * ek.sy + oy; return donustur([ek.x + x * cs - y * sn, ek.y + x * sn + y * cs]); };
      const katman = k => k === '0' ? ek.k : k, rr = r => r === 'BLOK' ? benimRenk : r;
      for (const ci of bl.ic.cizgiler){ sayac++; cizgiler.push({k: katman(ci.k), r: rr(ci.r), p: ci.p.map(T), kapali: ci.kapali, merkez: ci.merkez && T(ci.merkez)}); }
      for (const y of bl.ic.yazilar){
        const [x2, y2] = T([y.x, y.y]), h = y.h * Math.abs(ek.sy) * olcek;
        yazilar.push({...y, k: katman(y.k), r: rr(y.r), x: x2, y: y2, h, a: (ayna ? -y.a : y.a) + ek.d + (derin ? 0 : 0)});
      }
      for (const ic of bl.ic.ekler) yerlestir({...ic, k: katman(ic.k)}, derin + 1, T, olcek * Math.abs(ek.sy), benimRenk);
    }
  };
  for (const ek of ana.ekler) yerlestir(ek, 0, q => q, 1, null);
  // renk: katmana göre (BYLAYER) ve blok dışında kalan BYBLOCK beyaz
  const katmanRenk = k => (katmanBilgi[k] && katmanBilgi[k].renk) || '#ffffff';
  const temiz = [];
  for (const ci of cizgiler){ if (ci.p.length < 2) continue; let iyi = true; for (const q of ci.p) if (!isFinite(q[0]) || !isFinite(q[1])){ iyi = false; break; } if (!iyi) continue; if (!ci.r || ci.r === 'BLOK') ci.r = ci.r === 'BLOK' ? '#ffffff' : katmanRenk(ci.k); temiz.push(ci); }
  const yazTemiz = yazilar.filter(y => isFinite(y.x) && isFinite(y.y) && y.h > 0).map(y => { if (!y.r || y.r === 'BLOK') y.r = y.r === 'BLOK' ? '#ffffff' : katmanRenk(y.k); return y; });
  const xs = [], ys = []; for (const ci of temiz){ xs.push(ci.p[0][0], ci.p[ci.p.length - 1][0]); ys.push(ci.p[0][1], ci.p[ci.p.length - 1][1]); }
  for (const y of yazTemiz){ xs.push(y.x); ys.push(y.y); }
  if (!xs.length) throw new Error('VARLIK');
  const yuzde = (a, f) => { const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.max(0, Math.floor(f * (s.length - 1))))]; };
  const sinir = xs.length > 200 ? [yuzde(xs, .005), yuzde(ys, .005), yuzde(xs, .995), yuzde(ys, .995)] : [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const katmanlar = [...new Set([...temiz.map(c2 => c2.k), ...yazTemiz.map(y => y.k)])].sort((a, b2) => a.localeCompare(b2, 'tr'));
  return {birim, katmanlar, katmanBilgi, cizgiler: temiz, yazilar: yazTemiz, sinir};
}

export const uzunluk = p => p.reduce((t, q, i) => i ? t + Math.hypot(q[0] - p[i - 1][0], q[1] - p[i - 1][1]) : 0, 0);
// Kapalı çokgen alanı (m² için birim karesiyle çarpılır)
export const alan = p => { let s = 0; for (let i = 0; i < p.length; i++){ const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; };
export function yapis(noktalar, x, y, r){
  let en = r * r, s = null;
  for (const q of noktalar){ const d = (q[0] - x) ** 2 + (q[1] - y) ** 2; if (d < en){ en = d; s = q; } }
  return s;
}
