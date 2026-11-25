import test from 'node:test';
import assert from 'node:assert/strict';
import * as H from '../public/hesap.mjs';
const yak = (a, b, t = 0.02) => assert.ok(Math.abs(a - b) <= t, `${a} ≈ ${b}`);
test('akım', () => { yak(H.akim({P: 2300}).I, 10); yak(H.akim({P: 10000, faz: 'tri', cos: .85}).I, 16.98); });
test('gerilim düşümü', () => { yak(H.gerilimDusumu({P: 3000, L: 20, S: 2.5}).yuzde, 1.62); yak(H.gerilimDusumu({P: 20000, L: 50, S: 6, faz: 'tri'}).yuzde, 1.86); });
test('kesit seçimi', () => {
  const a = H.kesitSec({P: 3000, L: 20}); assert.equal(a.S, 2.5); assert.equal(a.In, 16);
  const b = H.kesitSec({P: 3000, L: 80}); assert.ok(b.S > 2.5, 'uzun hatta düşüm kesiti büyütür'); assert.ok(b.dusum <= 3);
  const c = H.kesitSec({P: 1000, L: 15, devreTuru: 'aydinlatma'}); assert.equal(c.S, 1.5);
  const d = H.kesitSec({P: 20000, L: 30, faz: 'tri', cos: .85, yontem: 'C', sicaklik: 40, devre: 3}); assert.ok(d.ok && d.In >= d.Ib && d.In <= d.Iz);
  assert.equal(H.kesitSec({P: 500000, L: 10}).ok, false);
});
test('katsayılar', () => { assert.equal(H.sicaklikKatsayisi(30), 1); assert.equal(H.sicaklikKatsayisi(38), .87); assert.equal(H.grupKatsayisi(3), .7); assert.equal(H.grupKatsayisi(10), .45); });
test('kompanzasyon', () => { yak(H.kompanzasyon({P: 100, cos1: .8}).Q, 54.69); assert.equal(H.kompanzasyon({P: 10, cos1: .99}).Q, 0); });
test('topraklama', () => { yak(H.topraklama({rho: 100}).R1, 60.5, .1); assert.equal(H.kacakAkimSiniri(30), 1667); });
test('ohm', () => { assert.deepEqual(H.ohm({U: 230, I: 10}), {U: 230, I: 10, R: 23, P: 2300}); yak(H.ohm({P: 2300, U: 230}).R, 23); });
test('teklif', () => { const t = H.teklifToplam([{miktar: 2, fiyat: 100}, {miktar: 1, fiyat: 50}], {iskonto: 10, kdv: 20}); assert.deepEqual(t, {ara: 250, iskonto: 25, matrah: 225, kdv: 45, toplam: 270}); });
