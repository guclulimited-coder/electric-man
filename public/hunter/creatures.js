// Loader for creatures.bin (built by tools/creatures/build.mjs): rebuilds each sculpted part as a BufferGeometry
// and assembles a creature from a species' parts (body, one of three heads with its jaw, legs, tail, wings...).
export async function loadCreatures(THREE, url){
  const buf = await (await fetch(url)).arrayBuffer();
  const hl = new Uint32Array(buf, 0, 1)[0], head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl)));
  const base = 4 + hl + ((4 - hl % 4) % 4), pad = n => n + ((4 - n % 4) % 4);
  const geos = head.parts.map(pt => {
    let o = base + pt.off; const nv = pt.nv, [x0, y0, z0, x1, y1, z1] = pt.box;
    const q = new Int16Array(buf, o, nv * 3); o += pad(nv * 6);
    const n8 = new Int8Array(buf, o, nv * 3); o += pad(nv * 3);
    const c8 = new Uint8Array(buf, o, nv * 3); o += pad(nv * 3);
    const ix = pt.big ? new Uint32Array(buf, o, pt.ni) : new Uint16Array(buf, o, pt.ni);
    const pos = new Float32Array(nv * 3), sc = [x1 - x0, y1 - y0, z1 - z0], b0 = [x0, y0, z0];
    for (let v = 0; v < nv; v++) for (let a = 0; a < 3; a++) pos[v * 3 + a] = b0[a] + (q[v * 3 + a] + 32767) / 65534 * sc[a];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(n8), 3, true));
    const col = new Float32Array(nv * 3); for (let i = 0; i < nv * 3; i++){ const c = c8[i] / 255; col[i] = c * c; } g.setAttribute('color', new THREE.BufferAttribute(col, 3)); // stored sqrt-encoded for precision in the darks
    g.setIndex(new THREE.BufferAttribute(pt.big ? new Uint32Array(ix) : new Uint16Array(ix), 1));
    g.computeBoundingSphere(); return g;
  });
  return {meta: head.meta, geos};
}
