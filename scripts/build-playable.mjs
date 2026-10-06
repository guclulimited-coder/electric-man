// Builds the single-file playable ad: native/ads/electricman-playable.html (images inlined, no network).
import {readFileSync, writeFileSync} from 'node:fs';
const b64 = (f, t) => `data:${t};base64,` + readFileSync(f).toString('base64');
const html = readFileSync('native/ads/playable.src.html', 'utf8')
  .replaceAll('__ICON__', b64('public/icon-192.png', 'image/png'))
  .replace('__AVATAR__', b64('public/avatars/serhat.png', 'image/png'));
writeFileSync('native/ads/electricman-playable.html', html);
console.log('playable', (html.length / 1024).toFixed(0) + ' KB');
