// Tarayıcı oyun siteleri ve Telegram için yüklenecek paketi hazırlar — 22 Kasım 2026.
// Telefon paketini (bundle-native) temel alır; site/Telegram reklam betiğini ve TSNX_PORTAL işaretini ekler, kendi internet reklamlarımızı çıkarır.
// Kullanım: node scripts/bundle-portal.mjs <çıkışKlasörü> [hunter] [--site=crazygames|gamedistribution|telegram] [--gd=OYUN_KIMLIGI] [--adsgram=BLOK]
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync, copyFileSync} from 'node:fs';
import {join} from 'node:path';
const root = new URL('..', import.meta.url).pathname;
const args = process.argv.slice(2), out = args.find(a => !a.startsWith('--') && a !== 'hunter'), HUNTER = args.includes('hunter');
const opt = k => (args.find(a => a.startsWith('--' + k + '=')) || '').split('=').slice(1).join('=');
const SITE = opt('site') || 'crazygames';
if (!out || !['crazygames', 'gamedistribution', 'telegram'].includes(SITE)) { console.error('kullanım: bundle-portal.mjs <çıkış> [hunter] [--site=crazygames|gamedistribution|telegram]'); process.exit(1); }
execFileSync(process.execPath, [join(root, 'scripts/bundle-native.mjs'), out, ...(HUNTER ? ['hunter'] : [])], {stdio: 'inherit', env: process.env});
copyFileSync(join(root, 'public/portal.js'), join(out, 'portal.js'));
let html = readFileSync(join(out, 'index.html'), 'utf8');
const q = s => JSON.stringify(String(s));
const HEAD = {
  crazygames: '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>\n',
  gamedistribution: `<script>window.TSNX_GD_ID = ${q(opt('gd'))};window.GD_OPTIONS = {gameId: window.TSNX_GD_ID, onEvent: function(e){ if (window.Portal) window.Portal.gdEvent(e); }};</script>\n` +
    '<script src="https://html5.api.gamedistribution.com/main.min.js"></script>\n',
  telegram: `<script>window.TSNX_ADSGRAM_BLOCK = ${q(opt('adsgram'))};</script>\n<script src="https://telegram.org/js/telegram-web-app.js"></script>\n<script src="https://sad.adsgram.ai/js/sad.min.js"></script>\n`
}[SITE];
if (SITE === 'gamedistribution' && !opt('gd')) console.warn('uyarı: --gd verilmedi; GameDistribution oyun kimliği panelden alınınca yeniden paketleyin');
if (SITE === 'telegram' && !opt('adsgram')) console.warn('uyarı: --adsgram verilmedi; reklamlar kapalı kalır');
const SDK = `<script>window.TSNX_PORTAL = ${q(SITE)};</script>\n` + HEAD;
const webads = HUNTER ? '<script src="../webads.js"></script>\n' : '<script src="webads.js"></script>\n';
const portal = HUNTER ? '<script src="../portal.js"></script>' : '<script src="portal.js"></script>';
if (!html.includes(webads) || !html.includes(portal)) throw new Error('index.html içinde reklam betikleri bulunamadı');
html = html.replace(webads, '').replace(portal, SDK + '<script src="portal.js"></script>');
writeFileSync(join(out, 'index.html'), html);
console.log(`portal paketi hazır (${SITE}):`, out);
