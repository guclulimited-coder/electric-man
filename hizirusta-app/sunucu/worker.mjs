// HızırUsta DWG çevirici (Cloudflare Worker, 26 Kasım 2026).
// POST /cevir : gövde = DWG dosyası (en fazla 40 MB). Yanıt: uygulamanın çizim verisi (JSON). Dosya hiçbir yere kaydedilmez.
// Çevirici LibreDWG (GPLv3) WebAssembly; yalnız bu sunucuda çalışır, uygulamaya dağıtılmaz. Kaynak: https://github.com/LibreDWG/libredwg
import wasmModul from './dwg2dxf.wasm';
import DwgCevir from './dwg2dxf.mjs';
import {dxfOku} from './dxf.mjs';

const CORS = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-HU'};
const yanit = (veri, durum = 200) => new Response(typeof veri === 'string' ? veri : JSON.stringify(veri), {status: durum, headers: {...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}});
const yuvarla = x => Math.round(x * 1000) / 1000;

export default {
  async fetch(req){
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, {headers: CORS});
    if (url.pathname === '/') return new Response('HızırUsta DWG çevirici. Kaynak: https://github.com/LibreDWG/libredwg (GPLv3)', {headers: {'Content-Type': 'text/plain; charset=utf-8'}});
    if (url.pathname !== '/cevir' || req.method !== 'POST') return yanit({hata: 'YOL'}, 404);
    if (req.headers.get('X-HU') !== '1') return yanit({hata: 'ISTEMCI'}, 403);
    const veri = new Uint8Array(await req.arrayBuffer());
    if (veri.length < 64 || veri.length > 40 * 1024 * 1024) return yanit({hata: 'BOYUT'}, 413);
    const imza = String.fromCharCode(...veri.subarray(0, 6));
    if (!/^AC10(1[2-9]|2[0-9]|3[0-9])$/.test(imza)) return yanit({hata: 'DWG_DEGIL', imza}, 415);
    const t0 = Date.now(), gunluk = [];
    let m;
    try {
      m = await DwgCevir({print: () => {}, printErr: x => { if (gunluk.length < 20) gunluk.push(String(x)); },
        instantiateWasm(imports, tamam){ WebAssembly.instantiate(wasmModul, imports).then(i => tamam(i)); return {}; }});
      m.FS.writeFile('/g.dwg', veri);
      const kod = m.callMain(['-y', '-o', '/c.dxf', '/g.dwg']);
      let dxf;
      try { dxf = m.FS.readFile('/c.dxf', {encoding: 'utf8'}); } catch(e){ return yanit({hata: 'CEVRILEMEDI', kod, gunluk: gunluk.slice(0, 5)}, 422); }
      const d = dxfOku(dxf);
      const out = {surum: 2, imza, birim: d.birim, katmanlar: d.katmanlar, katmanBilgi: d.katmanBilgi, sinir: d.sinir,
        cizgiler: d.cizgiler.map(c => ({k: c.k, r: c.r, p: c.p.map(q => [yuvarla(q[0]), yuvarla(q[1])]), ...(c.kapali ? {kapali: 1} : {}), ...(c.merkez ? {merkez: [yuvarla(c.merkez[0]), yuvarla(c.merkez[1])]} : {})})),
        yazilar: d.yazilar.map(y => ({k: y.k, r: y.r, x: yuvarla(y.x), y: yuvarla(y.y), h: yuvarla(y.h), t: y.t, a: Math.round(y.a * 100) / 100, ha: y.ha || 0, va: y.va || 0})),
        sure: Date.now() - t0};
      return yanit(out);
    } catch(e){
      return yanit({hata: 'SUNUCU', ileti: String(e && e.message || e).slice(0, 200), gunluk: gunluk.slice(0, 5)}, 500);
    }
  }
};
