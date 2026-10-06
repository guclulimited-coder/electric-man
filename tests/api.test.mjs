// End-to-end API tests against a real SQLite database through a D1-compatible shim.
// Run: node tests/api.test.mjs
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import worker, {emAPI} from '../public/_worker.js';
import {generate, rotN, BASE} from '../src/engine.mjs';

function d1(){
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  const stmt = (q, v = []) => ({
    bind: (...a) => stmt(q, a),
    first: async () => db.prepare(q).get(...v) ?? null,
    run: async () => { const r = db.prepare(q).run(...v); return {meta:{changes: Number(r.changes)}}; },
    all: async () => ({results: db.prepare(q).all(...v)}),
    _exec(){ return db.prepare(q).run(...v); },
  });
  return {prepare: q => stmt(q), batch: async list => { db.exec('BEGIN'); try { list.forEach(s => s._exec()); db.exec('COMMIT'); } catch (e){ db.exec('ROLLBACK'); throw e; } return []; }, raw: db};
}

const ORIGIN = 'https://electricman.tusneldax.com';
let sentMail = [];
const keys = await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5', modulusLength:2048, publicExponent:new Uint8Array([1,0,1]), hash:'SHA-256'}, true, ['sign', 'verify']);
const jwk = {...await crypto.subtle.exportKey('jwk', keys.publicKey), kid:'k1'};
const fakeFetch = async (url, init) => {
  if (String(url).startsWith('https://api.resend.com')){ sentMail.push(JSON.parse(init.body)); return new Response('{}', {status:200}); }
  if (String(url).startsWith('https://www.googleapis.com/oauth2/v3/certs')) return Response.json({keys:[jwk]});
  throw new Error('unexpected fetch ' + url);
};
const b64u = o => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
async function googleToken(sub, nonce, aud = 'client-123'){
  const now = Math.floor(Date.now() / 1000);
  const h = b64u({alg:'RS256', kid:'k1'}), c = b64u({iss:'https://accounts.google.com', aud, sub, nonce, iat:now, exp:now + 600});
  const sig = Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(h + '.' + c))).toString('base64url');
  return h + '.' + c + '.' + sig;
}

const env = {DB: d1(), EM_GOOGLE_CLIENT_ID:'client-123', EM_EMAIL_ENABLED:'true', EM_RESEND_API_KEY:'test', EM_EMAIL_FROM:'Electric Man <giris@mail.tusneldax.com>', EM_EMAIL_OTP_SECRET:'x'.repeat(40), AI:{calls:0, async run(model, inp){ this.calls++; return {translated_text: '['+inp.source_lang+'>'+inp.target_lang+'] '+inp.text}; }}};

class Client {
  constructor(ip){ this.jar = {}; this.ip = ip; }
  async call(path, body, opts = {}){
    const headers = {'CF-Connecting-IP': this.ip, cookie: Object.entries(this.jar).map(([k, v]) => k + '=' + v).join('; ')};
    if (body !== undefined){ headers['content-type'] = 'application/json'; headers.origin = opts.origin || ORIGIN; }
    const res = await emAPI(new Request(ORIGIN + '/api/em' + path, {method: body !== undefined ? 'POST' : 'GET', headers, body: body !== undefined ? JSON.stringify(body) : undefined}), env, {fetch: fakeFetch});
    for (const c of res.headers.getSetCookie()){ const [kv] = c.split(';'); const [k, v] = kv.split('='); if (v) this.jar[k] = v; else delete this.jar[k]; }
    return {status: res.status, body: await res.json()};
  }
}
let passed = 0; const ok = (name) => { passed++; console.log('ok', name); };

// config + guards
const anon = new Client('1.1.1.1');
assert.deepEqual((await anon.call('/config')).body, {googleClientId:'client-123', email:true, purchases:false, maxLevel:300}); ok('config');
assert.equal((await anon.call('/progress')).status, 401); ok('progress needs login');
assert.equal((await anon.call('/auth/nonce', {}, {origin:'https://evil.example'})).status, 403); ok('cross-origin POST refused');

// email login
const a = new Client('2.2.2.2');
await a.call('/auth/nonce', {});
const req = await a.call('/auth/email/request', {email:'Omer@Example.com'});
assert.equal(req.status, 200);
const code = sentMail.at(-1).text.match(/kodun: (\d{6})/)[1];
assert.equal((await a.call('/auth/email', {email:'omer@example.com', challenge:req.body.challenge, code:'000000'})).status, 401); ok('wrong code refused');
const login = await a.call('/auth/email', {email:'omer@example.com', challenge:req.body.challenge, code});
assert.equal(login.status, 200, JSON.stringify(login.body)); ok('email login');
const meA = (await a.call('/me')).body.player; assert.match(meA.code, /^EM[0-9A-F]{6}$/); ok('player code');

// google login (second player) + replay protection of nonce
const b = new Client('3.3.3.3');
const n = (await b.call('/auth/nonce', {})).body.nonce;
assert.equal((await b.call('/auth/google', {token: await googleToken('g-sub-1', 'wrong-nonce')})).status, 401); ok('google wrong nonce refused');
assert.equal((await b.call('/auth/google', {token: await googleToken('g-sub-1', n, 'other-client')})).status, 401); ok('google wrong audience refused');
assert.equal((await b.call('/auth/google', {token: await googleToken('g-sub-1', n)})).status, 200); ok('google login');
const meB = (await b.call('/me')).body.player;
const b2 = new Client('3.3.3.4'); const n2 = (await b2.call('/auth/nonce', {})).body.nonce;
await b2.call('/auth/google', {token: await googleToken('g-sub-1', n2)});
assert.equal((await b2.call('/me')).body.player.code, meB.code); ok('same google account → same player');

// progress CAS
const save = {max:5, coins:120, stars:{1:3, 2:2, 3:1, 4:3}, char:'zeynep'};
assert.equal((await a.call('/progress', {save, revision:0})).body.revision, 1);
assert.equal((await a.call('/progress', {save, revision:0})).status, 409); ok('stale save refused');
assert.deepEqual((await a.call('/progress')).body.save, save); ok('save round-trip');
assert.equal((await a.call('/progress', {save:{...save, max:999}, revision:1})).status, 400); ok('invalid save refused');

// verified level clear → league
function solve(level){ const g = generate(level), acts = []; for (const t of g.tiles){ if (t.kind !== 'cable' || t.fixed) continue; if (t.broken) acts.push([t.idx, 0]); let r = t.rot, k = 0; while (rotN(BASE[t.shape], r) !== t.sol && k < 4){ acts.push([t.idx, 1]); r = (r + 1) % 4; k++; } } return acts; }
const clear = await a.call('/clear', {level:1, actions: solve(1)});
assert.equal(clear.status, 200); assert.ok(clear.body.stars >= 1); ok('verified clear');
assert.equal((await a.call('/clear', {level:12, actions:[]})).status, 400); ok('unsolved clear refused');
await b.call('/clear', {level:1, actions: solve(1)}); await b.call('/clear', {level:2, actions: solve(2)});
const league = (await a.call('/league')).body;
assert.equal(league.rows[0].code, meB.code); assert.equal(league.rows.length, 2); assert.ok(league.rows.find(r => r.me)); ok('weekly league');

// friends
assert.equal((await a.call('/friends', {action:'request', code:'EMNOPE00'})).status, 404); ok('unknown code');
await a.call('/friends', {action:'request', code: meB.code});
let fb = (await b.call('/friends')).body.friends; assert.equal(fb[0].incoming, true);
await b.call('/friends', {action:'accept', code: meA.code});
fb = (await b.call('/friends')).body.friends; assert.equal(fb[0].status, 'accepted'); assert.equal(fb[0].max, 5); ok('friend request + accept');

// badges, chat, translation, report
assert.deepEqual((await a.call('/badges')).body, {requests:0, unread:0}); ok('badges empty');
const c = new Client('4.4.4.4'); { const n = (await c.call('/auth/nonce', {})).body.nonce; await c.call('/auth/google', {token: await googleToken('g-sub-2', n)}); }
const meC = (await c.call('/me')).body.player;
await c.call('/friends', {action:'request', code: meA.code});
assert.equal((await a.call('/badges')).body.requests, 1); ok('friend request badge');
assert.equal((await c.call('/chat', {to: meA.code, text:'selam'})).status, 403); ok('chat needs accepted friendship');
const sent = await b.call('/chat', {to: meA.code, text:'Hallo Freund!', lang:'de'});
assert.equal(sent.status, 200); assert.equal(sent.body.message.mine, true);
await b.call('/chat', {to: meA.code, text:'  zweite  ', lang:'de'});
assert.equal((await a.call('/badges')).body.unread, 2); ok('unread badge');
assert.equal((await a.call('/friends')).body.friends.find(f => f.code === meB.code).unread, 2); ok('unread per friend');
const conv = (await a.call('/chat?with=' + meB.code)).body;
assert.equal(conv.messages.length, 2); assert.equal(conv.messages[1].text, 'zweite'); assert.equal(conv.messages[0].mine, false);
assert.equal((await a.call('/badges')).body.unread, 0); ok('reading clears unread');
assert.equal((await a.call('/chat?with=' + meB.code + '&after=' + conv.messages[1].id)).body.messages.length, 0); ok('poll after id');
const tr1 = (await a.call('/translate', {ids: conv.messages.map(m => m.id), to:'tr'})).body.tr;
assert.equal(tr1[conv.messages[0].id], '[de>tr] Hallo Freund!');
await a.call('/translate', {ids: [conv.messages[0].id], to:'tr'}); assert.equal(env.AI.calls, 2); ok('translation + cache');
assert.deepEqual((await c.call('/translate', {ids: [conv.messages[0].id], to:'en'})).body.tr, {}); ok('cannot translate others\' messages');
assert.equal((await b.call('/chat', {to: meA.code, text:'x'.repeat(301)})).status, 400); ok('message length limit');
assert.equal((await c.call('/report', {code: meA.code, reason:'test'})).status, 200);
assert.equal((await a.call('/badges')).body.requests, 0); ok('report blocks and drops request');
assert.equal((await c.call('/friends', {action:'request', code: meA.code})).status, 404); ok('blocked cannot re-request');

// native app sign-in: ticket bound to a PKCE challenge, exchanged once for an app session
{ const verifier = 'ab'.repeat(32), challenge = (await import('node:crypto')).createHash('sha256').update(verifier).digest('hex');
  const t = await b.call('/native/ticket', {challenge}); assert.equal(t.status, 200);
  const app = new Client('5.5.5.5');
  assert.equal((await app.call('/native/exchange', {ticket: t.body.ticket, verifier: 'cd'.repeat(32)})).status, 401);
  const t2 = await b.call('/native/ticket', {challenge});
  const ex = await app.call('/native/exchange', {ticket: t2.body.ticket, verifier}); assert.equal(ex.status, 200); assert.match(ex.body.token, /^[a-f0-9]{64}$/);
  app.jar['__Host-em-session'] = ex.body.token;
  assert.equal((await app.call('/me')).body.player.code, meB.code);
  assert.equal((await app.call('/native/exchange', {ticket: t2.body.ticket, verifier})).status, 401); ok('native ticket exchange (one-time, PKCE)'); }
await b.call('/progress', {save:{max:3, coins:10, stars:{}, avatar:'zeynep'}, revision:0});
assert.equal((await a.call('/friends')).body.friends.find(f => f.code === meB.code).avatar, 'zeynep'); ok('avatar in friend list');

// Electric Hunter: same account, separate save + weekly league
assert.equal((await b.call('/eh/progress')).body.save, null);
assert.equal((await b.call('/eh/progress', {save:{save:{isl:2, gear:[{id:'pense', lv:3}]}, coins:150}, revision:0})).body.revision, 1);
assert.equal((await b.call('/eh/progress', {save:{save:{isl:3}}, revision:0})).status, 409);
assert.equal((await b.call('/eh/progress')).body.save.save.isl, 2);
assert.equal((await b.call('/progress')).body.save.avatar, 'zeynep'); ok('hunter save is separate from Electric Man');
assert.equal((await b.call('/eh/progress', {save:{save:{isl:-1}}, revision:1})).status, 400);
assert.equal((await b.call('/eh/progress', {save:{blob:'x'.repeat(30000)}, revision:1})).status, 400); ok('hunter save validated');
assert.equal((await b.call('/eh/score', {island:3, power:1500})).status, 200);
await b.call('/eh/score', {island:2, power:9000});
assert.equal((await b.call('/eh/score', {island:0, power:5})).status, 400);
const hl = (await a.call('/eh/league')).body.rows; assert.equal(hl[0].code, meB.code); assert.equal(hl[0].island, 3); assert.equal(hl[0].power, 9000); ok('hunter league keeps best island and power');
assert.equal((await a.call('/eh/friends')).body.friends.find(f => f.code === meB.code).island, 3); ok('hunter friend list shows island');
{ const portal = await worker.fetch(new Request('https://portal.tusneldax.com/i18n/tr.json'), {...env, ASSETS: {fetch: async r => new Response('page:' + new URL(r.url).pathname)}});
  assert.equal(await portal.text(), 'page:/hunter/i18n/tr.json'); ok('portal host serves /hunter'); }

// profile, logout, delete
assert.equal((await a.call('/profile', {name:'Ömer <script>'})).body.name, 'Ömer script'); ok('name cleaned');
assert.equal((await a.call('/delete-account', {confirm:'no'})).status, 400);
assert.equal((await a.call('/delete-account', {confirm:'DELETE'})).status, 200);
assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM em_messages').get().n, 0);
assert.equal((await a.call('/me')).body.player, null);
assert.equal((await b.call('/friends')).body.friends.length, 0); ok('account deletion removes data');
await b.call('/logout', {}); assert.equal((await b.call('/me')).body.player, null); ok('logout');

// static routing through the Pages entry
const assets = {fetch: async r => new Response('page:' + new URL(r.url).pathname)};
const page = await worker.fetch(new Request(ORIGIN + '/gizlilik'), {...env, ASSETS: assets});
assert.equal(await page.text(), 'page:/gizlilik'); assert.equal(page.headers.get('X-Content-Type-Options'), 'nosniff'); ok('static routing');

// rate limit
const spam = new Client('9.9.9.9'); let limited = false;
for (let i = 0; i < 45; i++){ if ((await spam.call('/auth/nonce', {})).status === 429){ limited = true; break; } }
assert.ok(limited); ok('rate limit');
console.log(`\n${passed} checks passed`);
