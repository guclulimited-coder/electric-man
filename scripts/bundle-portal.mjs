// Tarayıcı oyun siteleri (CrazyGames) için yüklenecek paketi hazırlar — 22 Kasım 2026.
// Telefon paketini (bundle-native) temel alır; site SDK'sını ve TSNX_PORTAL işaretini ekler, kendi internet reklamlarımızı çıkarır.
// Kullanım: node scripts/bundle-portal.mjs <çıkışKlasörü> [hunter]
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync, copyFileSync} from 'node:fs';
import {join} from 'node:path';
const root = new URL('..', import.meta.url).pathname, out = process.argv[2], HUNTER = process.argv[3] === 'hunter';
if (!out) { console.error('kullanım: bundle-portal.mjs <çıkış> [hunter]'); process.exit(1); }
execFileSync(process.execPath, [join(root, 'scripts/bundle-native.mjs'), out, ...(HUNTER ? ['hunter'] : [])], {stdio: 'inherit', env: process.env});
copyFileSync(join(root, 'public/portal.js'), join(out, 'portal.js'));
let html = readFileSync(join(out, 'index.html'), 'utf8');
const SDK = '<script>window.TSNX_PORTAL = "crazygames";</script>\n<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>\n';
const webads = HUNTER ? '<script src="../webads.js"></script>\n' : '<script src="webads.js"></script>\n';
const portal = HUNTER ? '<script src="../portal.js"></script>' : '<script src="portal.js"></script>';
if (!html.includes(webads) || !html.includes(portal)) throw new Error('index.html içinde reklam betikleri bulunamadı');
html = html.replace(webads, '').replace(portal, SDK + '<script src="portal.js"></script>');
if (/https?:\/\/(play\.google|apps\.apple)\.com/.test(html)) console.warn('uyarı: mağaza bağlantıları kodda duruyor (portal modunda gizlenmeleri gerekir)');
writeFileSync(join(out, 'index.html'), html);
console.log('portal paketi hazır:', out);
