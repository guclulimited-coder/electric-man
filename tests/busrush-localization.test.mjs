import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import previewWorker from './fixtures/busrush-preview-worker.mjs';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const html=readFileSync('public/busrush-test/index.html','utf8');
const catalog=readFileSync('public/busrush-test/locale-en.js','utf8');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const game=scripts.find(s=>s.includes('const RushLocale='));
function locale(){const c={window:{},navigator:{languages:['en-US']},document:{documentElement:{}}};vm.createContext(c);vm.runInContext(catalog,c);vm.runInContext(game.slice(game.indexOf('const RushLocale='),game.indexOf('/* Original Bus Rush'))+';this.L=RushLocale;',c);return c;}
const c=locale(),L=c.L;
test('all actual game scripts compile and the reviewed catalog is embedded exactly',()=>{for(const code of scripts)new vm.Script(code);assert.equal(scripts.find(s=>s.includes('window.RushEnglish =')).trim(),catalog.trim());});
test('primary device language defaults to Turkish or English; explicit choice wins',()=>{for(const [tags,expected] of [[['tr-TR'],'tr'],[['TR_tr'],'tr'],[['en-US','tr-TR'],'en'],[['de-DE'],'en'],[['fr-TR'],'en'],[['tr','en'],'tr'],[[],'en'],[[null,'en-US'],'en']])assert.equal(L.resolve('auto',tags),expected);for(const language of ['tr','en','de','fr'])assert.equal(L.resolve(language,['en-US']),language);assert.equal(L.resolve('__proto__',['en-US']),'en');});
test('every catalog entry has an English translation and Turkish remains byte-identical',()=>{for(const [tr,en] of Object.entries(c.window.RushEnglish)){assert.ok(en.length>0,tr);assert.equal(L.translate(tr,'tr'),tr);}for(let level=1;level<=360;level++){assert.equal(L.translate('BÖLÜM '+level,'en'),'LEVEL '+level);assert.equal(L.translate('Bölüm '+level+' tamamlandı.','en'),'Level '+level+' complete.');}});
test('dynamic bays, passengers, gate and accessibility labels preserve game numbers',()=>{for(const [tr,en] of [
 ['DIŞARIDA 113 YOLCU','113 WAITING'],['KAVŞAKTA 80 / 80','IN LOOP 80 / 80'],['+1 PERON','+1 BAY'],
 ['Kapı için önce 12 numaralı aracı çıkar.','Dispatch bus 12 first to open the gate.'],['Bu çıkış 7 araç çıktıktan sonra açılır.','This exit opens after 7 buses leave.'],
 ['Kilitli Mercan 40 kişilik otobüs, sağ üst, çıkışı açık','Locked Coral bus, 40 seats, up-right, exit clear'],
 ['Okyanus 24 kişilik otobüs, sola, açılması için 3 araç gönderilmeli','Ocean bus, 24 seats, left, dispatch 3 buses to unlock'],
 ['1200 yolcu · 33 otobüs · ★ 33 / ☆ 43','1200 passengers · 33 buses · ★ 33 / ☆ 43'],
 ['Bu aracı sağ alt yönünde çıkar.','Send this bus down-right.'],['Kazandığın 120 altın kadar ek ödül al.','Earn 120 extra gold.']
 ])assert.equal(L.translate(tr,'en'),en);});
test('new daily, weekly, duel, ad and shop labels translate as complete phrases',()=>{for(const tr of ['DÜELLO','HAFTANIN BÖLÜMÜ','Düello bilgisi yüklenemedi. İnternet bağlantını kontrol et.','Maç açık','Daveti kabul et · oyna','Tekrar oyna · süreni geliştir','Peron temaları','Reklamı yeniden yükle','Bekleyen satın almaları kontrol et']){const en=L.translate(tr,'en');assert.notEqual(en,tr);assert.doesNotMatch(en,/[ğĞıİşŞçÇöÖüÜ]/);}assert.equal(L.translate('Hedef: 180 sn · +200 lig puanı','en'),'Target: 180s · +200 league points');assert.equal(L.translate('🔥 Seri: 7 gün','en'),'🔥 Streak: 7 days');assert.equal(L.translate('yeni bulmacaya 5 sa 20 dk','en'),'New puzzle in 5 h 20 m');});
test('switching is reversible and redraws the cached canvas and attributes',()=>{for(let i=0;i<4;i++){L.set('tr');assert.equal(L.translate('Düello'),'Düello');L.set('en');assert.equal(L.translate('Düello'),'Duel');}assert.ok(game.includes("const key=document.documentElement.lang+':'+state.level"));assert.ok(game.includes('originalAttributes=new WeakMap()'));assert.ok(game.includes('characterData:true'));assert.ok(game.includes('updateHUD();updateHits();invalidate();translateDOM();'));assert.ok(game.includes('[translate="no"]'));assert.ok(!game.includes('value="<span'));});
test('game rules, colours, level generation and save functions match the original source',()=>{const before=execFileSync('git',['show','e0b2bb7a9dc1855928f51c894cf8d313efd46cb7:public/busrush-test/index.html'],{maxBuffer:40*1024*1024,encoding:'utf8'});const norm=s=>s.replace(/\r/g,'');const hash=s=>createHash('sha256').update(norm(s)).digest('hex');const between=(s,a,b)=>{assert.ok(s.includes(a)&&s.includes(b));return s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));};
 assert.equal(hash(between(html,'/* Original Bus Rush','const palette=')),hash(between(before,'/* Original Bus Rush','const palette='))); 
 for(const marker of ['const palette=','const skins=','const BAYS16=']){const declaration=s=>s.slice(s.indexOf(marker),s.indexOf(';',s.indexOf(marker))+1);assert.ok(html.includes(marker),marker);assert.equal(hash(declaration(html)),hash(declaration(before)),marker);}
 for(const name of ['resetProgress','resetProgress13','save','buyGoldHelper','queueLeagueWin','startSpecial16']){const marker='function '+name+'(';if(!game.includes(marker))continue;const oldScripts=[...before.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);const original=oldScripts.find(s=>s.includes('const RushLocale='));const source=s=>s.slice(s.indexOf(marker)).split('\n')[0];assert.equal(norm(source(game)),norm(source(original)),name);}
});

test('preview APIs use synthetic fixtures and reject every write without a database',async()=>{const env={ASSETS:{fetch:()=>new Response('static')}};for(const path of ['/progress','/league/clear','/match','/profile','/delete-account']){const r=await previewWorker.fetch(new Request('https://preview.test/api/bus-rush'+path,{method:'POST',body:'{}'}),env);assert.equal(r.status,403);assert.equal((await r.json()).error,'PREVIEW_READ_ONLY');}const r=await previewWorker.fetch(new Request('https://preview.test/api/bus-rush/me'),env);assert.equal((await r.json()).player.id,'localization-preview');});
