// Builds public/hunter/creatures.bin: sculpted, AO-baked creature parts for every species and head variant.
// Run: node tools/creatures/build.mjs   (takes a minute; output is committed)
import {writeFileSync} from 'node:fs';
import {mesh, bake} from './sdf.mjs';
import {SPECIES} from './species.mjs';
import * as THREE from 'three';
import {SimplifyModifier} from 'three/examples/jsm/modifiers/SimplifyModifier.js';
import {mergeVertices} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
// sculpt finely, then reduce to a phone-friendly vertex budget (curvature-aware edge collapse keeps teeth and spikes)
function reduce(m, target){
  let g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(m.nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(m.col, 3)); g.setIndex(new THREE.BufferAttribute(m.idx, 1));
  const nv = m.pos.length / 3; if (target && nv > target) g = new SimplifyModifier().modify(g, nv - target);
  if (!g.index) g = mergeVertices(g, 1e-5);
  return {pos: Float32Array.from(g.attributes.position.array), idx: Array.from(g.index.array)};
}
const H = Number(process.env.RES || .042);
const parts = [], blobs = []; let off = 0;
const meta = {};
for (const [sp, def] of Object.entries(SPECIES)){
  meta[sp] = {parts: []};
  for (const part of def.parts){
    const t0 = Date.now(), r = reduce(mesh(part.sdf, part.color, part.box, part.h || H), part.budget), m = bake(r.pos, r.idx, part.sdf, part.color, part.h || H);
    const nv = m.pos.length / 3, ni = m.idx.length;
    // quantise: positions to int16 inside the part's box, normals to int8, colours to uint8
    const [x0, y0, z0, x1, y1, z1] = part.box, sc = [x1 - x0, y1 - y0, z1 - z0];
    const q = new Int16Array(nv * 3); for (let v = 0; v < nv; v++) for (let a = 0; a < 3; a++) q[v * 3 + a] = Math.round(((m.pos[v * 3 + a] - part.box[a]) / sc[a]) * 65534 - 32767);
    const n8 = new Int8Array(nv * 3); for (let i = 0; i < nv * 3; i++) n8[i] = Math.round(m.nor[i] * 127);
    const c8 = new Uint8Array(nv * 3); for (let i = 0; i < nv * 3; i++) c8[i] = Math.round(Math.sqrt(Math.min(1, Math.max(0, m.col[i]))) * 255); // sqrt-encoded linear colour (decoded in the loader)
    const big = nv > 65535, ix = big ? new Uint32Array(m.idx) : new Uint16Array(m.idx);
    const pad = b => { const r = b.byteLength % 4; return r ? [b, new Uint8Array(4 - r)] : [b]; };
    const chunks = [...pad(new Uint8Array(q.buffer)), ...pad(new Uint8Array(n8.buffer)), ...pad(new Uint8Array(c8.buffer)), ...pad(new Uint8Array(ix.buffer))];
    const len = chunks.reduce((s, c) => s + c.byteLength, 0);
    parts.push({sp, name: part.name, nv, ni, big, box: part.box, off, len}); blobs.push(...chunks); off += len;
    meta[sp].parts.push({name: part.name, role: part.role || 'body', pivot: part.pivot || [0, 0, 0], side: part.side || 0, variant: part.variant ?? -1, eyes: part.eyes || null, idx: parts.length - 1});
    console.log(sp.padEnd(9), part.name.padEnd(10), String(nv).padStart(6), 'verts', String(ni / 3).padStart(6), 'tris', (Date.now() - t0) + 'ms');
  }
  Object.assign(meta[sp], def.info || {}, {legs: def.legs || [], arms: def.arms || [], wings: def.wings || []});
}
const head = new TextEncoder().encode(JSON.stringify({v: 1, parts, meta}));
const hl = new Uint32Array([head.byteLength]), hp = (4 - head.byteLength % 4) % 4;
const out = Buffer.concat([Buffer.from(hl.buffer), Buffer.from(head), Buffer.alloc(hp), ...blobs.map(b => Buffer.from(b.buffer, b.byteOffset, b.byteLength))]);
writeFileSync(new URL('../../public/hunter/creatures.bin', import.meta.url), out);
console.log('creatures.bin', (out.length / 1024).toFixed(0) + ' KB');
