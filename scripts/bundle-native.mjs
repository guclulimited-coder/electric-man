// Builds the offline game bundle that ships inside the Android/iOS apps:
// copies the web game and vendors three.js so the apps do not need a CDN.
// Usage: node scripts/bundle-native.mjs <outDir> [hunter]   (hunter = Electric Hunter, from public/hunter)
import {mkdirSync, cpSync, readFileSync, writeFileSync, rmSync, existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
const root = new URL('..', import.meta.url).pathname, out = process.argv[2], HUNTER = process.argv[3] === 'hunter', SRC = HUNTER ? 'public/hunter' : 'public';
if (!out) { console.error('usage: bundle-native.mjs <outDir>'); process.exit(1); }
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.170.0/';
const VENDOR = ['build/three.module.js', 'examples/jsm/loaders/GLTFLoader.js', 'examples/jsm/utils/SkeletonUtils.js', 'examples/jsm/utils/BufferGeometryUtils.js',
  ...['EffectComposer', 'RenderPass', 'UnrealBloomPass', 'ShaderPass', 'OutputPass', 'Pass', 'MaskPass'].map(n => 'examples/jsm/postprocessing/' + n + '.js'),
  ...['CopyShader', 'LuminosityHighPassShader', 'OutputShader'].map(n => 'examples/jsm/shaders/' + n + '.js')];
if (existsSync(out)) rmSync(out, {recursive: true});
mkdirSync(out, {recursive: true});
const FILES = HUNTER ? ['serhat.txt', 'logo.png', 'favicon.png', 'icon-1024.png', ...['zeynep', 'dilan', 'fahri', 'rasim', 'samet', 'cebrail', 'zulfu', 'huseyin', 'siyar'].map(n => 'boss-' + n + '.txt')] : ['engine.js', 'serhat.txt', 'zeynep.txt', 'icon-192.png', 'icon-512.png'];
for (const f of FILES) cpSync(join(root, SRC, f), join(out, f));
for (const d of HUNTER ? ['i18n'] : ['i18n', 'avatars']) cpSync(join(root, SRC, d), join(out, d), {recursive: true});
for (const f of VENDOR){
  const dest = join(out, 'vendor/three', f);
  mkdirSync(dirname(dest), {recursive: true});
  const local = process.env.THREE_LOCAL && join(process.env.THREE_LOCAL, f);
  let body;
  if (local && existsSync(local)) body = readFileSync(local);
  else { const r = await fetch(CDN + f); if (!r.ok) throw new Error('download failed ' + f); body = Buffer.from(await r.arrayBuffer()); }
  writeFileSync(dest, body);
}
let html = readFileSync(join(root, SRC, 'index.html'), 'utf8');
const n = html.split(CDN).length - 1;
if (n < (HUNTER ? 3 : 4)) throw new Error('expected CDN references in index.html, found ' + n);
html = html.replaceAll(CDN, './vendor/three/');
// vendor the Google Fonts (Bungee, Rubik) when reachable; system fonts are the fallback otherwise
try {
  const m = html.match(/<link rel="stylesheet" href="(https:\/\/fonts\.googleapis\.com\/[^"]+)">/);
  if (m && !process.env.THREE_LOCAL){
    const css = await (await fetch(m[1].replaceAll('&amp;', '&'), {headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'}})).text();
    let i = 0, local = css;
    for (const u of new Set(css.match(/https:\/\/fonts\.gstatic\.com\/[^)]+/g) || [])){
      const name = 'f' + (i++) + '.woff2'; mkdirSync(join(out, 'fonts'), {recursive: true});
      writeFileSync(join(out, 'fonts', name), Buffer.from(await (await fetch(u)).arrayBuffer()));
      local = local.replaceAll(u, name);
    }
    writeFileSync(join(out, 'fonts', 'fonts.css'), local);
    html = html.replace(m[0], '<link rel="stylesheet" href="fonts/fonts.css">').replace('<link rel="preconnect" href="https://fonts.googleapis.com">', '');
    console.log('fonts vendored:', i);
  }
} catch (e){ console.warn('fonts not vendored:', e.message); }
writeFileSync(join(out, 'index.html'), html);
console.log('native bundle ready in', out, '(' + n + ' three.js references vendored)');
