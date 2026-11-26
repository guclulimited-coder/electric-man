// HızırUsta — Projeler: proje listesi ve çizim görüntüleyici (26 Kasım 2026).
// DXF telefonda açılır; DWG sunucuda çizim verisine çevrilir (DWG_SUNUCU). Projeler ve notlar telefonda (IndexedDB) saklanır.
import * as D from './dxf.mjs';
import * as T from './tarama.mjs';

export const DWG_SUNUCU = 'https://hizirusta-dwg.guclu-limited.workers.dev/cevir';

/* ---------- depo (IndexedDB) ---------- */
const VT = {
  db: null,
  ac(){ return this.db || (this.db = new Promise((ok, no) => { const r = indexedDB.open('hizirusta-projeler', 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('ozet', {keyPath: 'id'}); d.createObjectStore('veri', {keyPath: 'id'}); };
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); })); },
  async is(depo, kip, f){ const d = await this.ac(); return new Promise((ok, no) => { const t = d.transaction(depo, kip), s = t.objectStore(depo), r = f(s); t.oncomplete = () => ok(r && r.result); t.onerror = () => no(t.error); }); },
  liste(){ return this.is('ozet', 'readonly', s => s.getAll()); },
  ozet(o){ return this.is('ozet', 'readwrite', s => s.put(o)); },
  veri(id){ return this.is('veri', 'readonly', s => s.get(id)); },
  veriKoy(v){ return this.is('veri', 'readwrite', s => s.put(v)); },
  async sil(id){ await this.is('ozet', 'readwrite', s => s.delete(id)); await this.is('veri', 'readwrite', s => s.delete(id)); }
};

const YOL = new WeakMap(); // çizim -> renk başına Path2D (IndexedDB'ye yazılmaz)
const BOYUT = n => n > 1048576 ? (n / 1048576).toFixed(2).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const TARIH = t => new Date(t).toLocaleString('tr-TR', {year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'});

export function kur(o){
  const {ekran, toast, perde, kacis, sayi, depo, hesapAc, Reklam, geri} = o;
  const $ = s => document.querySelector(s);
  let sekme = 'son', arama = '';

  /* ---------- proje listesi ---------- */
  async function projeler(){
    let liste = [];
    try { liste = await VT.liste(); } catch(e){}
    liste.sort((a, b) => (b.acilis || b.tarih) - (a.acilis || a.tarih));
    const goster = liste.filter(p => (sekme === 'son' || p.fav) && (!arama || p.ad.toLocaleLowerCase('tr').includes(arama)));
    ekran.innerHTML = `<button class="geri">‹ Hesaplar</button>
    <div class="kart" style="padding:12px 14px"><div style="display:flex;align-items:center;gap:10px"><h2 style="flex:1;margin:0">Projeler</h2><button class="dugme" id="pAc" style="padding:9px 14px">+ Proje aç</button></div>
      <div class="secenekler" style="grid-template-columns:1fr 1fr;margin-top:12px"><button data-sekme="son" class="${sekme === 'son' ? 'on' : ''}">Son açılanlar</button><button data-sekme="fav" class="${sekme === 'fav' ? 'on' : ''}">★ Favoriler</button></div>
      <input id="pAra" placeholder="Projelerde ara" value="${kacis(arama)}" style="margin-top:10px">
      <input type="file" id="pDosya" accept=".dwg,.dxf,application/acad,image/vnd.dwg,application/dxf,image/vnd.dxf,application/octet-stream" hidden></div>
    <div id="pListe">${goster.length ? goster.map(p => `<div class="kart pr" data-id="${p.id}" style="display:flex;gap:12px;padding:10px;align-items:center;cursor:pointer;margin-bottom:8px">
        <img src="${p.resim || ''}" alt="" style="width:96px;height:68px;object-fit:cover;border-radius:8px;background:#000;flex:none">
        <div style="flex:1;min-width:0"><b style="display:block;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:15px">${p.fav ? '★ ' : ''}${kacis(p.ad)}</b>
        <span class="not" style="margin:2px 0 0;display:block">${TARIH(p.acilis || p.tarih)} · ${BOYUT(p.boyut || 0)}</span></div>
        <button class="pMenu" data-id="${p.id}" aria-label="Menü" style="border:0;background:none;color:var(--soluk);font-size:22px;padding:6px 8px">⋮</button></div>`).join('')
      : `<div class="kart bos">${sekme === 'fav' ? 'Favori proje yok.' : 'Henüz proje yok. "+ Proje aç" ile telefondaki DWG veya DXF dosyasını seç.'}</div>`}</div>`;
    ekran.querySelector('.geri').onclick = geri;
    $('#pAc').onclick = () => $('#pDosya').click();
    $('#pDosya').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) ice(f); };
    $('#pAra').oninput = e => { arama = e.target.value.toLocaleLowerCase('tr'); clearTimeout(projeler._z); projeler._z = setTimeout(() => { projeler().then(() => { const a = $('#pAra'); a.focus(); a.setSelectionRange(a.value.length, a.value.length); }); }, 250); };
    ekran.querySelectorAll('[data-sekme]').forEach(b => b.onclick = () => { sekme = b.dataset.sekme; projeler(); });
    ekran.querySelectorAll('.pr').forEach(k => k.onclick = e => { if (e.target.closest('.pMenu')) return; ac(k.dataset.id); });
    ekran.querySelectorAll('.pMenu').forEach(b => b.onclick = () => menu(liste.find(p => p.id === b.dataset.id)));
    scrollTo(0, 0);
  }
  function menu(p){
    perde(`<h2 style="word-break:break-word">${kacis(p.ad)}</h2><div class="secenekler" style="grid-template-columns:1fr">
      <button data-m="ac">Aç</button><button data-m="fav">${p.fav ? '☆ Favorilerden çıkar' : '★ Favorilere ekle'}</button><button data-m="ad">Yeniden adlandır</button><button data-m="sil" style="color:var(--kotu)">Sil</button></div>`, (pp, kapat) => {
      pp.querySelectorAll('[data-m]').forEach(b => b.onclick = async () => {
        const m = b.dataset.m; kapat();
        if (m === 'ac') return ac(p.id);
        if (m === 'fav'){ p.fav = !p.fav; await VT.ozet(p); return projeler(); }
        if (m === 'ad') return perde(`<h2>Yeniden adlandır</h2><input id="yAd" value="${kacis(p.ad)}"><div class="yanyana"><button class="dugme tam" id="yK">Kaydet</button></div>`, (q, k2) => {
          q.querySelector('#yK').onclick = async () => { const v = q.querySelector('#yAd').value.trim(); if (v){ p.ad = v; await VT.ozet(p); } k2(); projeler(); }; });
        if (m === 'sil') return perde(`<h2>Proje silinsin mi?</h2><p class="alt-baslik">"${kacis(p.ad)}" ve üzerindeki notlar bu telefondan kalıcı olarak silinir. Telefondaki asıl dosyaya dokunulmaz.</p><div class="yanyana"><button class="dugme" id="sE" style="background:var(--kotu);color:#fff">Sil</button><button class="dugme ikincil" id="sH">Vazgeç</button></div>`, (q, k2) => {
          q.querySelector('#sE').onclick = async () => { await VT.sil(p.id); k2(); projeler(); toast('Silindi'); }; q.querySelector('#sH').onclick = k2; });
      });
    });
  }

  /* ---------- dosya içe alma: DXF telefonda, DWG sunucuda ---------- */
  async function ice(f){
    const bekle = perde(`<h2>Proje açılıyor…</h2><p class="alt-baslik" id="iDurum">${kacis(f.name)}</p><div class="not">Büyük projeler birkaç saniye sürebilir.</div>`, () => {});
    bekle.onclick = null;
    const durum = m => { const x = bekle.querySelector('#iDurum'); if (x) x.textContent = m; };
    try {
      const bas = new Uint8Array(await f.slice(0, 6).arrayBuffer()), imza = String.fromCharCode(...bas);
      let d;
      if (imza.startsWith('AC10')){
        if (!navigator.onLine) throw new Error('INTERNET');
        durum('DWG çiziliyor (sunucuda çevriliyor)…');
        let r;
        try { r = await fetch(DWG_SUNUCU, {method: 'POST', headers: {'Content-Type': 'application/octet-stream', 'X-HU': '1'}, body: f}); } catch(e){ throw new Error('SUNUCU_YOK'); }
        const j = await r.json().catch(() => ({hata: 'SUNUCU'}));
        if (!r.ok || j.hata) throw new Error(j.hata === 'DWG_DEGIL' ? 'BICIM' : j.hata === 'BOYUT' ? 'BOYUT' : j.hata === 'CEVRILEMEDI' ? 'BOZUK' : 'SUNUCU');
        d = j;
      } else {
        durum('DXF okunuyor…');
        d = D.dxfOku(await f.text());
      }
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const p = {id, ad: f.name.replace(/\.(dwg|dxf)$/i, ''), boyut: f.size, tarih: Date.now(), acilis: Date.now(), fav: false, resim: kucukResim(d)};
      await VT.veriKoy({id, d, notlar: []}); await VT.ozet(p);
      bekle.remove(); ac(id);
    } catch(e){
      console.warn('proje acilamadi', e && e.message);
      bekle.remove();
      const m = {INTERNET: 'DWG dosyası için internet bağlantısı gerekiyor.', SUNUCU_YOK: 'DWG çeviri hizmetine ulaşılamadı. Biraz sonra tekrar deneyin ya da dosyayı DXF olarak açın.',
        BICIM: 'Bu dosya tanınan bir DWG değil.', BOYUT: 'Dosya çok büyük (en fazla 40 MB).', BOZUK: 'Bu DWG dosyası okunamadı.', SUNUCU: 'DWG çevrilemedi. Biraz sonra tekrar deneyin.',
        DWG: 'Bu bir DWG dosyası.', VARLIK: 'Dosyada çizim bulunamadı.'}[e.message] || 'Dosya okunamadı. DWG veya DXF olduğundan emin olun.';
      toast(m);
    }
  }
  function kucukResim(d){
    const c = document.createElement('canvas'); c.width = 240; c.height = 170; const x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, 240, 170); cizimiCiz(x, d, gorunumSigdir(d, 240, 170), 240, 170, new Set(), true);
    return c.toDataURL('image/jpeg', .7);
  }

  /* ---------- çizim ---------- */
  function gorunumSigdir(d, W, H){ const [x1, y1, x2, y2] = d.sinir, s = Math.min(W / ((x2 - x1) || 1), H / ((y2 - y1) || 1)) * .92; return {s, ox: W / 2 - (x1 + x2) / 2 * s, oy: H / 2 + (y1 + y2) / 2 * s}; }
  // Path2D önbelleği: renk başına tek yol, dünya koordinatında
  function yollar(d, gizli){
    const anahtar = [...gizli].join('\u0001'), on = YOL.get(d);
    if (on && on.a === anahtar) return on.m;
    const m = new Map();
    for (const c of d.cizgiler){ if (gizli.has(c.k)) continue; let y = m.get(c.r); if (!y){ y = new Path2D(); m.set(c.r, y); } const p = c.p; y.moveTo(p[0][0], -p[0][1]); for (let i = 1; i < p.length; i++) y.lineTo(p[i][0], -p[i][1]); }
    YOL.set(d, {a: anahtar, m}); return m;
  }
  function cizimiCiz(x, d, g, W, H, gizli, kaba){
    x.save(); x.setTransform(x.getTransform().a, 0, 0, x.getTransform().d, 0, 0);
    const dp = x.getTransform().a;
    x.setTransform(dp * g.s, 0, 0, dp * g.s, dp * g.ox, dp * g.oy);
    x.lineWidth = 1 / g.s; x.lineJoin = 'round';
    for (const [r, y] of yollar(d, gizli)){ x.strokeStyle = r; x.stroke(y); }
    x.setTransform(dp, 0, 0, dp, 0, 0);
    if (!kaba){
      const ekr = (X, Y) => [X * g.s + g.ox, -Y * g.s + g.oy];
      for (const y of d.yazilar){
        if (gizli.has(y.k)) continue; const px = y.h * g.s; if (px < 4 || px > 400) continue;
        const [a, b] = ekr(y.x, y.y); if (a < -400 || b < -400 || a > W + 400 || b > H + 400) continue;
        x.save(); x.translate(a, b); x.rotate(-y.a * Math.PI / 180); x.fillStyle = y.r; x.font = `${px}px system-ui,sans-serif`;
        x.textAlign = ['left', 'center', 'right'][y.ha || 0];
        const satir = String(y.t).split('\n'), va = y.va || 0;
        x.textBaseline = va === 3 ? 'top' : va === 2 ? 'middle' : va === 1 ? 'bottom' : 'alphabetic';
        satir.forEach((s, i) => x.fillText(s, 0, i * px * 1.35));
        x.restore();
      }
    }
    x.restore();
  }

  /* ---------- görüntüleyici ---------- */
  async function ac(id){
    const [ozetler, v] = await Promise.all([VT.liste(), VT.veri(id)]);
    const p = ozetler.find(q => q.id === id); if (!p || !v) return toast('Proje bulunamadı');
    p.acilis = Date.now(); VT.ozet(p);
    const d = v.d; d.katmanBilgi = d.katmanBilgi || {};
    const gizli = new Set(Object.entries(d.katmanBilgi).filter(([, b]) => b.gizli).map(([k]) => k));
    const notlar = v.notlar || [], geriY = [], ileriY = [];
    const birimM = () => (D.METRE[S.birim] || .001) * S.kal;
    const S = {arac: 'kaydir', kat: 'olcum', renk: '#ffcc00', kalin: 3, birim: d.birim && D.METRE[d.birim] ? d.birim : (Math.max(d.sinir[2] - d.sinir[0], d.sinir[3] - d.sinir[1]) > 2000 ? 4 : 6), kal: v.kal || 1, nokta: [], degisti: false};
    const uclar = []; for (const c of d.cizgiler){ if (c.merkez){ uclar.push(c.merkez); continue; } uclar.push(c.p[0], c.p[c.p.length - 1]); if (c.p.length < 40) for (const q of c.p) uclar.push(q); }

    const kap = document.createElement('div');
    kap.id = 'cizici';
    kap.style.cssText = 'position:fixed;inset:0;z-index:25;background:#000;color:#fff;display:flex;flex-direction:column;touch-action:none;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
    const dg = (i, t, ek = '', sinif = '') => `<button class="cz-d ${sinif}" data-i="${i}" title="${t}" aria-label="${t}" ${ek}>${IKON[i] || t}</button>`;
    kap.innerHTML = `<style>
      #cizici .ust{display:flex;align-items:center;gap:6px;padding:8px 10px}#cizici .ust .bos2{flex:1}
      #cizici .cz-d{width:42px;height:42px;border:0;border-radius:10px;background:#15181f;color:#fff;display:grid;place-items:center;flex:none}
      #cizici .cz-d svg{width:22px;height:22px}#cizici .cz-d.on{background:#fca311;color:#14213d}#cizici .cz-d:disabled{opacity:.35}
      #cizici .alt{background:#0d0f14;border-top:1px solid #222}
      #cizici .araclar{display:flex;gap:8px;padding:10px;overflow-x:auto}
      #cizici .arac{min-width:62px;height:54px;border:0;border-radius:14px;background:#1b1f28;color:#dfe5ee;font:600 11px system-ui;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;flex:none;padding:0 8px}
      #cizici .arac svg{width:22px;height:22px}#cizici .arac.on{background:#2ec4c4;color:#03222a}
      #cizici .katlar{display:flex;overflow-x:auto;border-top:1px solid #1d2129}
      #cizici .kat{flex:1;min-width:76px;border:0;background:none;color:#8d96a6;font:700 12px system-ui;padding:9px 4px 10px;display:flex;flex-direction:column;align-items:center;gap:4px}
      #cizici .kat svg{width:24px;height:24px}#cizici .kat.on{color:#fff}
      #cizici canvas{flex:1;min-height:0;width:100%;display:block;touch-action:none}
      #cizici .bilgi{position:absolute;left:12px;top:calc(64px + env(safe-area-inset-top));background:rgba(20,33,61,.92);border-radius:10px;padding:7px 12px;font:700 15px system-ui;pointer-events:none;max-width:70%}
      #cizici .bilgi:empty{display:none}
      #cizici .panel{position:absolute;right:10px;top:calc(64px + env(safe-area-inset-top));bottom:150px;width:min(78vw,300px);background:#11141b;border:1px solid #262b36;border-radius:14px;overflow:auto;padding:10px;display:none}
      #cizici .panel.on{display:block}#cizici .panel label{display:flex;align-items:center;gap:8px;color:#dfe5ee;margin:0;padding:7px 4px;font-size:14px;border-bottom:1px solid #1d2129}
      #cizici .panel input{width:auto}
      #cizici.tam .ust,#cizici.tam .alt{display:none}
      #cizici .cikis{position:absolute;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));display:none}#cizici.tam .cikis{display:grid}
    </style>
    <div class="ust">${dg('kapat', 'Kapat', 'style="background:#2ec4c4;color:#03222a;border-radius:50%"')}<span class="bos2"></span>${dg('kaydet', 'Kaydet')}${dg('geri', 'Geri al')}${dg('ileri', 'İleri al')}${dg('pencere', 'Pencereyle yakınlaştır')}${dg('sigdir', 'Tümünü sığdır')}${dg('tam', 'Tam ekran')}${dg('daha', 'Diğer')}</div>
    <div style="position:relative;flex:1;min-height:0;display:flex"><canvas id="czT"></canvas><div class="bilgi" id="czB"></div><div class="panel" id="czP"></div></div>
    <div class="alt"><div class="araclar" id="czA"></div><div class="katlar" id="czK"></div></div>
    ${dg('tam', 'Tam ekrandan çık', '', 'cikis')}`;
    document.body.appendChild(kap);
    const tv = kap.querySelector('#czT'), cx = tv.getContext('2d'); let W = 0, H = 0, g = null;
    const boyut = () => { const r = tv.getBoundingClientRect(), dp = Math.min(3, devicePixelRatio || 1); W = r.width; H = r.height; tv.width = Math.round(W * dp); tv.height = Math.round(H * dp); cx.setTransform(dp, 0, 0, dp, 0, 0); if (!g) g = gorunumSigdir(d, W, H); ciz(); };
    const ekr = ([x, y]) => [x * g.s + g.ox, -y * g.s + g.oy], dun = (a, b) => [(a - g.ox) / g.s, -(b - g.oy) / g.s];

    /* araç kümeleri */
    const KUMELER = {
      olcum: [['kaydir', 'Kaydır'], ['uzunluk', 'Uzunluk'], ['guzergah', 'Güzergâh'], ['alan', 'Alan'], ['aci', 'Açı'], ['olcek', 'Ölçek'], ['aktar', 'Kabloya aktar']],
      aciklama: [['kalem', 'Kalem'], ['yazi', 'Yazı'], ['ok', 'Ok'], ['bulut', 'Bulut'], ['sil', 'Silgi']],
      ciz: [['cizgi', 'Çizgi'], ['dikdortgen', 'Dikdörtgen'], ['daire', 'Daire'], ['boyut', 'Ölçü çizgisi']],
      katman: [], renk: []
    };
    const KATAD = {olcum: 'Ölçüm', aciklama: 'Ek açıklama', ciz: 'Çiz', katman: 'Katman', renk: 'Renk'};
    const altCiz = () => {
      kap.querySelector('#czK').innerHTML = Object.keys(KATAD).map(k => `<button class="kat ${S.kat === k ? 'on' : ''}" data-k="${k}">${IKON['k_' + k]}${KATAD[k]}</button>`).join('');
      const a = kap.querySelector('#czA'), panel = kap.querySelector('#czP');
      panel.classList.toggle('on', S.kat === 'katman');
      if (S.kat === 'katman'){
        a.innerHTML = `<button class="arac" data-t="hepsi">${IKON.goz}Hepsini aç</button><button class="arac" data-t="hic">${IKON.gozk}Hepsini kapat</button>`;
        panel.innerHTML = `<b style="display:block;padding:4px 4px 8px">Katmanlar (${d.katmanlar.length})</b>` + d.katmanlar.map(k => `<label><input type="checkbox" data-kat="${kacis(k)}" ${gizli.has(k) ? '' : 'checked'}><span style="width:12px;height:12px;border-radius:3px;background:${(d.katmanBilgi[k] || {}).renk || '#fff'};flex:none"></span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${kacis(k)}</span></label>`).join('');
        panel.querySelectorAll('[data-kat]').forEach(c => c.onchange = () => { c.checked ? gizli.delete(c.dataset.kat) : gizli.add(c.dataset.kat); ciz(); });
        a.querySelector('[data-t="hepsi"]').onclick = () => { gizli.clear(); altCiz(); ciz(); };
        a.querySelector('[data-t="hic"]').onclick = () => { d.katmanlar.forEach(k => gizli.add(k)); altCiz(); ciz(); };
      } else if (S.kat === 'renk'){
        const R = ['#ffcc00', '#ff3b30', '#34c759', '#2ec4c4', '#0a84ff', '#bf5af2', '#ffffff', '#ff9500'];
        a.innerHTML = R.map(r => `<button class="arac ${S.renk === r ? 'on' : ''}" data-r="${r}" style="min-width:48px"><span style="width:24px;height:24px;border-radius:50%;background:${r};border:2px solid #fff"></span></button>`).join('') +
          [2, 3, 6].map(k => `<button class="arac ${S.kalin === k ? 'on' : ''}" data-kl="${k}"><span style="width:28px;height:${k}px;background:currentColor;border-radius:2px"></span>${k === 2 ? 'İnce' : k === 3 ? 'Orta' : 'Kalın'}</button>`).join('');
        a.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { S.renk = b.dataset.r; altCiz(); });
        a.querySelectorAll('[data-kl]').forEach(b => b.onclick = () => { S.kalin = +b.dataset.kl; altCiz(); });
      } else {
        a.innerHTML = `<button class="arac" data-t="kapatAlt" aria-label="Geri">${IKON.sol}</button>` + KUMELER[S.kat].map(([t, ad]) => `<button class="arac ${S.arac === t ? 'on' : ''}" data-t="${t}">${IKON['a_' + t] || ''}${ad}</button>`).join('');
        if (S.arac === 'guzergah' || S.arac === 'alan'){ const b = document.createElement('button'); b.className = 'arac'; b.style.background = '#34c759'; b.style.color = '#04210f'; b.innerHTML = `${IKON.tamam}Bitir`; b.onclick = bitir; a.appendChild(b); }
        a.querySelectorAll('[data-t]').forEach(b => b.onclick = () => aracSec(b.dataset.t));
      }
      kap.querySelectorAll('#czK [data-k]').forEach(b => b.onclick = () => { S.kat = b.dataset.k; altCiz(); });
    };
    const aracSec = t => {
      if (t === 'kapatAlt'){ S.arac = 'kaydir'; S.nokta = []; altCiz(); ciz(); return; }
      if (t === 'aktar'){ const son = [...notlar].reverse().find(n => n.tur === 'guzergah' || n.tur === 'uzunluk'); if (!son) return toast('Önce bir uzunluk veya güzergâh ölç'); kapat(); hesapAc('kesit', {L: Math.ceil(D.uzunluk(son.p) * birimM())}); return; }
      if (t === 'olcek'){ toast('Ölçüsü bilinen bir çizginin iki ucuna dokun'); }
      S.arac = t; S.nokta = []; altCiz(); ciz();
      const ipucu = {uzunluk: 'İki noktaya dokun', guzergah: 'Köşelere dokun, bitirmek için ✓', alan: 'Köşelere dokun, kapatmak için ✓', aci: 'Üç noktaya dokun: kol, köşe, kol', kalem: 'Parmağınla çiz', yazi: 'Yazının yerine dokun', ok: 'Başlangıç ve uç noktasına dokun', bulut: 'Bulutun iki köşesine dokun', sil: 'Silinecek notun üstüne dokun', cizgi: 'İki noktaya dokun', dikdortgen: 'İki köşeye dokun', daire: 'Merkeze, sonra kenara dokun', boyut: 'Ölçünün iki ucuna dokun'}[t];
      if (ipucu) bilgi(ipucu, 2500);
    };
    let bilgiZ = 0; const bilgi = (m, sure) => { const b = kap.querySelector('#czB'); b.textContent = m || ''; clearTimeout(bilgiZ); if (sure) bilgiZ = setTimeout(() => { b.textContent = ''; ciz(); }, sure); };

    /* not çizimi */
    const yazOlcu = m => m >= 1 ? sayi(m, 2) + ' m' : sayi(m * 100, 1) + ' cm';
    const notCiz = (n, gecici) => {
      cx.save(); cx.strokeStyle = n.renk || '#ffcc00'; cx.fillStyle = n.renk || '#ffcc00'; cx.lineWidth = n.kalin || 3; cx.lineCap = cx.lineJoin = 'round';
      const P = (n.p || []).map(ekr), cizgi = (pts, kapali) => { if (pts.length < 1) return; cx.beginPath(); pts.forEach((q, i) => i ? cx.lineTo(q[0], q[1]) : cx.moveTo(q[0], q[1])); if (kapali) cx.closePath(); cx.stroke(); };
      const etiket = (t, q) => { cx.font = '700 14px system-ui'; const w = cx.measureText(t).width + 12; cx.fillStyle = 'rgba(20,33,61,.92)'; cx.fillRect(q[0] - w / 2, q[1] - 26, w, 22); cx.fillStyle = '#fff'; cx.textAlign = 'center'; cx.fillText(t, q[0], q[1] - 10); };
      const orta = pts => [(pts[0][0] + pts[pts.length - 1][0]) / 2, (pts[0][1] + pts[pts.length - 1][1]) / 2];
      switch (n.tur){
        case 'uzunluk': case 'guzergah': cizgi(P); P.forEach(q => { cx.beginPath(); cx.arc(q[0], q[1], 4, 0, 7); cx.fill(); }); if (n.p.length > 1) etiket(yazOlcu(D.uzunluk(n.p) * birimM()), n.tur === 'uzunluk' ? orta(P) : P[P.length - 1]); break;
        case 'alan': { cx.globalAlpha = .18; cx.beginPath(); P.forEach((q, i) => i ? cx.lineTo(q[0], q[1]) : cx.moveTo(q[0], q[1])); cx.closePath(); cx.fill(); cx.globalAlpha = 1; cizgi(P, !gecici);
          if (n.p.length > 2){ const m2 = D.alan(n.p) * birimM() ** 2, c2 = [P.reduce((t, q) => t + q[0], 0) / P.length, P.reduce((t, q) => t + q[1], 0) / P.length]; etiket(sayi(m2, 2) + ' m² · çevre ' + yazOlcu(D.uzunluk([...n.p, n.p[0]]) * birimM()), c2); } break; }
        case 'aci': cizgi(P); if (n.p.length === 3){ const [a, b, c] = n.p, a1 = Math.atan2(a[1] - b[1], a[0] - b[0]), a2 = Math.atan2(c[1] - b[1], c[0] - b[0]); let derece = Math.abs((a2 - a1) * 180 / Math.PI); if (derece > 180) derece = 360 - derece; etiket(sayi(derece, 1) + '°', P[1]); } break;
        case 'kalem': cizgi(P); break;
        case 'cizgi': cizgi(P); break;
        case 'dikdortgen': if (P.length === 2){ const [a, b] = P; cx.strokeRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); } break;
        case 'daire': if (P.length === 2){ cx.beginPath(); cx.arc(P[0][0], P[0][1], Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]), 0, 7); cx.stroke(); } break;
        case 'ok': if (P.length === 2){ cizgi(P); const [a, b] = P, t = Math.atan2(b[1] - a[1], b[0] - a[0]), u = 14 + (n.kalin || 3) * 2; cx.beginPath(); cx.moveTo(b[0], b[1]); cx.lineTo(b[0] - u * Math.cos(t - .4), b[1] - u * Math.sin(t - .4)); cx.lineTo(b[0] - u * Math.cos(t + .4), b[1] - u * Math.sin(t + .4)); cx.closePath(); cx.fill(); } break;
        case 'bulut': if (P.length === 2){ const [a, b] = P, x1 = Math.min(a[0], b[0]), x2 = Math.max(a[0], b[0]), y1 = Math.min(a[1], b[1]), y2 = Math.max(a[1], b[1]), r = 12; cx.beginPath();
          for (let x = x1; x < x2; x += r * 2) cx.arc(Math.min(x + r, x2 - r), y1, r, Math.PI, 0); for (let y = y1; y < y2; y += r * 2) cx.arc(x2, Math.min(y + r, y2 - r), r, -Math.PI / 2, Math.PI / 2);
          for (let x = x2; x > x1; x -= r * 2) cx.arc(Math.max(x - r, x1 + r), y2, r, 0, Math.PI); for (let y = y2; y > y1; y -= r * 2) cx.arc(x1, Math.max(y - r, y1 + r), r, Math.PI / 2, Math.PI * 1.5); cx.stroke(); } break;
        case 'boyut': if (P.length === 2){ const [a, b] = P, t = Math.atan2(b[1] - a[1], b[0] - a[0]), nx = -Math.sin(t) * 8, ny = Math.cos(t) * 8; cx.lineWidth = 1.5; cizgi(P);
          [a, b].forEach(q => { cx.beginPath(); cx.moveTo(q[0] - nx, q[1] - ny); cx.lineTo(q[0] + nx, q[1] + ny); cx.stroke(); }); etiket(yazOlcu(D.uzunluk(n.p) * birimM()), orta(P)); } break;
        case 'yazi': if (P.length){ cx.font = `700 ${Math.max(10, (n.boy || 16) * (n.olcek ? g.s / n.olcek : 1))}px system-ui`; cx.textBaseline = 'middle'; cx.fillText(n.t, P[0][0], P[0][1]); } break;
      }
      cx.restore();
    };
    let cizBekle = false;
    function ciz(){ if (cizBekle || !g) return; cizBekle = true; requestAnimationFrame(() => { cizBekle = false;
      cx.save(); cx.setTransform(1, 0, 0, 1, 0, 0); cx.fillStyle = '#000'; cx.fillRect(0, 0, tv.width, tv.height); cx.restore();
      cizimiCiz(cx, d, g, W, H, gizli, false);
      for (const n of notlar) notCiz(n);
      if (S.nokta.length) notCiz({tur: S.arac === 'olcek' ? 'uzunluk' : S.arac, p: S.nokta, renk: S.arac === 'olcek' ? '#34c759' : S.renk, kalin: S.kalin}, true);
      if (S.pencere){ const [a, b] = S.pencere; cx.save(); cx.strokeStyle = '#2ec4c4'; cx.setLineDash([6, 4]); cx.strokeRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); cx.restore(); }
      dugmeler();
    }); }
    const dugmeler = () => { kap.querySelector('[data-i="geri"]').disabled = !geriY.length; kap.querySelector('[data-i="ileri"]').disabled = !ileriY.length; kap.querySelector('[data-i="kaydet"]').classList.toggle('on', S.degisti); };
    const ekle = n => { notlar.push(n); geriY.push({tur: 'ekle', n}); ileriY.length = 0; S.degisti = true; ciz(); };
    const bitir = () => {
      if (S.arac === 'guzergah' && S.nokta.length > 1) ekle({tur: 'guzergah', p: S.nokta, renk: S.renk, kalin: S.kalin});
      if (S.arac === 'alan' && S.nokta.length > 2) ekle({tur: 'alan', p: S.nokta, renk: S.renk, kalin: S.kalin});
      S.nokta = []; bilgi(''); ciz();
    };
    const IKI = {uzunluk: 1, ok: 1, bulut: 1, cizgi: 1, dikdortgen: 1, daire: 1, boyut: 1};
    const dokun = q => {
      const t = S.arac; if (t === 'kaydir' || t === 'kalem') return;
      if (t === 'sil'){ const s = [...notlar].reverse().find(n => n.p.some(p2 => { const [a, b] = ekr(p2), [c, e] = ekr(q); return Math.hypot(a - c, b - e) < 24; })); if (s){ notlar.splice(notlar.indexOf(s), 1); geriY.push({tur: 'sil', n: s}); ileriY.length = 0; S.degisti = true; ciz(); } return; }
      if (t === 'yazi') return perde(`<h2>Yazı ekle</h2><input id="yT" placeholder="Not yaz"><div class="yanyana"><button class="dugme tam" id="yE">Ekle</button></div>`, (pp, k2) => { setTimeout(() => pp.querySelector('#yT').focus(), 50); pp.querySelector('#yE').onclick = () => { const v2 = pp.querySelector('#yT').value.trim(); k2(); if (v2) ekle({tur: 'yazi', p: [q], t: v2, renk: S.renk, boy: 16, olcek: g.s}); }; });
      if (t !== 'kalem'){ const y = D.yapis(uclar, q[0], q[1], 16 / g.s); if (y) q = y; }
      S.nokta.push(q);
      if (t === 'olcek' && S.nokta.length === 2){ const ham = D.uzunluk(S.nokta) * (D.METRE[S.birim] || .001); const nk = S.nokta; S.nokta = []; ciz();
        return perde(`<h2>Ölçek ayarla</h2><p class="alt-baslik">Seçtiğin iki nokta arası çizimde ${sayi(ham, 3)} m görünüyor. Gerçekte kaç metre?</p><label>Gerçek uzunluk (m)</label><input id="gr" type="number" step="0.01" inputmode="decimal">
          <label>Çizim birimi</label><select id="br">${[[4, 'mm'], [5, 'cm'], [6, 'm']].map(([k, a2]) => `<option value="${k}" ${k === S.birim ? 'selected' : ''}>${a2}</option>`).join('')}</select>
          <div class="yanyana"><button class="dugme" id="gO">Ayarla</button><button class="dugme ikincil" id="gS">Sıfırla</button></div>`, (pp, k2) => {
          pp.querySelector('#br').onchange = e => { S.birim = +e.target.value; S.kal = 1; S.degisti = true; ciz(); };
          pp.querySelector('#gO').onclick = () => { const gr = parseFloat(pp.querySelector('#gr').value.replace(',', '.')); const h2 = D.uzunluk(nk) * (D.METRE[S.birim] || .001); if (!gr || !h2) return toast('Uzunluk yazın'); S.kal = gr / h2; S.degisti = true; k2(); aracSec('uzunluk'); toast('Ölçek ayarlandı'); };
          pp.querySelector('#gS').onclick = () => { S.kal = 1; S.degisti = true; k2(); ciz(); };
        }); }
      if (IKI[t] && S.nokta.length === 2){ ekle({tur: t, p: S.nokta, renk: S.renk, kalin: S.kalin}); S.nokta = []; }
      if (t === 'aci' && S.nokta.length === 3){ ekle({tur: 'aci', p: S.nokta, renk: S.renk, kalin: S.kalin}); S.nokta = []; }
      if (t === 'guzergah' || t === 'alan'){ const L = t === 'alan' && S.nokta.length > 2 ? sayi(D.alan(S.nokta) * birimM() ** 2, 2) + ' m²' : yazOlcu(D.uzunluk(S.nokta) * birimM()); bilgi(`${L} — bitirmek için ✓`); }
      ciz();
    };

    /* dokunma: tek parmak araç / kaydırma, iki parmak yakınlaştırma */
    const ptr = new Map(); let sur = null, iki = null, kalemN = null;
    const yer = e => { const r = tv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    tv.addEventListener('pointerdown', e => { tv.setPointerCapture(e.pointerId); const q = yer(e); ptr.set(e.pointerId, q);
      if (ptr.size === 1){ sur = {q, ox: g.ox, oy: g.oy, oyn: false};
        if (S.arac === 'kalem'){ kalemN = {tur: 'kalem', p: [dun(...q)], renk: S.renk, kalin: S.kalin}; notlar.push(kalemN); }
        if (S.arac === 'pencere') S.pencere = [q, q]; }
      else if (ptr.size === 2){ if (kalemN){ notlar.splice(notlar.indexOf(kalemN), 1); kalemN = null; } const [a, b] = [...ptr.values()]; iki = {d: Math.hypot(a[0] - b[0], a[1] - b[1]), s: g.s, m: dun((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)}; sur = null; S.pencere = null; } });
    tv.addEventListener('pointermove', e => { if (!ptr.has(e.pointerId)) return; const q = yer(e); ptr.set(e.pointerId, q);
      if (iki && ptr.size === 2){ const [a, b] = [...ptr.values()], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; g.s = Math.max(1e-9, iki.s * Math.hypot(a[0] - b[0], a[1] - b[1]) / (iki.d || 1)); g.ox = mx - iki.m[0] * g.s; g.oy = my + iki.m[1] * g.s; ciz(); return; }
      if (!sur) return; const dx = q[0] - sur.q[0], dy = q[1] - sur.q[1]; if (Math.hypot(dx, dy) > 8) sur.oyn = true;
      if (kalemN){ kalemN.p.push(dun(...q)); ciz(); return; }
      if (S.pencere){ S.pencere[1] = q; ciz(); return; }
      if (sur.oyn){ g.ox = sur.ox + dx; g.oy = sur.oy + dy; ciz(); } });
    const birak = e => { const q = yer(e); ptr.delete(e.pointerId); if (ptr.size < 2) iki = null;
      if (kalemN){ if (kalemN.p.length > 1){ geriY.push({tur: 'ekle', n: kalemN}); ileriY.length = 0; S.degisti = true; } else notlar.splice(notlar.indexOf(kalemN), 1); kalemN = null; ciz(); }
      else if (S.pencere){ const [a, b] = S.pencere; S.pencere = null; if (Math.abs(b[0] - a[0]) > 20 && Math.abs(b[1] - a[1]) > 20){ const w1 = dun(Math.min(a[0], b[0]), Math.min(a[1], b[1])), w2 = dun(Math.max(a[0], b[0]), Math.max(a[1], b[1])); g = gorunumSigdir({sinir: [w1[0], w2[1], w2[0], w1[1]]}, W, H); } aracSec('kaydir'); ciz(); }
      else if (sur && !sur.oyn) dokun(dun(...q));
      if (!ptr.size) sur = null; };
    tv.addEventListener('pointerup', birak);
    tv.addEventListener('pointercancel', e => { ptr.delete(e.pointerId); sur = null; iki = null; });
    tv.addEventListener('wheel', e => { e.preventDefault(); const q = yer(e), k = e.deltaY < 0 ? 1.25 : 1 / 1.25, m = dun(...q); g.s *= k; g.ox = q[0] - m[0] * g.s; g.oy = q[1] + m[1] * g.s; ciz(); }, {passive: false});

    /* üst düğmeler */
    const kaydet = async (sessiz) => { v.notlar = notlar; v.kal = S.kal; v.d.birim = S.birim; await VT.veriKoy(v); S.degisti = false; dugmeler(); if (!sessiz) toast('Kaydedildi'); Reklam.islem(); };
    const kapat = () => { if (S.degisti) kaydet(true); window.removeEventListener('resize', boyut); kap.remove(); geriKanca = null; projeler(); };
    const geriAl = () => { const s = geriY.pop(); if (!s) return; if (s.tur === 'ekle') notlar.splice(notlar.indexOf(s.n), 1); else notlar.push(s.n); ileriY.push(s); S.degisti = true; ciz(); };
    const ileriAl = () => { const s = ileriY.pop(); if (!s) return; if (s.tur === 'ekle') notlar.push(s.n); else notlar.splice(notlar.indexOf(s.n), 1); geriY.push(s); S.degisti = true; ciz(); };
    const disaAktar = async tur => {
      const yuk = 2400, oran = W / H, cw = oran >= 1 ? yuk : Math.round(yuk * oran), ch = oran >= 1 ? Math.round(yuk / oran) : yuk;
      const c2 = document.createElement('canvas'); c2.width = cw; c2.height = ch; const x2 = c2.getContext('2d'); x2.fillStyle = '#000'; x2.fillRect(0, 0, cw, ch);
      const k = cw / W, g2 = {s: g.s * k, ox: g.ox * k, oy: g.oy * k};
      cizimiCiz(x2, d, g2, cw, ch, gizli, false);
      const eskiCx = cx, eskiG = g; // notları da aynı ölçekle çiz
      const ekr2 = ([X, Y]) => [X * g2.s + g2.ox, -Y * g2.s + g2.oy];
      x2.save(); x2.scale(1, 1); for (const n of notlar){ x2.save(); x2.strokeStyle = x2.fillStyle = n.renk; x2.lineWidth = (n.kalin || 3) * k; x2.lineCap = x2.lineJoin = 'round'; const P2 = n.p.map(ekr2);
        if (['uzunluk', 'guzergah', 'kalem', 'cizgi', 'aci', 'ok', 'boyut', 'alan'].includes(n.tur)){ x2.beginPath(); P2.forEach((q, i) => i ? x2.lineTo(q[0], q[1]) : x2.moveTo(q[0], q[1])); if (n.tur === 'alan') x2.closePath(); x2.stroke(); }
        if (n.tur === 'dikdortgen' || n.tur === 'bulut'){ const [a, b] = P2; x2.strokeRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); }
        if (n.tur === 'daire'){ x2.beginPath(); x2.arc(P2[0][0], P2[0][1], Math.hypot(P2[1][0] - P2[0][0], P2[1][1] - P2[0][1]), 0, 7); x2.stroke(); }
        const et = n.tur === 'uzunluk' || n.tur === 'guzergah' || n.tur === 'boyut' ? yazOlcu(D.uzunluk(n.p) * birimM()) : n.tur === 'alan' ? sayi(D.alan(n.p) * birimM() ** 2, 2) + ' m²' : n.tur === 'yazi' ? n.t : '';
        if (et){ x2.font = `700 ${16 * k}px system-ui`; x2.fillText(et, P2[P2.length - 1][0] + 6 * k, P2[P2.length - 1][1] - 6 * k); }
        x2.restore(); } x2.restore();
      const url = c2.toDataURL('image/jpeg', .9), ad = p.ad.replace(/[\\/:*?"<>|]/g, '-');
      const bayt = u => { const b = atob(u.split(',')[1]), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
      const veri = tur === 'pdf' ? T.pdfYap([{jpeg: bayt(url), w: cw, h: ch}]) : bayt(url);
      const isim = ad + (tur === 'pdf' ? '.pdf' : '.jpg'), mime = tur === 'pdf' ? 'application/pdf' : 'image/jpeg';
      if (window.EMNative && window.EMNative.call){ let s = ''; for (let i = 0; i < veri.length; i += 32768) s += String.fromCharCode(...veri.subarray(i, i + 32768)); try { await window.EMNative.call({action: 'shareFile', name: isim, mime, base64: btoa(s)}); } catch(e){ toast('Paylaşılamadı'); } }
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([veri], {type: mime})); a.download = isim; a.click(); }
      Reklam.islem();
    };
    kap.querySelectorAll('.cz-d').forEach(b => b.onclick = () => {
      const i = b.dataset.i;
      if (i === 'kapat') return kapat();
      if (i === 'kaydet') return kaydet();
      if (i === 'geri') return geriAl();
      if (i === 'ileri') return ileriAl();
      if (i === 'sigdir'){ g = gorunumSigdir(d, W, H); return ciz(); }
      if (i === 'pencere'){ S.arac = 'pencere'; bilgi('Yakınlaştırılacak alanı parmağınla çerçevele', 2500); return; }
      if (i === 'tam'){ kap.classList.toggle('tam'); setTimeout(boyut, 30); return; }
      if (i === 'daha') return perde(`<h2>${kacis(p.ad)}</h2><div class="secenekler" style="grid-template-columns:1fr"><button data-m="pdf">PDF olarak paylaş</button><button data-m="jpg">Resim olarak paylaş</button><button data-m="fav">${p.fav ? '☆ Favorilerden çıkar' : '★ Favorilere ekle'}</button><button data-m="temizle" style="color:var(--kotu)">Bütün notları sil</button></div>
        <div class="not">Ölçüm birimi: ${D.BIRIM[S.birim] || 'mm'}${S.kal !== 1 ? ' · ölçek düzeltildi' : ''}</div>`, (pp, k2) => {
        pp.querySelectorAll('[data-m]').forEach(x => x.onclick = async () => { k2(); const m = x.dataset.m;
          if (m === 'pdf' || m === 'jpg') return disaAktar(m);
          if (m === 'fav'){ p.fav = !p.fav; await VT.ozet(p); toast(p.fav ? 'Favorilere eklendi' : 'Favorilerden çıkarıldı'); }
          if (m === 'temizle'){ if (!notlar.length) return; geriY.push(...notlar.map(n => ({tur: 'sil', n}))); notlar.length = 0; S.degisti = true; ciz(); } }); });
    });
    geriKanca = () => { if (kap.classList.contains('tam')){ kap.classList.remove('tam'); setTimeout(boyut, 30); return true; } if (S.nokta.length){ S.nokta = []; bilgi(''); ciz(); return true; } kapat(); return true; };
    window.addEventListener('resize', boyut);
    // ilk kurulum
    altCiz();
    requestAnimationFrame(boyut);
    toast(`${d.katmanlar.length} katman · ${d.cizgiler.length.toLocaleString('tr-TR')} çizgi`);
  }

  let geriKanca = null;
  // telefonun "HızırUsta ile aç" özelliği: yerli kabuk dosyayı base64 olarak verir
  window.__dosyaAc = (ad, b64) => { try { const b = atob(b64), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); const k = document.getElementById('cizici'); if (k) k.remove(); geriKanca = null; projeler().then(() => ice(new File([a], ad))); } catch(e){ toast('Dosya açılamadı'); } };
  return {projeler, geri: () => geriKanca ? geriKanca() : false};
}

/* ---------- simgeler ---------- */
const s = (d, ek = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${ek}>${d}</svg>`;
const IKON = {
  kapat: s('<path d="M6 6l12 12M18 6L6 18"/>'), kaydet: s('<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>'),
  geri: s('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'), ileri: s('<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>'),
  pencere: s('<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5M8 9V8h1M14 9V8h-1M8 13v1h1M14 13v1h-1"/>'), sigdir: s('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  tam: s('<path d="M8 3H3v5M21 8V3h-5M3 16v5h5M16 21h5v-5"/>'), daha: s('<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>'),
  sol: s('<path d="M15 18l-6-6 6-6"/>'), tamam: s('<path d="M5 12l5 5L20 7"/>'), goz: s('<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>'), gozk: s('<path d="M3 3l18 18M10.6 5.1A10.7 10.7 0 0 1 12 5c7 0 11 7 11 7a18 18 0 0 1-3.2 4M6.6 6.6A18 18 0 0 0 1 12s4 7 11 7a10 10 0 0 0 5.4-1.6"/>'),
  k_olcum: s('<rect x="2" y="7" width="20" height="10" rx="2"/><path d="M6 7v4M10 7v3M14 7v4M18 7v3"/>'), k_aciklama: s('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 13h5"/>'),
  k_ciz: s('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'), k_katman: s('<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>'),
  k_renk: s('<circle cx="12" cy="12" r="10"/><circle cx="8" cy="9" r="1.5" fill="currentColor"/><circle cx="15" cy="8" r="1.5" fill="currentColor"/><circle cx="16.5" cy="14" r="1.5" fill="currentColor"/>'),
  a_kaydir: s('<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>'), a_uzunluk: s('<path d="M3 12h18M3 8v8M21 8v8"/>'),
  a_guzergah: s('<circle cx="5" cy="18" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="19" cy="16" r="2"/><path d="M6.5 16.5l4-9M13.5 7.5l4.5 7"/>'), a_alan: s('<path d="M4 20L7 4l13 4-3 12z"/>'),
  a_aci: s('<path d="M4 20h16M4 20L16 6"/><path d="M10 20a6 6 0 0 0-2-4.5"/>'), a_olcek: s('<path d="M12 3v18M5 7h14M5 7l-3 7a4 4 0 0 0 6 0zM19 7l-3 7a4 4 0 0 0 6 0z"/>'),
  a_aktar: s('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'), a_kalem: s('<path d="M3 17c3-3 5 3 8 0s3-7 6-7 3 4 4 4"/>'), a_yazi: s('<path d="M4 6V4h16v2M9 20h6M12 4v16"/>'),
  a_ok: s('<path d="M5 19L19 5M10 5h9v9"/>'), a_bulut: s('<path d="M7 18a4 4 0 0 1-.5-8A5 5 0 0 1 16 8a4 4 0 0 1 1 8z"/>'), a_sil: s('<path d="M20 20H8l-5-5 10-10 8 8-6 7"/><path d="M6 12l7 7"/>'),
  a_cizgi: s('<path d="M4 20L20 4"/>'), a_dikdortgen: s('<rect x="3" y="6" width="18" height="12" rx="1"/>'), a_daire: s('<circle cx="12" cy="12" r="8"/>'), a_boyut: s('<path d="M3 12h18M3 8v8M21 8v8M7 10l-4 2 4 2M17 10l4 2-4 2"/>')
};
