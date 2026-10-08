// Creature blueprints. Units match the game (1 = 1 m), +z is forward, y = 0 is the ground.
// Each species: a body, three different heads (each with its own jaw), legs/tail/wings as separate animated parts.
import {sphere, ellipsoid, capsule, taper, smin, smax, fbm, cells, noise, clamp, mix} from './sdf.mjs';
const lerp3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const hex = h => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255].map(v => v ** 2.2);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mirrorX = p => [Math.abs(p[0]), p[1], p[2]];
// shared bits
const tooth = (p, base, tip, r) => taper(p, base, tip, r, .004);
function teethRow(p, from, to, n, len, r, dir = -1, curve = 0){
  let d = 9; for (let i = 0; i < n; i++){ const t = n === 1 ? .5 : i / (n - 1); const b = lerp3(from, to, t); d = Math.min(d, tooth(p, b, [b[0] * (1 + curve), b[1] + dir * len * (1 - Math.abs(t - .5) * .5), b[2] + .015], r)); }
  return d; }
const wrinkle = (p, s, a) => (fbm(p[0] * s, p[1] * s, p[2] * s, 3) - .5) * a;
const scaleBump = (p, s, a) => -Math.min(1, cells(p[0] * s, p[1] * s, p[2] * s) * 3) * a;

// ============================================================ crawler (surungen): armoured, low, long-skulled reptile
const CR = {skin: hex(0x5d6b3c), dark: hex(0x26321a), belly: hex(0xb9ad80), plate: hex(0x737a48), spot: hex(0xc8ff4a), gum: hex(0x7a1018), tooth: hex(0xf0e6cc), horn: hex(0x3a2c20)};
function crawlerBody(p){
  const q = mirrorX(p);
  let d = ellipsoid(p, [0, .62, -.05], [.46, .34, .95]);                               // barrel torso
  d = smin(d, ellipsoid(p, [0, .7, .62], [.32, .27, .42]), .18);                      // shoulders / neck
  d = smin(d, ellipsoid(p, [0, .55, -.75], [.34, .26, .45]), .2);                     // hips
  d = smin(d, capsule(q, [.34, .66, .55], [.5, .5, .55], .14), .12);                  // front shoulder blades
  d = smin(d, capsule(q, [.3, .58, -.65], [.46, .45, -.7], .15), .12);                // hip joints
  // dorsal ridge: a row of hooked spines down the back
  for (let i = 0; i < 9; i++){ const z = .75 - i * .2, h = .2 + Math.sin(i / 8 * Math.PI) * .18; d = smin(d, taper(p, [0, .9 - Math.abs(i - 3) * .015, z], [0, .9 + h, z - .12], .07, .008), .05); }
  // armour plates: scale cells raised along the back, wrinkled skin elsewhere
  const back = clamp((p[1] - .62) * 4, 0, 1);
  d += back * scaleBump(p, 7, .03) + (1 - back) * wrinkle(p, 14, .025);
  return d;
}
function crawlerColor(p, n){
  const back = clamp((p[1] - .5) * 3 + n[1], 0, 1), belly = clamp(-n[1] * 1.5, 0, 1);
  let c = lerp3(CR.skin, CR.plate, clamp(cells(p[0] * 7, p[1] * 7, p[2] * 7) * 2.5, 0, 1) * back);
  c = lerp3(c, CR.belly, belly * .8);
  c = lerp3(c, CR.dark, clamp((fbm(p[0] * 3, p[1] * 3, p[2] * 3) - .45) * 3, 0, .6));
  if (p[1] > .9) c = lerp3(c, CR.horn, clamp((p[1] - .9) * 5, 0, 1));                 // spine tips darken
  const spots = noise(p[0] * 9 + 3, p[1] * 9, p[2] * 9); if (spots > .78 && back > .4) c = lerp3(c, CR.spot, (spots - .78) * 3);  // bioluminescent freckles
  return c;
}
// three skulls: hinge at the origin of the head part, snout toward +z
function crawlerHead(v){ return p => {
  const q = mirrorX(p);
  let d = ellipsoid(p, [0, .06, .16], [.23, .18, .3]);                                 // cranium
  d = smin(d, ellipsoid(p, [0, .02, .5], [.12, .09, .3]), .12);                        // long snout
  d = smax(d, -sphere(q, [.045, .07, .76], .025), .01);                                // nostrils
  d = smax(d, -ellipsoid(p, [0, -.17, .32], [.17, .1, .4]), .04);                     // open underside for the jaw
  d = smin(d, capsule(q, [.12, .14, .12], [.08, .15, .42], .05), .06);                 // brow ridges
  if (v === 0){ // six-eyed: three sockets per side, crest of short horns
    for (let i = 0; i < 3; i++) d = smax(d, -sphere(q, [.13 + i * .015, .12 - i * .03, .3 - i * .085], .058 - i * .008), .02);
    for (let i = 0; i < 4; i++) d = smin(d, taper(p, [0, .18, .2 - i * .1], [0, .3 + (i === 1 ? .06 : 0), .1 - i * .12], .035, .006), .03);
  } else if (v === 1){ // two deep sockets and swept-back horns
    d = smax(d, -sphere(q, [.145, .1, .26], .08), .025);
    d = smin(d, taper(q, [.15, .14, .05], [.33, .36, -.32], .07, .01), .05);
    d = smin(d, taper(q, [.17, .06, .12], [.3, .02, -.12], .045, .008), .04);         // cheek spurs
  } else { // blind frill-head: no eyes, a fan of bony spikes around the neck
    for (let i = 0; i < 7; i++){ const a = -1.2 + i * .4; d = smin(d, taper(p, [Math.sin(a) * .14, .08 + Math.cos(a) * .1, 0], [Math.sin(a) * .42, .1 + Math.cos(a) * .36, -.18], .04, .006), .04); }
    d = smin(d, ellipsoid(p, [0, .08, -.02], [.3, .26, .05]), .06);                  // frill membrane
  }
  d = Math.min(d, teethRow(p, [-.12, -.07, .14], [-.07, -.06, .72], 9, .1, .017, -1, .1), teethRow(p, [.12, -.07, .14], [.07, -.06, .72], 9, .1, .017, -1, .1));
  d = Math.min(d, tooth(p, [.075, -.05, .62], [.09, -.24, .66], .028), tooth(p, [-.075, -.05, .62], [-.09, -.24, .66], .028)); // fangs
  return d + wrinkle(p, 18, .015);
}; }
const crawlerHeadEyes = v => v === 0 ? [0, 1, 2].flatMap(i => [[.118 + i * .015, .12 - i * .03, .3 - i * .085, .045 - i * .007], [-(.118 + i * .015), .12 - i * .03, .3 - i * .085, .045 - i * .007]])
  : v === 1 ? [[.125, .1, .27, .062], [-.125, .1, .27, .062]] : [];
function crawlerHeadColor(p, n){
  let c = lerp3(CR.skin, CR.dark, clamp(fbm(p[0] * 6, p[1] * 6, p[2] * 6) * 1.3 - .3, 0, 1));
  if (p[1] < -.04 && n[1] < .2) c = lerp3(c, CR.gum, .85);                          // gums inside the mouth
  if (p[1] < -.09) c = CR.tooth;                                                       // teeth
  if (p[1] > .17) c = lerp3(c, CR.horn, clamp((p[1] - .17) * 6, 0, 1));
  return c;
}
function crawlerJaw(p){
  let d = ellipsoid(p, [0, -.05, .22], [.16, .07, .3]);
  d = smin(d, ellipsoid(p, [0, -.04, .52], [.09, .05, .24]), .08);                    // chin
  d = smax(d, -ellipsoid(p, [0, .03, .36], [.11, .05, .36]), .03);                     // hollow tongue trough
  d = Math.min(d, ellipsoid(p, [0, -.005, .35], [.06, .025, .25]));                     // tongue
  d = Math.min(d, teethRow(p, [-.1, .0, .1], [-.055, .0, .66], 8, .085, .015, 1, .08), teethRow(p, [.1, .0, .1], [.055, .0, .66], 8, .085, .015, 1, .08));
  return d + wrinkle(p, 18, .012);
}
const crawlerJawColor = (p, n) => p[1] > .015 ? CR.tooth : n[1] > .3 ? CR.gum : lerp3(CR.skin, CR.belly, .4);
function crawlerLeg(p){ // hip at origin, foot down/out on +x
  let d = ellipsoid(p, [.14, -.06, .02], [.2, .13, .14]);                               // thigh muscle
  d = smin(d, taper(p, [0, 0, 0], [.33, -.2, .06], .12, .08), .06);
  d = smin(d, sphere(p, [.33, -.2, .06], .085), .04);                                  // knee
  d = smin(d, taper(p, [.33, -.2, .06], [.42, -.6, .12], .075, .045), .04);
  for (const a of [-.35, 0, .35]) d = smin(d, taper(p, [.42, -.58, .12], [.47 + Math.sin(a) * .02, -.66, .26 + a * .15], .04, .006), .02);  // claws
  return d + scaleBump(p, 12, .012);
}
const crawlerLegColor = (p, n) => p[1] < -.6 ? CR.horn : lerp3(CR.skin, CR.dark, clamp(-p[1], 0, .7));
function crawlerTail(p){ // base at origin, tapering to -z with a club of spikes
  let d = 9; for (let i = 0; i < 6; i++){ const z = -i * .22, y = -i * i * .012; d = smin(d, ellipsoid(p, [0, y, z], [.2 - i * .028, .16 - i * .022, .16]), .07); }
  d = smin(d, taper(p, [0, .05, -.1], [0, .12, -1.25], .05, .01), .04);
  for (let i = 0; i < 5; i++) d = smin(d, taper(p, [0, .12 - i * i * .01, -.15 - i * .22], [0, .26 - i * .02, -.3 - i * .22], .035, .006), .03);
  return d + scaleBump(p, 10, .015);
}

// ============================================================ shared limbs
// thin jointed insect leg: hip at origin, reaches out along +x and down to the ground at y = -hip
function insectLeg(hip, reach, thick = 1){ return p => {
  let d = taper(p, [0, 0, 0], [reach * .45, hip * .45, 0], .07 * thick, .05 * thick);           // femur rises
  d = smin(d, sphere(p, [reach * .45, hip * .45, 0], .06 * thick), .03);
  d = smin(d, taper(p, [reach * .45, hip * .45, 0], [reach, -hip + .05, .05], .05 * thick, .018 * thick), .03); // tibia down to the ground
  for (let i = 0; i < 3; i++) d = smin(d, taper(p, [reach * (.55 + i * .12), hip * (.3 - i * .35), 0], [reach * (.6 + i * .12), hip * (.3 - i * .35) + .09, -.02], .018, .003), .01); // bristles
  return d + scaleBump(p, 14, .006);
}; }

// ============================================================ spitter (tukurucu): bloated venom sac on an insect body, lamprey mouth
const SP = {chit: hex(0x2c1e3e), chit2: hex(0x52306e), sac: hex(0x8adf2a), vein: hex(0x2a5a10), gum: hex(0x6a0f2a), tooth: hex(0xece2cc), belly: hex(0x6a5a7a)};
function spitterBody(p){
  const q = mirrorX(p);
  let d = ellipsoid(p, [0, 1.05, -.05], [.36, .32, .42]);                             // thorax
  d = smin(d, ellipsoid(p, [0, 1.15, -.62], [.52, .5, .62]), .14);                     // venom sac abdomen
  for (let i = 0; i < 4; i++) d = smax(d, -ellipsoid(p, [0, 1.15, -.3 - i * .2], [.7, .7, .02]), .03); // segment grooves
  d = smin(d, taper(p, [0, 1.15, .25], [0, 1.6, .55], .18, .13), .1);                  // neck
  for (let i = 0; i < 6; i++) d = smin(d, taper(q, [.1 + i * .02, 1.25 + i * .02, .1 - i * .14], [.26 + i * .03, 1.5 + i * .04, -.05 - i * .16], .04, .005), .03); // back thorns
  d += (fbm(p[0] * 9, p[1] * 9, p[2] * 9, 3) - .5) * .02;
  return d;
}
function spitterColor(p, n){
  const sac = clamp(1 - Math.hypot(p[0] / .55, (p[1] - 1.15) / .52, (p[2] + .62) / .65) * 1.05, 0, 1) * clamp(n[1] + .6, 0, 1);
  let c = lerp3(SP.chit, SP.chit2, clamp(fbm(p[0] * 4, p[1] * 4, p[2] * 4) * 1.5 - .4, 0, 1));
  c = lerp3(c, SP.belly, clamp(-n[1], 0, 1) * .6);
  if (sac > 0){ const veins = Math.abs(fbm(p[0] * 7, p[1] * 7, p[2] * 7) - .5) < .04 ? 1 : 0; c = lerp3(c, veins ? SP.vein : SP.sac, clamp(sac * 3, 0, 1)); }
  return c;
}
function spitterHead(v){ return p => {
  const q = mirrorX(p);
  let d = ellipsoid(p, [0, 0, .12], [.26, .26, .3]);
  if (v === 0){ // lamprey: a round mouth ringed with teeth
    d = smax(d, -ellipsoid(p, [0, 0, .42], [.17, .17, .16]), .03);
    for (let r = 0; r < 2; r++) for (let i = 0; i < 12; i++){ const a = i / 12 * Math.PI * 2 + r * .26, rr = .16 - r * .06;
      d = Math.min(d, tooth(p, [Math.cos(a) * rr, Math.sin(a) * rr, .36 - r * .06], [Math.cos(a) * rr * .45, Math.sin(a) * rr * .45, .3 - r * .06], .018)); }
  } else if (v === 1){ // four-petal mandible mouth, peeled open
    for (let i = 0; i < 4; i++){ const a = i / 4 * Math.PI * 2 + .78; d = smin(d, taper(p, [Math.cos(a) * .1, Math.sin(a) * .1, .3], [Math.cos(a) * .3, Math.sin(a) * .3, .55], .07, .02), .05);
      for (let k = 0; k < 3; k++) d = Math.min(d, tooth(p, [Math.cos(a) * (.14 + k * .05), Math.sin(a) * (.14 + k * .05), .36 + k * .06], [Math.cos(a) * (.1 + k * .05), Math.sin(a) * (.1 + k * .05), .38 + k * .06], .015)); }
    d = smax(d, -ellipsoid(p, [0, 0, .4], [.12, .12, .2]), .03);
  } else { // proboscis and a cluster of eyes
    d = smin(d, taper(p, [0, -.05, .3], [0, -.25, .8], .09, .025), .06);
    d = smin(d, ellipsoid(p, [0, .14, .02], [.3, .16, .26]), .08);                   // swollen brow
  }
  d = smin(d, taper(q, [.18, .1, -.02], [.42, .28, -.25], .035, .006), .03);         // antennae spurs
  return d + (fbm(p[0] * 14, p[1] * 14, p[2] * 14, 3) - .5) * .012;
}; }
const spitterEyes = v => v === 0 ? [[.17, .14, .24, .035], [-.17, .14, .24, .035], [.12, .2, .3, .025], [-.12, .2, .3, .025]]
  : v === 1 ? [[.2, .12, .2, .04], [-.2, .12, .2, .04]]
  : [[.1, .2, .22, .04], [-.1, .2, .22, .04], [.2, .15, .16, .035], [-.2, .15, .16, .035], [0, .24, .2, .035], [.15, .25, .1, .028], [-.15, .25, .1, .028]];
function spitterHeadColor(p, n){
  let c = lerp3(SP.chit, SP.chit2, clamp(fbm(p[0] * 6, p[1] * 6, p[2] * 6) * 1.6 - .5, 0, 1));
  const inMouth = p[2] > .25 && Math.hypot(p[0], p[1]) < .17; if (inMouth) c = SP.gum;
  if (p[2] > .28 && n[2] < .3 && Math.hypot(p[0], p[1]) < .2 && Math.hypot(p[0], p[1]) > .03) c = lerp3(c, SP.tooth, .9);
  return c;
}

// ============================================================ brute (tank): stone-plated hulk, huge fists, tusked little head
const BR = {skin: hex(0x6a4a3a), dark: hex(0x2e211c), plate: hex(0x5e5650), plate2: hex(0x8a8076), lava: hex(0xff6a10), tusk: hex(0xeee2c8), gum: hex(0x5a0a0a)};
function bruteBody(p){
  const q = mirrorX(p);
  let d = ellipsoid(p, [0, 1.9, .05], [.95, .8, .7]);                                   // chest / back hump
  d = smin(d, ellipsoid(p, [0, 1.25, -.15], [.7, .55, .55]), .3);                       // gut
  d = smin(d, ellipsoid(q, [.7, 2.3, .1], [.48, .42, .45]), .25);                       // shoulder masses
  d = smin(d, ellipsoid(p, [0, .9, -.25], [.6, .35, .45]), .2);                         // hips
  // stone plates fused into the back and shoulders
  for (const [x, y, z, r] of [[.0, 2.55, -.15, .42], [.62, 2.65, -.05, .36], [-.62, 2.65, -.05, .36], [.3, 2.35, -.55, .3], [-.3, 2.35, -.55, .3], [0, 2.1, -.7, .3]])
    d = smin(d, ellipsoid(p, [x, y, z], [r, r * .55, r * .9]) + (cells(p[0] * 5, p[1] * 5, p[2] * 5) - .3) * .06, .08);
  d += (fbm(p[0] * 6, p[1] * 6, p[2] * 6, 3) - .5) * .05;
  return d;
}
function bruteColor(p, n){
  let c = lerp3(BR.skin, BR.dark, clamp(fbm(p[0] * 3, p[1] * 3, p[2] * 3) * 1.5 - .4, 0, 1));
  const plate = p[1] > 2.05 && n[1] > .1; if (plate) c = lerp3(BR.plate, BR.plate2, cells(p[0] * 5, p[1] * 5, p[2] * 5));
  const crack = Math.abs(fbm(p[0] * 5 + 7, p[1] * 5, p[2] * 5, 3) - .5) < .025; if (crack && p[1] > 1.2) c = BR.lava;   // glowing magma seams
  return c;
}
function bruteHead(v){ return p => {
  const q = mirrorX(p);
  let d = ellipsoid(p, [0, 0, .1], [.32, .28, .3]);
  d = smin(d, ellipsoid(p, [0, .14, .25], [.34, .1, .16]), .08);                      // heavy brow shelf
  d = smax(d, -sphere(q, [.13, .06, .37], .07), .03);                                   // deep sockets
  d = smin(d, ellipsoid(p, [0, -.15, .26], [.26, .15, .2]), .1);                       // muzzle
  if (v === 0){ d = smin(d, taper(q, [.15, -.18, .38], [.26, .12, .55], .055, .012), .03); }               // up-curved tusks
  else if (v === 1){ for (let i = 0; i < 5; i++){ const a = -.9 + i * .45; d = smin(d, taper(p, [Math.sin(a) * .2, .2, .05], [Math.sin(a) * .42, .52 + Math.cos(a) * .1, -.05], .06, .01), .04); } } // horn crown
  else { d = smin(d, ellipsoid(p, [0, .05, .36], [.3, .28, .06]) + (cells(p[0] * 9, p[1] * 9, p[2] * 9) - .3) * .03, .03); d = smax(d, -sphere(q, [.12, .06, .4], .07), .02); } // bone mask
  return d + (fbm(p[0] * 12, p[1] * 12, p[2] * 12, 3) - .5) * .02;
}; }
const bruteEyes = v => [[.13, .06, .34, .045], [-.13, .06, .34, .045]];
function bruteHeadColor(p, n){ let c = lerp3(BR.skin, BR.dark, clamp(fbm(p[0] * 5, p[1] * 5, p[2] * 5) * 1.5 - .4, 0, 1)); if (Math.abs(p[0]) > .12 && p[2] > .35 && p[1] < .1) c = BR.tusk; if (p[1] > .25) c = lerp3(c, BR.plate2, .7); if (p[2] > .33 && Math.abs(p[1] - .05) < .2 && Math.abs(p[0]) < .3 && n[2] > .6) c = lerp3(c, BR.tusk, .5); return c; }
function bruteJaw(p){ let d = ellipsoid(p, [0, -.06, .14], [.24, .1, .18]); d = smax(d, -ellipsoid(p, [0, .02, .18], [.18, .06, .14]), .02); d = Math.min(d, teethRow(p, [-.16, -.0, .08], [.16, -.0, .08], 1, 0, .001)); d = Math.min(d, tooth(p, [.12, -.02, .26], [.14, .16, .3], .03), tooth(p, [-.12, -.02, .26], [-.14, .16, .3], .03)); return d; }
const bruteJawColor = (p, n) => p[1] > .03 ? BR.tusk : n[1] > .3 ? BR.gum : BR.skin;
function bruteArm(p){ // shoulder at origin, knuckles on the ground ahead
  let d = ellipsoid(p, [.12, -.35, .05], [.3, .5, .32]);                               // bicep / shoulder
  d = smin(d, sphere(p, [.18, -.85, .2], .22), .1);                                     // elbow
  d = smin(d, taper(p, [.18, -.85, .2], [.2, -1.75, .42], .3, .36), .12);               // forearm swelling to the fist
  d = smin(d, ellipsoid(p, [.2, -1.9, .45], [.36, .26, .34]), .08);                     // fist
  for (let i = 0; i < 4; i++) d = smin(d, sphere(p, [.04 + i * .11, -1.98, .7], .09), .03);            // knuckles
  d = smin(d, ellipsoid(p, [.25, -1.25, .05], [.3, .2, .3]) + (cells(p[0] * 5, p[1] * 5, p[2] * 5) - .3) * .05, .05); // forearm plate
  return d + (fbm(p[0] * 7, p[1] * 7, p[2] * 7, 3) - .5) * .04;
}
function bruteLeg(p){ let d = ellipsoid(p, [.05, -.25, 0], [.3, .38, .32]); d = smin(d, taper(p, [.05, -.4, 0], [.08, -.85, .08], .24, .2), .08); d = smin(d, ellipsoid(p, [.08, -.9, .18], [.26, .1, .3]), .05); return d + (fbm(p[0] * 7, p[1] * 7, p[2] * 7, 3) - .5) * .04; }

// ============================================================ watcher (goz): a floating eye of veined flesh with a fanged mouth beneath
const WA = {flesh: hex(0x8a5a6a), dark: hex(0x3a1a2a), vein: hex(0x9a1a2a), white: hex(0xe6dccf), lid: hex(0x6a3a4a), tooth: hex(0xece2cc), gum: hex(0x4a0a14)};
function watcherBody(p){
  let d = sphere(p, [0, 1.9, 0], .62);
  d = smin(d, ellipsoid(p, [0, 1.45, -.05], [.45, .3, .45]), .2);                       // fleshy underside
  for (let i = 0; i < 8; i++){ const a = i / 8 * Math.PI * 2; d = smin(d, taper(p, [Math.cos(a) * .3, 2.3, Math.sin(a) * .3 - .1], [Math.cos(a) * .55, 2.75, Math.sin(a) * .55 - .25], .07, .01), .05); } // crown of feelers
  d = smax(d, -ellipsoid(p, [0, 1.95, .55], [.38, .34, .2]), .05);                     // socket for the giant eye
  d = smin(d, ellipsoid(p, [0, 1.95, .38], [.36, .32, .3]), .02);                       // eyeball
  d = smax(d, -ellipsoid(p, [0, 1.38, .4], [.2, .07, .25]), .03);                       // mouth slit
  for (let i = 0; i < 9; i++){ const x = -.16 + i * .04; d = Math.min(d, tooth(p, [x, 1.43, .45], [x, 1.33, .5], .012), tooth(p, [x + .02, 1.32, .45], [x + .02, 1.41, .5], .011)); }
  d += (fbm(p[0] * 8, p[1] * 8, p[2] * 8, 3) - .5) * .03;
  return d;
}
function watcherColor(p, n){
  const eye = Math.hypot(p[0], p[1] - 1.95, p[2] - .38) < .37 && n[2] > .2;
  if (eye){ const r = Math.hypot(p[0], p[1] - 1.95); const vein = Math.abs(fbm(p[0] * 12, p[1] * 12, 3, 3) - .5) < .03 && r > .14; return vein ? WA.vein : WA.white; }
  if (p[1] < 1.47 && p[1] > 1.28 && p[2] > .38) return Math.abs(p[1] - 1.38) < .05 ? WA.gum : WA.tooth;
  let c = lerp3(WA.flesh, WA.dark, clamp(fbm(p[0] * 4, p[1] * 4, p[2] * 4) * 1.6 - .5, 0, 1));
  if (Math.abs(fbm(p[0] * 6, p[1] * 6, p[2] * 6, 3) - .5) < .025) c = WA.vein;
  return c;
}
function tentacle(p){ let d = 9; for (let i = 0; i < 7; i++){ const t0 = i / 7, t1 = (i + 1) / 7; d = smin(d, taper(p, [Math.sin(t0 * 3) * .1, -t0 * 1.25, 0], [Math.sin(t1 * 3) * .1, -t1 * 1.25, 0], .085 * (1 - t0 * .78), .085 * (1 - t1 * .78)), .03); }
  for (let i = 1; i < 7; i++){ const t = i / 7; d = smin(d, sphere(p, [Math.sin(t * 3) * .1, -t * 1.25, .06 * (1 - t * .6)], .02), .01); } return d; } // suckers
const tentacleColor = (p, n) => n[2] > .5 && p[2] > .03 ? WA.lid : lerp3(WA.flesh, WA.dark, clamp(-p[1] * .6, 0, .7));

// ============================================================ scorpion (akrep): spiked chitin, crushing claws, venom tail
const SC = {chit: hex(0x3e4a20), chit2: hex(0x7a8a3a), edge: hex(0x1a200c), venom: hex(0xd4ff3a), belly: hex(0x8a8460)};
function scorpBody(p){
  const q = mirrorX(p);
  let d = ellipsoid(p, [0, .55, .25], [.5, .26, .55]);                                   // carapace
  for (let i = 0; i < 4; i++) d = smin(d, ellipsoid(p, [0, .57, -.35 - i * .27], [.42 - i * .05, .22, .18]), .05);   // segmented abdomen
  for (let i = 0; i < 5; i++) d = smin(d, taper(q, [.22, .7, .5 - i * .25], [.36, .9, .42 - i * .27], .045, .006), .03); // flank spikes
  d += (cells(p[0] * 6, p[1] * 6, p[2] * 6) - .3) * .025;
  return d;
}
const scorpColor = (p, n) => { let c = lerp3(SC.chit, SC.chit2, clamp(n[1] * .8 + fbm(p[0] * 5, p[1] * 5, p[2] * 5) - .4, 0, 1)); if (n[1] < -.3) c = SC.belly; if (cells(p[0] * 6, p[1] * 6, p[2] * 6) < .08) c = SC.edge; return c; };
function scorpHead(v){ return p => {
  const q = mirrorX(p);
  let d = ellipsoid(p, [0, 0, .12], [.3, .14, .2]);
  if (v === 0){ for (let i = 0; i < 2; i++) d = smin(d, taper(q, [.08, -.04, .25], [.02, -.12, .42 + i * .02], .05, .008), .03); }       // mandibles
  else if (v === 1){ d = smin(d, taper(p, [0, .08, .1], [0, .3, -.05], .06, .008), .04); d = smin(d, taper(q, [.08, -.04, .25], [.18, -.1, .44], .045, .008), .03); }
  else { for (let i = 0; i < 3; i++) d = smin(d, taper(q, [.12 + i * .05, .05, .2 - i * .05], [.22 + i * .06, .18, .25 - i * .05], .03, .005), .02); }
  return d + (cells(p[0] * 9, p[1] * 9, p[2] * 9) - .3) * .015;
}; }
const scorpEyes = v => v === 2 ? [[.08, .1, .26, .03], [-.08, .1, .26, .03], [.16, .08, .22, .025], [-.16, .08, .22, .025], [.22, .06, .16, .02], [-.22, .06, .16, .02]] : [[.07, .1, .27, .035], [-.07, .1, .27, .035]];
function scorpClaw(p){ // shoulder at origin, claw forward
  let d = taper(p, [0, 0, 0], [.35, .05, .35], .09, .07); d = smin(d, sphere(p, [.35, .05, .35], .09), .03);
  d = smin(d, taper(p, [.35, .05, .35], [.35, .08, .7], .1, .13), .05); d = smin(d, ellipsoid(p, [.35, .08, .82], [.2, .14, .22]), .05); // forearm + palm
  d = smin(d, taper(p, [.42, .08, .95], [.38, .08, 1.35], .07, .01), .03); d = smin(d, taper(p, [.25, .08, .95], [.3, .1, 1.3], .06, .01), .03); // pincers
  for (let i = 0; i < 4; i++) d = Math.min(d, tooth(p, [.37, .08, 1.0 + i * .08], [.32, .08, 1.02 + i * .08], .015));
  return d + (cells(p[0] * 7, p[1] * 7, p[2] * 7) - .3) * .02;
}
function scorpTail(p){ let d = 9; const pt = i => { const a = i / 5 * 2.5; return [0, Math.sin(a) * 1.05, -Math.cos(a) * .55 + .55 - i * .05]; };
  for (let i = 0; i < 6; i++){ d = smin(d, sphere(p, pt(i), .15 - i * .013), .04); if (i < 5) d = smin(d, taper(p, pt(i), pt(i + 1), .12 - i * .012, .11 - i * .012), .04); }
  d = smin(d, ellipsoid(p, [0, .7, .95], [.12, .12, .18]), .05); d = smin(d, taper(p, [0, .66, 1.05], [0, .45, 1.28], .06, .005), .02); return d + (cells(p[0] * 7, p[1] * 7, p[2] * 7) - .3) * .02; }
const scorpTailColor = (p, n) => p[2] > .85 ? (p[2] > 1.05 ? SC.venom : lerp3(SC.chit2, SC.venom, .5)) : scorpColor(p, n);

// ============================================================ night wing (yarasa): starved bat-demon, ribs under the skin, needle fangs
const BT = {skin: hex(0x3a2a3e), dark: hex(0x160e18), membrane: hex(0x4a2030), bone: hex(0xd8ccb8), gum: hex(0x6a0a1a)};
function batBody(p){
  const q = mirrorX(p);
  let d = ellipsoid(p, [0, 1.75, -.02], [.24, .34, .2]);                                  // chest
  for (let i = 0; i < 5; i++) d = smin(d, taper(q, [.02, 1.95 - i * .1, .15], [.2, 1.9 - i * .11, .02], .03, .02), .02);  // ribs
  d = smin(d, ellipsoid(p, [0, 1.38, -.05], [.14, .22, .13]), .1);                         // wasp waist
  d = smin(d, taper(q, [.08, 1.25, 0], [.16, .8, .12], .07, .04), .05); d = smin(d, taper(q, [.16, .8, .12], [.12, .45, -.05], .04, .02), .03); // hind legs
  for (let i = 0; i < 3; i++) d = smin(d, taper(q, [.12, .45, -.05], [.16 + i * .03, .34, .06 + i * .04], .02, .004), .01);  // talons
  d = smin(d, taper(p, [0, 1.35, -.15], [0, 1.1, -.8], .05, .01), .03);                    // whip tail
  return d + (fbm(p[0] * 10, p[1] * 10, p[2] * 10, 3) - .5) * .015;
}
const batColor = (p, n) => { let c = lerp3(BT.skin, BT.dark, clamp(fbm(p[0] * 5, p[1] * 5, p[2] * 5) * 1.6 - .5, 0, 1)); if (p[1] < .5) c = BT.bone; return c; };
function batHead(v){ return p => {
  const q = mirrorX(p);
  let d = ellipsoid(p, [0, 0, .05], [.16, .17, .16]);
  d = smin(d, ellipsoid(p, [0, -.05, .2], [.09, .08, .12]), .06);                        // snout
  d = smax(d, -ellipsoid(p, [0, -.11, .25], [.07, .035, .12]), .02);                     // gaping mouth
  for (let i = 0; i < 6; i++){ const x = -.05 + i * .02; d = Math.min(d, tooth(p, [x, -.08, .28], [x * 1.2, -.15, .3], .008)); }
  d = Math.min(d, tooth(q, [.04, -.07, .29], [.05, -.2, .31], .014));                     // needle fangs
  if (v === 0) d = smin(d, taper(q, [.1, .12, -.02], [.3, .45, -.12], .07, .01), .04);    // tall bat ears
  else if (v === 1){ d = smin(d, taper(q, [.08, .14, .02], [.12, .4, -.25], .04, .006), .03); d = smin(d, taper(q, [.12, .05, 0], [.32, .12, -.1], .05, .008), .03); }  // horns + side ears
  else { d = smin(d, ellipsoid(p, [0, .08, .02], [.2, .14, .14]), .05); d = smax(d, -sphere(q, [.07, .05, .14], .05), .02); }       // bald skull with deep sockets
  return d + (fbm(p[0] * 16, p[1] * 16, p[2] * 16, 3) - .5) * .01;
}; }
const batEyes = v => v === 2 ? [[.07, .05, .14, .035], [-.07, .05, .14, .035]] : [[.07, .04, .15, .028], [-.07, .04, .15, .028]];
const batHeadColor = (p, n) => p[1] < -.09 && p[2] > .22 ? (p[1] < -.12 ? BT.bone : BT.gum) : lerp3(BT.skin, BT.dark, clamp(fbm(p[0] * 7, p[1] * 7, p[2] * 7) * 1.6 - .5, 0, 1));
// signed 2D distance to a triangle (negative inside)
function tri2(px, py, a, b, c){ const e = [[a, b], [b, c], [c, a]]; let dmin = 9, sgn = 0;
  for (const [u, v] of e){ const ex = v[0] - u[0], ey = v[1] - u[1], wx = px - u[0], wy = py - u[1], t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1); dmin = Math.min(dmin, Math.hypot(wx - ex * t, wy - ey * t)); sgn += (ex * wy - ey * wx) > 0 ? 1 : -1; }
  return Math.abs(sgn) === 3 ? -dmin : dmin; }
function batWing(p){ // shoulder at origin, spreading along +x
  let d = 9; const fingers = [[1.25, .25, .1], [1.15, -.05, -.25], [.9, -.3, -.45]];
  d = taper(p, [0, 0, 0], [.45, .12, .05], .05, .035); d = smin(d, sphere(p, [.45, .12, .05], .04), .02);
  for (const f of fingers) d = smin(d, taper(p, [.45, .12, .05], f, .025, .006), .015);
  // membrane: a thin skin stretched between arm, fingers and flank (triangles in the wing plane), scalloped at the edge
  const W = [.45, .05], B = [.02, -.55], tips = fingers.map(f => [f[0], f[2]]);
  let inside = -9; for (const [a, b, c] of [[[0, 0], W, tips[0]], [W, tips[0], tips[1]], [W, tips[1], tips[2]], [W, tips[2], B], [[0, 0], W, B]]) inside = Math.max(inside, -tri2(p[0], p[2], a, b, c));
  const sag = Math.sin(p[0] * 9) * .03 * clamp(p[0], 0, 1);
  const mem = Math.max(Math.abs(p[1] - (.1 * (1 - p[0] * .8)) + sag) - .022, -inside - .01);
  return Math.min(d, mem);
}
const batWingColor = (p, n) => { const v = Math.abs(fbm(p[0] * 6, p[2] * 6, 1, 3) - .5) < .03; return v ? BT.dark : lerp3(BT.membrane, BT.skin, clamp(fbm(p[0] * 3, p[2] * 3, 2) - .3, 0, 1)); };

export const SPECIES = {
  surungen: {
    info: {scale: 1.12, eyeColor: 0xffa020},
    parts: [
      {name: 'body', budget: 1300, h: .03, sdf: crawlerBody, color: crawlerColor, box: [-.7, .1, -1.35, .7, 1.35, 1.15]},
      ...[0, 1, 2].map(v => ({name: 'head' + v, role: 'head', variant: v, pivot: [0, .74, .88], eyes: crawlerHeadEyes(v), budget: 750, h: .017, sdf: crawlerHead(v), color: crawlerHeadColor, box: [-.48, -.32, -.4, .48, .52, .9]})),
      {name: 'jaw', role: 'jaw', budget: 275, h: .015, pivot: [0, .66, .92], sdf: crawlerJaw, color: crawlerJawColor, box: [-.22, -.16, -.12, .22, .14, .82]},
      {name: 'leg', role: 'leg', budget: 190, h: .025, sdf: crawlerLeg, color: crawlerLegColor, box: [-.18, -.75, -.2, .62, .2, .42]},
      {name: 'tail', role: 'tail', budget: 375, h: .025, pivot: [0, .56, -1.12], sdf: crawlerTail, color: crawlerColor, box: [-.3, -.35, -1.45, .3, .45, .25]}
    ],
    legs: [[.38, .62, .55], [-.38, .62, .55], [.36, .56, -.62], [-.36, .56, -.62]]
  }
  ,tukurucu: {
    info: {scale: 1.05, eyeColor: 0xc6ff2a},
    parts: [
      {name: 'body', budget: 1100, h: .03, sdf: spitterBody, color: spitterColor, box: [-.75, .45, -1.45, .75, 1.95, .75]},
      ...[0, 1, 2].map(v => ({name: 'head' + v, role: 'head', variant: v, pivot: [0, 1.72, .68], eyes: spitterEyes(v), budget: 700, h: .017, sdf: spitterHead(v), color: spitterHeadColor, box: [-.5, -.4, -.35, .5, .45, .9]})),
      {name: 'leg', role: 'leg', budget: 150, h: .02, sdf: insectLeg(1.0, .85), color: (p, n) => lerp3(SP.chit, SP.chit2, clamp(p[1] + .5, 0, 1)), box: [-.15, -1.05, -.15, 1.0, .6, .2]}
    ],
    legs: [[.22, 1.0, .25], [-.22, 1.0, .25], [.26, 1.0, -.1], [-.26, 1.0, -.1], [.24, 1.0, -.45], [-.24, 1.0, -.45]]
  },
  tank: {
    info: {scale: 1.05, eyeColor: 0xff6a10},
    parts: [
      {name: 'body', budget: 1500, h: .04, sdf: bruteBody, color: bruteColor, box: [-1.45, .45, -1.05, 1.45, 3.05, .95]},
      ...[0, 1, 2].map(v => ({name: 'head' + v, role: 'head', variant: v, pivot: [0, 2.35, .72], eyes: bruteEyes(v), budget: 650, h: .02, sdf: bruteHead(v), color: bruteHeadColor, box: [-.55, -.45, -.3, .55, .65, .7]})),
      {name: 'jaw', role: 'jaw', pivot: [0, 2.12, .78], budget: 225, h: .016, sdf: bruteJaw, color: bruteJawColor, box: [-.32, -.2, -.1, .32, .25, .4]},
      {name: 'arm', role: 'arm', budget: 750, h: .035, sdf: bruteArm, color: bruteColor, box: [-.35, -2.25, -.4, .75, .4, 1.0]},
      {name: 'leg', role: 'leg', budget: 350, h: .035, sdf: bruteLeg, color: bruteColor, box: [-.4, -1.05, -.4, .45, .2, .55]}
    ],
    legs: [[.45, .95, -.25], [-.45, .95, -.25]], arms: [[1.05, 2.35, .2], [-1.05, 2.35, .2]]
  },
  goz: {
    info: {scale: 1, eyeColor: 0xff2a3a, pupil: [0, 1.95, .7, .13]},
    parts: [
      {name: 'body', budget: 1300, h: .022, sdf: watcherBody, color: watcherColor, box: [-.8, 1.0, -.8, .8, 2.9, .8]},
      ...[0, 1, 2, 3, 4, 5].map(i => { const a = i / 6 * Math.PI * 2; return {name: 'tent' + i, role: 'tentacle', pivot: [Math.cos(a) * .32, 1.32, Math.sin(a) * .32 - .05], budget: 150, h: .02, sdf: tentacle, color: tentacleColor, box: [-.3, -1.4, -.2, .35, .15, .2]}; })
    ]
  },
  akrep: {
    info: {scale: 1, eyeColor: 0xd4ff3a},
    parts: [
      {name: 'body', budget: 900, h: .028, sdf: scorpBody, color: scorpColor, box: [-.65, .2, -1.35, .65, 1.0, .9]},
      ...[0, 1, 2].map(v => ({name: 'head' + v, role: 'head', variant: v, pivot: [0, .58, .75], eyes: scorpEyes(v), budget: 350, h: .016, sdf: scorpHead(v), color: scorpColor, box: [-.4, -.25, -.15, .4, .4, .55]})),
      {name: 'claw', role: 'arm', budget: 450, h: .02, sdf: scorpClaw, color: scorpColor, box: [-.15, -.15, -.15, .65, .3, 1.45]},
      {name: 'tail', role: 'tail', pivot: [0, .6, -1.25], budget: 500, h: .022, sdf: scorpTail, color: scorpTailColor, box: [-.25, -.25, -.25, .25, 1.35, 1.45]},
      {name: 'leg', role: 'leg', budget: 130, h: .02, sdf: insectLeg(.58, .75, .9), color: scorpColor, box: [-.15, -.62, -.15, .9, .35, .2]}
    ],
    legs: [[.3, .55, .3], [-.3, .55, .3], [.34, .55, .05], [-.34, .55, .05], [.34, .55, -.2], [-.34, .55, -.2], [.3, .55, -.45], [-.3, .55, -.45]], arms: [[.32, .55, .6], [-.32, .55, .6]]
  },
  yarasa: {
    info: {scale: 1.1, eyeColor: 0xb06aff},
    parts: [
      {name: 'body', budget: 800, h: .018, sdf: batBody, color: batColor, box: [-.4, .25, -.9, .4, 2.15, .35]},
      ...[0, 1, 2].map(v => ({name: 'head' + v, role: 'head', variant: v, pivot: [0, 2.12, .12], eyes: batEyes(v), budget: 450, h: .012, sdf: batHead(v), color: batHeadColor, box: [-.36, -.25, -.3, .36, .52, .38]})),
      {name: 'wing', role: 'wing', budget: 650, h: .014, sdf: batWing, color: batWingColor, box: [-.08, -.4, -.7, 1.35, .45, .25]}
    ], wings: [[.18, 1.95, 0], [-.18, 1.95, 0]]
  }
};
