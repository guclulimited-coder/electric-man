// Electric Hunter pacing model (2026-10-22): no waiting walls — every gain is relative to Serhat's power, the boss gate of a
// planet is the power of clearing that planet TURNS(k) times, camps come back within minutes. Mirrors public/hunter/index.html
// (SD/SH relative gains, scaleIsland, campWait, TURNS). Run: node tools/balance.mjs
const TURNS = k => Math.min(6, 2.5 + .25 * k);
const campSize = k => 5 + Math.min(4, Math.floor(k / 3));
const campWait = (k, clears, kind) => { const g = Math.pow(1.12, k); const base = (kind === 'tree' ? 30 : kind === 'cmd' ? 30 : 15) * g, cap = (kind === 'tree' ? 180 : kind === 'cmd' ? 240 : 120) * g; return Math.min(cap, base * Math.pow(1.4, clears - 1)); };
// power = D (weapon dps × 4) + H (hp × 1.2); a fresh Serhat: D 80, H 120
let D = 80, H = 120, slots = 1;
const P = () => D + H;
function clearGain(k){ let d = D, h = H, sl = slots;
  for (let i = 0; i < 8 * campSize(k); i++){ d *= 1.001; h *= 1.002; }
  for (let i = 0; i < 2; i++){ d *= 1.015; h *= 1.01; if (sl < 4){ d *= 1.22; sl++; } else d *= 1.03; }
  for (let i = 0; i < 4; i++){ h *= 1.004; } for (let i = 0; i < 4; i++){ d *= 1.002; }
  for (let i = 0; i < 4; i++){ d *= 1.001; h *= 1.002; } // commander escorts
  return {d, h, sl}; }
const rows = [];
for (let k = 0; k < 36; k++){
  const entry = P(); const g = clearGain(k); const gate = entry + TURNS(k) * (g.d + g.h - entry);
  const hpMul = D / 80 * (1 + .05 * k); // enemy hp follows Serhat's dps, their damage follows his hp
  let t = 0, turns = 0;
  while (P() < gate && turns < 40){
    turns++;
    const n = 8 * campSize(k) + 6 + 8;
    const per = 30 * hpMul / (D / 4) + 2.2; // seconds per creature: hp / dps + walking
    t += n * per + 25; // + walking between camps
    const r = clearGain(k); D = r.d; H = r.h; slots = r.sl;
    if (P() < gate) t += campWait(k, turns, 'camp'); // wait for the camps to come back
  }
  t += 90; // boss fight
  H *= 1.1; D *= 1.08; // boss bonus (+10 % hp, +8 % dmg) and the gate pieces
  rows.push({planet: k + 1, creatures: 8 * campSize(k) + 14, turns, minutes: Math.round(t / 60), gate: Math.round(gate), power: Math.round(P()), maxWait: Math.round(campWait(k, 99, 'camp') / 60) + ' dk'});
}
console.table(rows);
console.log('toplam saat (36 gezegen):', (rows.reduce((a, r) => a + r.minutes, 0) / 60).toFixed(1));
