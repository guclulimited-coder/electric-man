import test from 'node:test';
import assert from 'node:assert/strict';
import {Radar, bipAraligi} from '../www/radar.mjs';
test('sakin ortamda sessiz', () => { const r = new Radar(); let d; for (let i = 0; i < 100; i++) d = r.ekle(20, 30, 25 + (i % 2) * 0.05); assert.ok(d.hazir && d.guc < 0.08, JSON.stringify(d)); assert.equal(bipAraligi(d.guc), 0); });
test('metal yaklaşınca sapma', () => { const r = new Radar(); for (let i = 0; i < 40; i++) r.ekle(20, 30, 25); let d; for (let i = 0; i < 64; i++) d = r.ekle(20, 30, 40); assert.ok(d.metal > 0.6, JSON.stringify(d)); assert.ok(bipAraligi(d.guc) > 0 && bipAraligi(d.guc) < 500); });
test('dalgalanan alan akım sayılır', () => { const r = new Radar(); for (let i = 0; i < 40; i++) r.ekle(20, 30, 25); let d; for (let i = 0; i < 64; i++) d = r.ekle(20, 30, 25 + 2 * Math.sin(i * 2.1)); assert.ok(d.akim > 0.5, JSON.stringify(d)); });
