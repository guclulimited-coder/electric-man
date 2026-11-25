import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../www/dxf.mjs';
const dxf = parcalar => parcalar.flat().join('\n') + '\n';
const ORNEK = dxf([
  ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC'],
  ['0', 'SECTION', '2', 'BLOCKS', '0', 'BLOCK', '8', '0', '2', 'PRIZ', '10', '0', '20', '0', '0', 'LINE', '8', '0', '10', '0', '20', '0', '11', '100', '21', '0', '0', 'ENDBLK', '0', 'ENDSEC'],
  ['0', 'SECTION', '2', 'ENTITIES',
   '0', 'LINE', '8', 'DUVAR', '10', '0', '20', '0', '11', '5000', '21', '0',
   '0', 'LWPOLYLINE', '8', 'KABLO', '90', '3', '70', '0', '10', '0', '20', '0', '10', '3000', '20', '0', '10', '3000', '20', '4000',
   '0', 'LWPOLYLINE', '8', 'YAY', '90', '2', '70', '0', '10', '0', '20', '0', '42', '1', '10', '2000', '20', '0',
   '0', 'TEXT', '8', 'YAZI', '10', '100', '20', '200', '40', '250', '1', 'SALON',
   '0', 'INSERT', '8', 'PRIZLER', '2', 'PRIZ', '10', '1000', '20', '1000', '41', '2', '42', '2', '50', '90',
   '0', 'ENDSEC', '0', 'EOF']
]);
test('dxf okuma', () => {
  const d = D.dxfOku(ORNEK);
  assert.equal(d.birim, 4); assert.deepEqual(d.katmanlar, ['DUVAR', 'KABLO', 'PRIZLER', 'YAY', 'YAZI']);
  const kablo = d.cizgiler.find(c => c.k === 'KABLO'); assert.equal(D.uzunluk(kablo.p), 7000);
  const yay = d.cizgiler.find(c => c.k === 'YAY'); assert.ok(Math.abs(D.uzunluk(yay.p) - Math.PI * 1000) < 15, 'yarım çember ' + D.uzunluk(yay.p));
  const priz = d.cizgiler.find(c => c.k === 'PRIZLER'); assert.ok(Math.abs(priz.p[1][0] - 1000) < 1e-6 && Math.abs(priz.p[1][1] - 1200) < 1e-6, JSON.stringify(priz.p));
  assert.equal(d.yazilar[0].t, 'SALON');
});
test('dwg uyarısı', () => assert.throws(() => D.dxfOku('AC1032xxxx'), /DWG/));
test('yapışma', () => assert.deepEqual(D.yapis([[0, 0], [10, 10]], 9, 9, 3), [10, 10]));
