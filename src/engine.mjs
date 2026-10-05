/* Electric Man puzzle engine — shared by the game page and the server. Pure, deterministic. */
export function rng(seed){ let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export const HOUSE_COLORS = [0xf07a6a, 0x6f9cf7, 0xf6cd5a, 0x62c995, 0xa684f2, 0xf7a05a, 0x55c8d8, 0xf08cc0];
export const DISTRICTS = ['Köy','Sahil','Orman','Dağ Evleri','Şehir Merkezi','Sanayi','Liman','Kampüs','Çarşı','Boğaz','Adalar','Vadi','Göl Kenarı','Kale','Gökdelenler'];
export const district = lv => DISTRICTS[Math.min(DISTRICTS.length - 1, Math.floor((lv - 1) / 20))];

/* ================= puzzle model ================= */
export const DIRS = [[-1,0,1],[0,1,2],[1,0,4],[0,-1,8]];   // N E S W
export const OPP = {1:4, 2:8, 4:1, 8:2};
export const rot1 = m => ((m << 1) | (m >> 3)) & 15;
export const rotN = (m, n) => { n = ((n % 4) + 4) % 4; for (let i=0;i<n;i++) m = rot1(m); return m; };
export const bits = m => (m&1)+(m>>1&1)+(m>>2&1)+(m>>3&1);
export const BASE = {straight:5, corner:3, tee:7, cross:15};
export const shapeOf = m => { const b = bits(m); return b === 4 ? 'cross' : b === 3 ? 'tee' : (m === 5 || m === 10) ? 'straight' : 'corner'; };

/* difficulty curve for 300 levels */
export function diff(L){
  const size = L <= 1 ? [4,4] : L <= 3 ? [4,5] : L <= 8 ? [5,6] : L <= 20 ? [6,7] : L <= 60 ? [6,8] : L <= 150 ? [7,8] : [7,9];
  return {
    W: size[0], H: size[1],
    dfs: Math.min(.45 + L * .004, .85),
    keep: L <= 2 ? .45 : L <= 4 ? .2 : 0,
    slack: L <= 2 ? Infinity : Math.max(2, 10 - Math.floor(L / 25)),
    fixed: L >= 6 ? Math.min(.08 + (L - 6) * .0015, .22) : 0,
    broken: L >= 9 ? Math.min(.06 + (L - 9) * .0015, .2) : 0,
    fog: L >= 40 ? Math.min(.35 + (L - 40) * .0015, .75) : 0,
  };
}
export function stepsCW(t){ for (let k=0;k<4;k++) if (rotN(BASE[t.shape], t.rot + k) === t.sol) return k; return 0; }
export function stepsBest(t){ const k = stepsCW(t); return t.shape === 'straight' ? Math.min(k, 1) : Math.min(k, (4 - k) % 4); }

export function generate(L){
  const R = rng(L * 104729 + 7), D = diff(L), W = D.W, H = D.H;
  for (let attempt = 0; ; attempt++){
    const sr = 1 + Math.floor(R() * (H - 2)), sc = 1 + Math.floor(R() * (W - 2));
    const mask = Array.from({length:H}, () => Array(W).fill(0));
    const seen = Array.from({length:H}, () => Array(W).fill(false));
    const active = [[sr, sc]]; seen[sr][sc] = true;
    while (active.length){
      const idx = R() < D.dfs ? active.length - 1 : Math.floor(R() * active.length);
      const [r, c] = active[idx];
      const opts = DIRS.filter(([dr, dc]) => { const y=r+dr, x=c+dc; return y>=0 && y<H && x>=0 && x<W && !seen[y][x]; });
      if (!opts.length || (r === sr && c === sc && bits(mask[r][c]) >= 3)){ active.splice(idx, 1); continue; }
      const [dr, dc, b] = opts[Math.floor(R() * opts.length)];
      const y = r+dr, x = c+dc;
      mask[r][c] |= b; mask[y][x] |= OPP[b]; seen[y][x] = true; active.push([y, x]);
    }
    const tiles = []; let houses = 0;
    for (let r=0;r<H;r++) for (let c=0;c<W;c++){
      const m = mask[r][c], t = {r, c, sol:m, idx:r*W+c};
      if (r === sr && c === sc){ t.kind = 'trafo'; t.mask = m; }
      else if (bits(m) === 1){ t.kind = 'house'; t.mask = m; t.color = Math.floor(R() * HOUSE_COLORS.length); t.style = Math.floor(R() * 10); houses++; }
      else {
        t.kind = 'cable'; t.shape = shapeOf(m);
        t.solRot = [0,1,2,3].find(k => rotN(BASE[t.shape], k) === m);
        if (R() < D.keep) t.rot = t.solRot;
        else {
          let rot = Math.floor(R() * 4);
          if (t.shape !== 'cross' && rotN(BASE[t.shape], rot) === m && R() < .85) rot = (t.solRot + 1 + Math.floor(R() * (t.shape === 'straight' ? 1 : 3))) % 4;
          t.rot = rot;
        }
        t.mask = rotN(BASE[t.shape], t.rot);
      }
      tiles.push(t);
    }
    tiles.forEach(t => {
      if (t.kind !== 'cable' || t.shape === 'cross') return;
      const x = R();
      if (x < D.fixed){ t.fixed = true; t.rot = t.solRot; t.mask = t.sol; }
      else if (x < D.fixed + D.broken){ t.broken = true; if (t.mask === t.sol){ t.rot = (t.solRot + 1) % 4; t.mask = rotN(BASE[t.shape], t.rot); } }
    });
    if (D.fog) tiles.forEach(t => { if (t.kind === 'cable' && R() < D.fog) t.fog = true; });
    let opt = 0;
    tiles.forEach(t => { if (t.kind === 'cable') opt += stepsBest(t) + (t.broken ? 1 : 0); });
    if ((houses >= 2 && opt >= Math.min(4, W*H/4)) || attempt > 30) return {W, H, tiles, houses, opt, D};
  }
}


export const MAX_LEVEL = 300;
export const ENGINE_VERSION = 1;

/* tiles reached from the transformer; broken cables do not conduct */
export function powered(tiles, W, H){
  const at = (r, c) => (r>=0 && r<H && c>=0 && c<W) ? tiles[r * W + c] : null;
  const src = tiles.find(t => t.kind === 'trafo');
  const on = new Set([src]); const q = [src];
  while (q.length){
    const t = q.shift();
    for (const [dr, dc, b] of DIRS){
      if (!(t.mask & b)) continue;
      const n = at(t.r + dr, t.c + dc);
      if (n && !n.broken && !on.has(n) && (n.mask & OPP[b])){ on.add(n); q.push(n); }
    }
  }
  return on;
}

export function starsFor(moves, opt){ const extra = moves - opt; return extra <= 2 ? 3 : extra <= 7 ? 2 : 1; }

/* Server-side proof: replay a finished level. Actions:
   [idx, 1|-1] rotate · [idx, 0] repair a broken cable · [idx, 9] hint (sets the tile to its solution). */
export function replay(level, actions, extraMoves = 0){
  if (!Number.isSafeInteger(level) || level < 1 || level > MAX_LEVEL) return {ok:false, error:'LEVEL'};
  if (!Array.isArray(actions) || actions.length > 600) return {ok:false, error:'ACTIONS'};
  const g = generate(level), tiles = g.tiles;
  const limit = g.D.slack === Infinity ? Infinity : g.opt + g.D.slack + Math.max(0, Math.min(50, extraMoves | 0));
  let moves = 0, hints = 0;
  for (const a of actions){
    if (!Array.isArray(a) || a.length !== 2) return {ok:false, error:'ACTION'};
    const [i, k] = a, t = tiles[i];
    if (!Number.isSafeInteger(i) || !t || t.kind !== 'cable') return {ok:false, error:'ACTION'};
    if (k === 9){ t.broken = false; t.rot = t.solRot; t.mask = t.sol; hints++; continue; }
    if (t.fixed) return {ok:false, error:'FIXED'};
    if (k === 0){ if (!t.broken) return {ok:false, error:'NOT_BROKEN'}; t.broken = false; moves++; }
    else if (k === 1 || k === -1){ if (t.broken) return {ok:false, error:'BROKEN'}; t.rot = ((t.rot + k) % 4 + 4) % 4; t.mask = rotN(BASE[t.shape], t.rot); moves++; }
    else return {ok:false, error:'ACTION'};
    if (moves > limit) return {ok:false, error:'LIMIT'};
  }
  const on = powered(tiles, g.W, g.H);
  const lit = tiles.filter(t => t.kind === 'house' && on.has(t)).length;
  if (lit !== g.houses) return {ok:false, error:'NOT_SOLVED'};
  return {ok:true, moves, hints, opt:g.opt, stars:starsFor(moves, g.opt)};
}
