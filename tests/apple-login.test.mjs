// End-to-end API tests against a real SQLite database through a D1-compatible shim.
// Run: node tests/api.test.mjs
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {emAPI, verifyApple} from '../public/_worker.js';
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


const ORIGIN='https://electricman.tusneldax.com';
const env={DB:d1(),EM_APPLE_SERVICE_ID:'test.apple.service'};
const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',keys.publicKey),kid:'apple-test'};
let keyCalls=0;
const fetcher=async (url,init)=>{assert.equal(url,'https://appleid.apple.com/auth/keys');assert.equal(init.redirect,'error');keyCalls++;return Response.json({keys:[jwk]});};
async function token(nonce,extra={}){const now=Math.floor(Date.now()/1000);const h=Buffer.from(JSON.stringify({alg:'RS256',kid:jwk.kid})).toString('base64url'),p=Buffer.from(JSON.stringify({iss:'https://appleid.apple.com',aud:env.EM_APPLE_SERVICE_ID,sub:'apple-user',nonce,iat:now,exp:now+300,...extra})).toString('base64url');const sig=Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(h+'.'+p))).toString('base64url');return h+'.'+p+'.'+sig;}
const api=req=>emAPI(req,env,{fetch:fetcher});
async function start(back='/'){const r=await api(new Request(ORIGIN+'/api/em/auth/apple/start?back='+encodeURIComponent(back)));assert.equal(r.status,302);assert.match(r.headers.get('set-cookie'),/Secure; SameSite=None/);return {url:new URL(r.headers.get('location')),cookie:r.headers.get('set-cookie').split(';')[0]};}
async function finish(flow,fields={},cookie=flow.cookie){const body=new URLSearchParams({state:flow.url.searchParams.get('state'),id_token:await token(flow.url.searchParams.get('nonce')),...fields});return api(new Request(ORIGIN+'/api/em/auth/apple/callback',{method:'POST',headers:{cookie,'content-type':'application/x-www-form-urlencoded',origin:'https://appleid.apple.com'},body}));}
let checks=0;const ok=()=>checks++;
let f=await start('/hunter/');assert.equal(f.url.origin,'https://appleid.apple.com');assert.equal(f.url.searchParams.get('response_type'),'code id_token');assert.equal(f.url.searchParams.get('redirect_uri'),ORIGIN+'/api/em/auth/apple/callback');ok();
let r=await finish(f,{state:'wrong'});assert.equal(r.headers.get('location'),'/hunter/?login=fail');assert.equal(keyCalls,0);ok();
r=await finish(f,{},'');assert.equal(r.headers.get('location'),'/?login=fail');ok();
r=await finish(f,{id_token:await token(f.url.searchParams.get('nonce'),{aud:'wrong'})});assert.equal(r.headers.get('location'),'/hunter/?login=fail');ok();
r=await finish(f);assert.equal(r.headers.get('location'),'/hunter/?login=apple');const session=r.headers.getSetCookie().find(x=>x.startsWith('__Host-em-session='));assert.ok(session);assert.match(session,/SameSite=Lax/);ok();
const count=env.DB.raw.prepare('SELECT COUNT(*) n FROM em_players').get().n;
r=await finish(f);assert.equal(r.headers.get('location'),'/hunter/?login=fail');assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM em_players').get().n,count);ok();
f=await start('https://evil.example');r=await finish(f);assert.equal(r.headers.get('location'),'/?login=apple');assert.equal(env.DB.raw.prepare('SELECT COUNT(*) n FROM em_players').get().n,count);ok();
f=await start('/app-login.html?app=hunter&challenge=abc');r=await finish(f);assert.equal(r.headers.get('location'),'/app-login.html?app=hunter&challenge=abc&login=apple');ok();
f=await start();env.DB.raw.exec('UPDATE em_nonces SET expires=0');r=await finish(f);assert.equal(r.headers.get('location'),'/?login=fail');ok();
f=await start();r=await finish(f,{error:'user_cancelled_authorize'});assert.equal(r.headers.get('location'),'/?login=fail');r=await finish(f);assert.equal(r.headers.get('location'),'/?login=fail');ok();
for(const extra of [{iss:'https://accounts.google.com'},{nonce:'wrong'},{exp:1},{iat:Math.floor(Date.now()/1000)+120}]){await assert.rejects(()=>verifyAppleToken(extra));ok();}
async function verifyAppleToken(extra){return verifyApple(await token('n',extra),env.EM_APPLE_SERVICE_ID,'n',fetcher);}
const good=await token('n');await assert.rejects(()=>verifyApple(good.slice(0,-10)+'AAAAAAAAAA',env.EM_APPLE_SERVICE_ID,'n',fetcher));ok();
const disabled=await emAPI(new Request(ORIGIN+'/api/em/auth/apple/start'),{DB:env.DB});assert.equal(disabled.status,503);ok();
console.log(checks+' Apple login security checks passed');
