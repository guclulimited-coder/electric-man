import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../www/tarama.mjs';
test('homografi köşeleri eşler', () => {
  const src = [[10, 20], [200, 15], [220, 300], [5, 280]], H = T.homografi([[0, 0], [100, 0], [100, 150], [0, 150]], src);
  [[0, 0], [100, 0], [100, 150], [0, 150]].forEach((p, i) => { const [u, v] = T.uygula(H, ...p); assert.ok(Math.abs(u - src[i][0]) < 1e-6 && Math.abs(v - src[i][1]) < 1e-6); });
});
test('kenar bulma: koyu zemin üstünde açık kâğıt', () => {
  const w = 100, h = 80, g = new Uint8Array(w * h).fill(40);
  for (let y = 10; y < 70; y++) for (let x = 20; x < 85; x++) g[y * w + x] = 220;
  const r = T.kenarBul(g, w, h); assert.ok(r.bulundu);
  assert.deepEqual(r.koseler, [[20, 10], [84, 10], [84, 69], [20, 69]]);
  assert.equal(T.kenarBul(new Uint8Array(w * h).fill(200), w, h).bulundu, false);
});
test('pdf yapısı', () => {
  const pdf = T.pdfYap([{jpeg: new Uint8Array([255, 216, 255, 217]), w: 10, h: 14}, {jpeg: new Uint8Array([255, 216, 255, 217]), w: 10, h: 10}]);
  const s = new TextDecoder('latin1').decode(pdf);
  assert.ok(s.startsWith('%PDF-1.4') && s.endsWith('%%EOF')); assert.match(s, /\/Count 2/);
  const xref = +s.match(/startxref\n(\d+)/)[1]; assert.equal(s.slice(xref, xref + 4), 'xref');
  // her nesnenin kayıtlı konumu gerçekten o nesnenin başlangıcı
  const kayit = s.slice(xref).split('\n').slice(3, 3 + 7).map(l => +l.slice(0, 10));
  kayit.forEach((o, i) => assert.ok(s.slice(o).startsWith(`${i + 1} 0 obj`), 'nesne ' + (i + 1)));
});
