// Kullanım: node render.mjs <sayfa> <genişlik> <yükseklik> <süre_sn> <çıktı_klasörü> [kareler: "1,5,9" yalnız seçili saniyeler]
import { chromium } from 'playwright'; import fs from 'node:fs';
const [page, w, h, dur, out, only] = process.argv.slice(2); fs.mkdirSync(out, {recursive: true});
const b = await chromium.launch({args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']});
const p = await b.newPage({viewport: {width: +w, height: +h}});
p.on('console', m => console.log('sayfa:', m.text())); p.on('pageerror', e => console.log('HATA:', e.message));
await p.goto(`http://localhost:8000/promo-anim/${page}?w=${w}&h=${h}`); await p.waitForFunction('window.READY === true', null, {timeout: 180000});
const times = only ? only.split(',').map(Number) : Array.from({length: Math.round(+dur * 30)}, (_, i) => i / 30);
let i = 0; const t0 = Date.now();
for (const t of times){
  const data = await p.evaluate(t => { renderAt(t); return document.querySelector('canvas').toDataURL('image/jpeg', .92); }, t);
  fs.writeFileSync(`${out}/${only ? 't' + t : String(i).padStart(5, '0')}.jpg`, Buffer.from(data.split(',')[1], 'base64')); i++;
  if (i % 60 === 0) console.log(i, 'kare', ((Date.now() - t0) / i | 0), 'ms/kare');
}
await b.close();
