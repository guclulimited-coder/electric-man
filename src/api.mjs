/* Electric Man API — Cloudflare Pages Functions (advanced mode _worker.js) + D1.
   Accounts are separate from Bus Rush: own tables (em_*), own cookies, own identity hashing.
   Patterns (nonce-bound Google ID tokens, email OTP via Resend, CAS saves, quotas) follow the
   audited Bus Rush backend. */
import {replay, MAX_LEVEL} from './engine.mjs';

const ROOT = '/api/em', COOKIE = '__Host-em-session', NONCE = '__Host-em-nonce';
const enc = new TextEncoder();
const hex = a => Array.from(new Uint8Array(a), v => v.toString(16).padStart(2, '0')).join('');
const hash = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const isTok = s => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
const cookie = (r, k) => (r.headers.get('cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(k + '='))?.slice(k.length + 1) || '';
const ck = (k, v, age) => `${k}=${v}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const reply = (body, status = 200, headers = {}) => Response.json(body, {status, headers: {'Cache-Control': 'no-store', ...headers}});
const one = (db, q, ...v) => db.prepare(q).bind(...v).first();
const run = (db, q, ...v) => db.prepare(q).bind(...v).run();
const rows = async (db, q, ...v) => (await db.prepare(q).bind(...v).all()).results;
export function fail(code, status = 400){ throw Object.assign(new Error(code), {status}); }

export function week(now = Date.now()){ const d = new Date(now); d.setUTCHours(0,0,0,0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); }
export function cleanName(name){ return String(name || '').normalize('NFKC').replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 24); }

/* A save is the player's own record; it is validated for shape and bounds only.
   Coins are not real money and purchases are not enabled on the web. */
export function safeSave(p){
  if (!p || typeof p !== 'object' || Array.isArray(p)) fail('INVALID_SAVE');
  if (JSON.stringify(p).length > 20000) fail('SAVE_TOO_LARGE');
  const max = p.max, coins = p.coins;
  if (!Number.isSafeInteger(max) || max < 1 || max > MAX_LEVEL || !Number.isSafeInteger(coins) || coins < 0 || coins > 10000000) fail('INVALID_SAVE');
  const stars = p.stars;
  if (!stars || typeof stars !== 'object' || Array.isArray(stars)) fail('INVALID_SAVE');
  const out = {max, coins, stars:{}};
  for (const [k, v] of Object.entries(stars)){
    if (!/^[1-9][0-9]{0,2}$/.test(k) || Number(k) > MAX_LEVEL || ![1,2,3].includes(v)) fail('INVALID_SAVE');
    out.stars[k] = v;
  }
  if (typeof p.char === 'string' && /^[a-z]{1,16}$/.test(p.char)) out.char = p.char;
  return out;
}

async function bounded(req){
  const reader = req.body?.getReader(); if (!reader) return {};
  let size = 0; const chunks = [];
  for (;;){ const {done, value} = await reader.read(); if (done) break; size += value.length; if (size > 40000){ await reader.cancel(); fail('REQUEST_TOO_LARGE', 413); } chunks.push(value); }
  const a = new Uint8Array(size); let i = 0; for (const c of chunks){ a.set(c, i); i += c.length; }
  try { return JSON.parse(new TextDecoder().decode(a)); } catch { fail('BAD_JSON'); }
}
async function quota(db, key, max, ms){
  const bucket = Math.floor(Date.now() / ms), id = await hash(key + ':' + bucket);
  const q = await one(db, 'INSERT INTO em_limits(id,n,expires) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET n=n+1 RETURNING n', id, Date.now() + ms * 2);
  if (q.n > max) fail('RATE_LIMIT', 429);
}

/* Google ID token: RS256, issuer, audience, nonce, freshness, signature against Google's keys. */
export async function verifyGoogle(token, aud, nonce, fetcher = fetch){
  if (!aud) fail('LOGIN_NOT_CONFIGURED', 503);
  if (typeof token !== 'string' || token.length > 16000) fail('INVALID_IDENTITY', 401);
  const decode = s => Uint8Array.from(atob(s.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
  const parts = token.split('.'); if (parts.length !== 3) fail('INVALID_IDENTITY', 401);
  let h, c; try { h = JSON.parse(new TextDecoder().decode(decode(parts[0]))); c = JSON.parse(new TextDecoder().decode(decode(parts[1]))); } catch { fail('INVALID_IDENTITY', 401); }
  const now = Date.now() / 1000;
  if (h.alg !== 'RS256' || !['accounts.google.com', 'https://accounts.google.com'].includes(c.iss) || c.aud !== aud || c.nonce !== nonce ||
      !Number.isFinite(c.exp) || c.exp <= now || !Number.isFinite(c.iat) || c.iat > now + 60 || c.iat < now - 600 || typeof c.sub !== 'string' || !c.sub || c.sub.length > 255) fail('INVALID_IDENTITY', 401);
  const res = await fetcher('https://www.googleapis.com/oauth2/v3/certs', {signal: AbortSignal.timeout(8000)}); if (!res.ok) fail('LOGIN_UNAVAILABLE', 503);
  const jwk = (await res.json()).keys?.find(k => k.kid === h.kid && k.kty === 'RSA'); if (!jwk) fail('INVALID_IDENTITY', 401);
  const key = await crypto.subtle.importKey('jwk', jwk, {name:'RSASSA-PKCS1-v1_5', hash:'SHA-256'}, false, ['verify']);
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decode(parts[2]), enc.encode(parts[0] + '.' + parts[1]))) fail('INVALID_IDENTITY', 401);
  return c;
}

/* ---------- email one-time codes (Resend) ---------- */
export function emailEnabled(env){ return env.EM_EMAIL_ENABLED === 'true' && !!env.EM_RESEND_API_KEY && !!env.EM_EMAIL_FROM && typeof env.EM_EMAIL_OTP_SECRET === 'string' && env.EM_EMAIL_OTP_SECRET.length >= 32; }
export function normalizeEmail(v){
  if (typeof v !== 'string' || v.length > 254) fail('INVALID_EMAIL');
  const s = v.trim().toLowerCase();
  if (!/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(s) || s.includes('..') || s.split('@')[0].length > 64) fail('INVALID_EMAIL');
  return s;
}
async function mac(secret, value){ const key = await crypto.subtle.importKey('raw', enc.encode(secret), {name:'HMAC', hash:'SHA-256'}, false, ['sign']); return hex(await crypto.subtle.sign('HMAC', key, enc.encode(value))); }
function otp(){ let n; do { n = crypto.getRandomValues(new Uint32Array(1))[0]; } while (n >= 4200000000); return String(n % 1000000).padStart(6, '0'); }
async function sendEmailCode(db, env, nonceId, email, expires, fetcher = fetch){
  const id = random(), code = otp(), emailHash = await hash(email), digest = await mac(env.EM_EMAIL_OTP_SECRET, id + ':' + nonceId + ':' + emailHash + ':' + code);
  await db.batch([db.prepare('DELETE FROM em_email_codes WHERE expires<? OR nonce=?').bind(Date.now(), nonceId),
    db.prepare('INSERT INTO em_email_codes(id,nonce,email_hash,digest,attempts,expires) VALUES(?,?,?,?,0,?)').bind(id, nonceId, emailHash, digest, Math.min(expires, Date.now() + 300000))]);
  try {
    const r = await fetcher('https://api.resend.com/emails', {method:'POST', headers:{Authorization:'Bearer ' + env.EM_RESEND_API_KEY, 'Content-Type':'application/json', 'Idempotency-Key':'em-otp-' + id},
      body: JSON.stringify({from: env.EM_EMAIL_FROM, to:[email], subject:'Electric Man giriş kodun: ' + code,
        text:'Electric Man\n\nGiriş kodun: ' + code + '\n\nKod 5 dakika geçerlidir. Kimseyle paylaşma. Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin.\n\nTusneldaX'}), signal: AbortSignal.timeout(10000)});
    await r.body?.cancel?.(); if (!r.ok) fail('EMAIL_UNAVAILABLE', 503);
  } catch { await run(db, 'DELETE FROM em_email_codes WHERE id=?', id); fail('EMAIL_UNAVAILABLE', 503); }
  return {challenge:id};
}
async function verifyEmailCode(db, env, nonceId, body){
  const email = normalizeEmail(body.email);
  if (!isTok(body.challenge) || !/^\d{6}$/.test(body.code || '')) fail('INVALID_CODE', 401);
  const row = await one(db, 'UPDATE em_email_codes SET attempts=attempts+1 WHERE id=? AND nonce=? AND expires>? AND attempts<5 RETURNING *', body.challenge, nonceId, Date.now());
  if (!row) fail('INVALID_CODE', 401);
  const emailHash = await hash(email), digest = await mac(env.EM_EMAIL_OTP_SECRET, body.challenge + ':' + nonceId + ':' + emailHash + ':' + body.code);
  let d = 0; for (let i = 0; i < 64; i++) d |= digest.charCodeAt(i) ^ row.digest.charCodeAt(i);
  if (d || emailHash !== row.email_hash) fail('INVALID_CODE', 401);
  if (!await one(db, 'DELETE FROM em_email_codes WHERE id=? AND digest=? RETURNING id', body.challenge, digest)) fail('INVALID_CODE', 401);
  return {sub: email};
}

/* identity → player (separate namespace from Bus Rush) */
async function resolveIdentity(db, provider, subject){
  if (!['google', 'email'].includes(provider) || typeof subject !== 'string' || !subject || subject.length > 512) fail('INVALID_IDENTITY', 401);
  const key = await hash('electric-man:' + provider + ':' + subject);
  const m = await one(db, 'SELECT player FROM em_identities WHERE id=?', key);
  if (m) return m.player;
  const player = random(), code = 'EM' + player.slice(0, 6).toUpperCase();
  await run(db, 'INSERT INTO em_players(id,name,code,created) VALUES(?,?,?,?)', player, 'Usta ' + player.slice(0, 4).toUpperCase(), code, Date.now());
  await run(db, 'INSERT INTO em_identities(id,provider,player,created) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING', key, provider, player, Date.now());
  const again = await one(db, 'SELECT player FROM em_identities WHERE id=?', key);
  if (again.player !== player) await run(db, 'DELETE FROM em_players WHERE id=?', player);
  return again.player;
}
async function current(req, db){
  const t = cookie(req, COOKIE); if (!isTok(t)) return null;
  return one(db, 'SELECT p.* FROM em_players p JOIN em_sessions s ON s.player=p.id WHERE s.id=? AND s.expires>?', await hash(t), Date.now());
}
async function newSession(db, player){
  const token = random();
  await run(db, 'INSERT INTO em_sessions(id,player,expires) VALUES(?,?,?)', await hash(token), player, Date.now() + 60 * 86400000);
  return ck(COOKIE, token, 60 * 86400);
}
const publicMe = p => ({name:p.name, code:p.code});
const blocked = (db, a, b) => one(db, 'SELECT id FROM em_blocks WHERE (a=? AND b=?) OR (a=? AND b=?)', a, b, b, a);

export async function emAPI(req, env, deps = {}){
  const fetcher = deps.fetch || fetch;
  const url = new URL(req.url), path = url.pathname.slice(ROOT.length), db = env.DB;
  const ip = req.headers.get('CF-Connecting-IP') || 'local';
  try {
    if (!db) fail('SERVICE_UNAVAILABLE', 503);
    if (!['GET', 'POST'].includes(req.method)) fail('METHOD', 405);
    if (req.method === 'POST' && (req.headers.get('origin') !== url.origin || !req.headers.get('content-type')?.includes('application/json'))) fail('ORIGIN', 403);
    if (path === '/config') return reply({googleClientId: env.EM_GOOGLE_CLIENT_ID || null, email: emailEnabled(env), purchases: false, maxLevel: MAX_LEVEL});
    const body = req.method === 'POST' ? await bounded(req) : {};

    if (path === '/auth/nonce' && req.method === 'POST'){
      await quota(db, 'auth:' + ip, 40, 3600000);
      const n = random();
      await db.batch([db.prepare('DELETE FROM em_nonces WHERE expires<?').bind(Date.now()), db.prepare('DELETE FROM em_limits WHERE expires<?').bind(Date.now()),
        db.prepare('INSERT INTO em_nonces(id,expires) VALUES(?,?)').bind(await hash(n), Date.now() + 300000)]);
      return reply({nonce:n}, 200, {'Set-Cookie': ck(NONCE, n, 300)});
    }
    if (path === '/auth/email/request' && req.method === 'POST'){
      if (!emailEnabled(env)) fail('LOGIN_NOT_CONFIGURED', 503);
      const n = cookie(req, NONCE); if (!isTok(n)) fail('LOGIN_EXPIRED', 401);
      const nonce = await one(db, 'SELECT id,expires FROM em_nonces WHERE id=? AND expires>?', await hash(n), Date.now() + 10000);
      if (!nonce) fail('LOGIN_EXPIRED', 401);
      const email = normalizeEmail(body.email);
      await quota(db, 'email-ip:' + ip, 10, 3600000); await quota(db, 'email-minute:' + email, 1, 60000); await quota(db, 'email-hour:' + email, 6, 3600000);
      return reply(await sendEmailCode(db, env, nonce.id, email, nonce.expires, fetcher));
    }
    if ((path === '/auth/google' || path === '/auth/email') && req.method === 'POST'){
      const n = cookie(req, NONCE);
      if (!isTok(n) || !await one(db, 'SELECT id FROM em_nonces WHERE id=? AND expires>?', await hash(n), Date.now())) fail('LOGIN_EXPIRED', 401);
      const provider = path.split('/').at(-1);
      if (provider === 'email' && !emailEnabled(env)) fail('LOGIN_NOT_CONFIGURED', 503);
      const c = provider === 'email' ? await verifyEmailCode(db, env, await hash(n), body) : await verifyGoogle(body.token, env.EM_GOOGLE_CLIENT_ID, n, fetcher);
      if (!await one(db, 'DELETE FROM em_nonces WHERE id=? RETURNING id', await hash(n))) fail('LOGIN_EXPIRED', 401);
      const id = await resolveIdentity(db, provider, c.sub);
      const headers = new Headers({'Cache-Control':'no-store'});
      headers.append('Set-Cookie', await newSession(db, id)); headers.append('Set-Cookie', ck(NONCE, '', 0));
      return Response.json({ok:true}, {headers});
    }
    if (path === '/me'){ const p = await current(req, db); return reply({player: p ? publicMe(p) : null}); }

    const me = await current(req, db); if (!me) fail('LOGIN_REQUIRED', 401);
    await quota(db, 'user:' + me.id, 180, 60000);

    if (path === '/logout' && req.method === 'POST'){ await run(db, 'DELETE FROM em_sessions WHERE id=?', await hash(cookie(req, COOKIE))); return reply({ok:true}, 200, {'Set-Cookie': ck(COOKIE, '', 0)}); }
    if (path === '/profile' && req.method === 'POST'){
      const name = cleanName(body.name); if (name.length < 2) fail('INVALID_NAME');
      await run(db, 'UPDATE em_players SET name=? WHERE id=?', name, me.id); return reply({ok:true, name});
    }
    if (path === '/progress' && req.method === 'GET'){
      const p = await one(db, 'SELECT body,revision,updated FROM em_saves WHERE player=?', me.id);
      return reply(p ? {save: JSON.parse(p.body), revision: p.revision, updated: p.updated} : {save:null, revision:0});
    }
    if (path === '/progress' && req.method === 'POST'){
      const s = safeSave(body.save);
      if (!Number.isSafeInteger(body.revision) || body.revision < 0) fail('INVALID_REVISION');
      const json = JSON.stringify(s), now = Date.now();
      const r = body.revision === 0
        ? await run(db, 'INSERT INTO em_saves(player,body,revision,updated) VALUES(?,?,1,?) ON CONFLICT(player) DO NOTHING', me.id, json, now)
        : await run(db, 'UPDATE em_saves SET body=?,revision=revision+1,updated=? WHERE player=? AND revision=?', json, now, me.id, body.revision);
      if (!r.meta.changes) return reply({error:'SAVE_CONFLICT'}, 409);
      return reply({revision: body.revision + 1, updated: now});
    }
    if (path === '/clear' && req.method === 'POST'){
      await quota(db, 'clear:' + me.id, 30, 60000);
      const res = replay(body.level, body.actions, body.extra);
      if (!res.ok) fail('INVALID_RESULT');
      const w = week(), points = res.stars * 10;
      await run(db, `INSERT INTO em_clears(id,player,week,level,moves,stars,points,created) VALUES(?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET moves=MIN(moves,excluded.moves), stars=MAX(stars,excluded.stars), points=MAX(points,excluded.points)`,
        me.id + ':' + w + ':' + body.level, me.id, w, body.level, res.moves, res.stars, points, Date.now());
      return reply({ok:true, stars:res.stars, moves:res.moves, opt:res.opt});
    }
    if (path === '/league' && req.method === 'GET'){
      const w = week();
      const list = await rows(db, 'SELECT p.code,p.name,SUM(c.points) AS points,COUNT(*) AS levels FROM em_clears c JOIN em_players p ON p.id=c.player WHERE c.week=? GROUP BY c.player ORDER BY points DESC,levels DESC,p.code ASC LIMIT 100', w);
      return reply({week:w, ends: new Date(new Date(w).getTime() + 7 * 86400000).toISOString(), rows: list.map((p, i) => ({...p, rank:i + 1, me: p.code === me.code}))});
    }
    if (path === '/friends' && req.method === 'GET'){
      const list = await rows(db, `SELECT f.status, f.a AS requester, p.code, p.name,
          (SELECT json_extract(body,'$.max') FROM em_saves s WHERE s.player=p.id) AS max
        FROM em_friends f JOIN em_players p ON p.id = CASE WHEN f.a=? THEN f.b ELSE f.a END
        WHERE (f.a=? OR f.b=?) LIMIT 200`, me.id, me.id, me.id);
      return reply({me: publicMe(me), friends: list.map(f => ({code:f.code, name:f.name, max:f.max || 1, status: f.status, incoming: f.status === 'pending' && f.requester !== me.id}))});
    }
    if (path === '/friends' && req.method === 'POST'){
      const other = await one(db, 'SELECT * FROM em_players WHERE code=?', String(body.code || '').trim().toUpperCase());
      if (!other || other.id === me.id) fail('PLAYER_NOT_FOUND', 404);
      const id = [me.id, other.id].sort().join(':');
      if (body.action === 'block'){ await db.batch([db.prepare('INSERT INTO em_blocks(id,a,b) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING').bind(me.id + ':' + other.id, me.id, other.id), db.prepare('DELETE FROM em_friends WHERE id=?').bind(id)]); return reply({ok:true}); }
      if (await blocked(db, me.id, other.id)) fail('PLAYER_NOT_FOUND', 404);
      if (body.action === 'request'){
        await quota(db, 'friend:' + me.id, 30, 86400000);
        const existing = await one(db, 'SELECT a,status FROM em_friends WHERE id=?', id);
        if (existing && existing.status === 'pending' && existing.a === other.id) await run(db, "UPDATE em_friends SET status='accepted' WHERE id=?", id);
        else await run(db, "INSERT INTO em_friends(id,a,b,status) VALUES(?,?,?,'pending') ON CONFLICT(id) DO NOTHING", id, me.id, other.id);
      }
      else if (body.action === 'accept') await run(db, "UPDATE em_friends SET status='accepted' WHERE id=? AND b=?", id, me.id);
      else if (body.action === 'remove') await run(db, 'DELETE FROM em_friends WHERE id=?', id);
      else fail('ACTION');
      return reply({ok:true});
    }
    if (path === '/delete-account' && req.method === 'POST'){
      if (body.confirm !== 'SIL') fail('CONFIRM_DELETE');
      await db.batch(['DELETE FROM em_identities WHERE player=?', 'DELETE FROM em_sessions WHERE player=?', 'DELETE FROM em_saves WHERE player=?', 'DELETE FROM em_clears WHERE player=?', 'DELETE FROM em_players WHERE id=?']
        .map(q => db.prepare(q).bind(me.id)).concat([db.prepare('DELETE FROM em_friends WHERE a=? OR b=?').bind(me.id, me.id), db.prepare('DELETE FROM em_blocks WHERE a=? OR b=?').bind(me.id, me.id)]));
      return reply({ok:true}, 200, {'Set-Cookie': ck(COOKIE, '', 0)});
    }
    fail('NOT_FOUND', 404);
  } catch (e){
    if (!e.status) console.error('em-api', e.name, e.message);
    return reply({error: e.status ? e.message : 'SERVICE_UNAVAILABLE'}, e.status || 503);
  }
}

/* Pages advanced-mode entry: API under /api/em, everything else from static assets. */
export default {
  async fetch(request, env){
    const url = new URL(request.url);
    if (url.pathname.startsWith(ROOT + '/')) return emAPI(request, env);
    if (url.pathname === '/gizlilik' || url.pathname === '/kosullar' || url.pathname === '/hesap-silme') url.pathname += '.html';
    const res = await env.ASSETS.fetch(new Request(url, request));
    const h = new Headers(res.headers);
    h.set('X-Content-Type-Options', 'nosniff'); h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    return new Response(res.body, {status: res.status, headers: h});
  }
};
