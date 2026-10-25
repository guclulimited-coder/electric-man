// Build only a read-only localization preview. Never deploys or accesses a database.
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
const out=resolve(process.argv[2]||'../../outputs/busrush-i18n-preview');
mkdirSync(out+'/bus-rush',{recursive:true});
copyFileSync('public/busrush-test/index.html',out+'/bus-rush/play.html');
copyFileSync('tests/fixtures/busrush-preview-worker.mjs',out+'/_worker.js');
writeFileSync(out+'/_routes.json',JSON.stringify({version:1,include:['/api/*'],exclude:[]}));
writeFileSync(out+'/_headers','/*\n  X-Robots-Tag: noindex, nofollow\n  Cache-Control: no-store\n');
writeFileSync(out+'/index.html',`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Bus Rush · Language review</title><body style="font:18px system-ui;max-width:850px;margin:40px auto;padding:20px"><h1>Bus Rush · EN / TR dil testi</h1><p>Yalnız test önizlemesi. Canlı oyun ve kayıtlar kullanılmaz. Lig ve düello verileri sentetiktir; sunucu yazmaları kapalıdır.</p><p>Test preview only. League and duel data are synthetic. Server writes are disabled.</p><p><a href="/bus-rush/play.html">Oyunu aç / Open game →</a></p><p>Use the EN/TR button at the top right to switch languages.</p></body></html>`);
console.log('Read-only localization preview ready: '+out);
