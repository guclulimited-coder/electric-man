// Electric Hunter pacing model (2026-10-22): no waiting walls — every gain is relative to Serhat's power, the boss gate of a
// planet is the power of clearing that planet TURNS(k) times, camps come back within minutes. Mirrors public/hunter/index.html
// (SD/SH relative gains, scaleIsland, campWait, TURNS). Run: node tools/balance.mjs
const TURNS = k => Math.min(7, 5 + .1 * k);
const campSize = k => 10 + Math.min(4, Math.floor(k / 2));
const CAMPS = 10;
// a cleared camp comes back after 5 min, then 10, 15 … (linear in clears); deeper planets wait longer
const campWait = (k, clears, kind) => Math.min(7200, 1080 * (1 + .1 * k) * clears * (kind === 'cmd' ? 1.5 : 1));
// power = D (weapon dps × 4) + H (hp × 1.2); a fresh Serhat: D 80, H 120
let D = 80, H = 120, slots = 1;
const P = () => D + H;
function clearGain(k){ let d = D, h = H, sl = slots;
  for (let i = 0; i < CAMPS * campSize(k); i++){ d *= 1.001; h *= 1.002; }
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
    const n = CAMPS * campSize(k) + 6 + 8;
    const per = 30 * hpMul / (D / 4) + 2.2; // seconds per creature: hp / dps + walking
    const clear = n * per + 25; // + walking between camps
    const r = clearGain(k); D = r.d; H = r.h; slots = r.sl;
    t += P() < gate ? Math.max(clear, campWait(k, turns, 'camp')) : clear; // the first camp is back campWait after it was cleared
  }
  t += 90; // boss fight
  H *= 1.1; D *= 1.08; // boss bonus (+10 % hp, +8 % dmg) and the gate pieces
  rows.push({planet: k + 1, creatures: CAMPS * campSize(k) + 14, turns, minutes: Math.round(t / 60), gate: Math.round(gate), power: Math.round(P()), turnMin: Math.round((CAMPS * campSize(k) + 14) * (30 * (D / 80 * (1 + .05 * k)) / (D / 4) + 2.2) / 60), wait1: Math.round(campWait(k, 1, 'camp') / 60) + ' dk'});
}
console.table(rows);
console.log('toplam saat (36 gezegen):', (rows.reduce((a, r) => a + r.minutes, 0) / 60).toFixed(1));
