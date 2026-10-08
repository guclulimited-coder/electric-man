// Signed-distance sculpting kit for Electric Hunter's creatures (offline; run by tools/creatures/build.mjs).
// Shapes are written as distance functions, blended with smooth unions, roughened with noise,
// then meshed with surface nets and baked with vertex colour + ambient occlusion.
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const mix = (a, b, t) => a + (b - a) * t;
export const smin = (a, b, k) => { const h = clamp(.5 + .5 * (b - a) / k, 0, 1); return mix(b, a, h) - k * h * (1 - h); };
export const smax = (a, b, k) => -smin(-a, -b, k);
// primitives (p = [x,y,z])
export const sphere = (p, c, r) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) - r;
export function ellipsoid(p, c, r){ const x = (p[0] - c[0]) / r[0], y = (p[1] - c[1]) / r[1], z = (p[2] - c[2]) / r[2]; const k0 = Math.hypot(x, y, z), k1 = Math.hypot(x / r[0], y / r[1], z / r[2]); return k1 < 1e-9 ? -Math.min(...r) : k0 * (k0 - 1) / k1; }
export function capsule(p, a, b, r){ const pax = p[0] - a[0], pay = p[1] - a[1], paz = p[2] - a[2], bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1); return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - r; }
// cone-ish limb that tapers from r1 at a to r2 at b
export function taper(p, a, b, r1, r2){ const pax = p[0] - a[0], pay = p[1] - a[1], paz = p[2] - a[2], bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1); return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - mix(r1, r2, h); }
// value noise
function hash(x, y, z){ let h = x * 374761393 + y * 668265263 + z * 2147483647; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
export function noise(x, y, z){ const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf); let s = 0;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) s += hash(xi + i, yi + j, zi + k) * (i ? u : 1 - u) * (j ? v : 1 - v) * (k ? w : 1 - w);
  return s; }
export const fbm = (x, y, z, o = 4) => { let s = 0, a = .5, f = 1; for (let i = 0; i < o; i++){ s += a * noise(x * f, y * f, z * f); a *= .5; f *= 2.03; } return s; };
// cellular "scales": distance to nearest jittered point (0 at centres, ~1 at borders)
export function cells(x, y, z){ const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z); let d1 = 9, d2 = 9;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++){ const cx = xi + i + hash(xi + i, yi + j, zi + k), cy = yi + j + hash(yi + j, zi + k, xi + i), cz = zi + k + hash(zi + k, xi + i, yi + j);
    const d = Math.hypot(x - cx, y - cy, z - cz); if (d < d1){ d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
  return d2 - d1; }

// surface nets mesher: returns {pos: Float32Array, nor, col, idx}
export function mesh(sdf, color, box, h){
  const [x0, y0, z0, x1, y1, z1] = box, nx = Math.ceil((x1 - x0) / h) + 1, ny = Math.ceil((y1 - y0) / h) + 1, nz = Math.ceil((z1 - z0) / h) + 1;
  const F = new Float32Array(nx * ny * nz); const id = (i, j, k) => (k * ny + j) * nx + i;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) F[id(i, j, k)] = sdf([x0 + i * h, y0 + j * h, z0 + k * h]);
  const vid = new Int32Array(nx * ny * nz).fill(-1), P = [];
  const E = [[0,0,0,1,0,0],[0,1,0,1,1,0],[0,0,1,1,0,1],[0,1,1,1,1,1],[0,0,0,0,1,0],[1,0,0,1,1,0],[0,0,1,0,1,1],[1,0,1,1,1,1],[0,0,0,0,0,1],[1,0,0,1,0,1],[0,1,0,0,1,1],[1,1,0,1,1,1]];
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++){
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a1, b1, c1, a2, b2, c2] of E){ const f1 = F[id(i + a1, j + b1, k + c1)], f2 = F[id(i + a2, j + b2, k + c2)];
      if ((f1 < 0) !== (f2 < 0)){ const t = f1 / (f1 - f2); sx += a1 + (a2 - a1) * t; sy += b1 + (b2 - b1) * t; sz += c1 + (c2 - c1) * t; n++; } }
    if (n){ vid[id(i, j, k)] = P.length / 3; P.push(x0 + (i + sx / n) * h, y0 + (j + sy / n) * h, z0 + (k + sz / n) * h); }
  }
  const I = [];
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) I.push(a, c, b, a, d, c); else I.push(a, b, c, a, c, d); };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++){
    const f0 = F[id(i, j, k)] < 0;
    if (i < nx - 1 && f0 !== (F[id(i + 1, j, k)] < 0)) quad(vid[id(i, j - 1, k - 1)], vid[id(i, j, k - 1)], vid[id(i, j, k)], vid[id(i, j - 1, k)], f0);
    if (j < ny - 1 && f0 !== (F[id(i, j + 1, k)] < 0)) quad(vid[id(i - 1, j, k - 1)], vid[id(i - 1, j, k)], vid[id(i, j, k)], vid[id(i, j, k - 1)], f0);
    if (k < nz - 1 && f0 !== (F[id(i, j, k + 1)] < 0)) quad(vid[id(i - 1, j - 1, k)], vid[id(i, j - 1, k)], vid[id(i, j, k)], vid[id(i - 1, j, k)], f0);
  }
  return bake(new Float32Array(P), I, sdf, color, h);
}
// normals from the distance field's gradient, colour from the paint function, ambient occlusion by marching along the normal
export function bake(Pin, I, sdf, color, h = .02){
  const P = Pin, nv = P.length / 3, N = new Float32Array(nv * 3), C = new Float32Array(nv * 3), e = Math.max(.004, h * .5);
  for (let v = 0; v < nv; v++){
    const p = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
    let gx = sdf([p[0] + e, p[1], p[2]]) - sdf([p[0] - e, p[1], p[2]]), gy = sdf([p[0], p[1] + e, p[2]]) - sdf([p[0], p[1] - e, p[2]]), gz = sdf([p[0], p[1], p[2] + e]) - sdf([p[0], p[1], p[2] - e]);
    const l = Math.hypot(gx, gy, gz) || 1; gx /= l; gy /= l; gz /= l; N[v * 3] = gx; N[v * 3 + 1] = gy; N[v * 3 + 2] = gz;
    // ambient occlusion: how much the surface is crowded along its normal
    let occ = 0, w = 1; for (let s = 1; s <= 5; s++){ const d = s * .06; occ += w * Math.max(0, d - sdf([p[0] + gx * d, p[1] + gy * d, p[2] + gz * d])); w *= .6; }
    const ao = clamp(1 - occ * 2.4, .25, 1), c = color(p, [gx, gy, gz]);
    C[v * 3] = c[0] * ao; C[v * 3 + 1] = c[1] * ao; C[v * 3 + 2] = c[2] * ao;
  }
  return {pos: P, nor: N, col: C, idx: nv < 65536 ? new Uint16Array(I) : new Uint32Array(I)};
}
