import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const origin='https://em-apple30-test-20261026.guclu-limited.workers.dev';
const report={origin,syntheticJWT:true,realAppleAccountVerified:false,productionModified:false,checks:[]};
const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk={...await crypto.subtle.exportKey('jwk',keys.publicKey),kid:'staging-synthetic-only'};
const post=(path,body,from=origin)=>fetch(origin+path,{method:'POST',headers:{origin:from,'content-type':'application/json'},body:JSON.stringify(body),redirect:'error'});
const check=(name,actual,expected)=>{assert.equal(actual,expected,name);report.checks.push({name,actual,expected,passed:true});};
const nonce=async()=>{const r=await post('/api/em/native/apple/nonce',{});check('real nonce endpoint',r.status,200);return (await r.json()).nonce;};
async function token(nonce,extra={}) {
 const now=Math.floor(Date.now()/1000),enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const data=enc({alg:'RS256',kid:jwk.kid})+'.'+enc({iss:'https://appleid.apple.com',aud:'com.tusneldax.electricman',nonce,sub:'staging-only-user',iat:now,exp:now+300,...extra});
 return data+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(data))).toString('base64url');
}
for(const aud of ['com.tusneldax.electricman','com.tusneldax.electricman.web']) {
 const n=await nonce(),signed=await token(n,{aud});
 // Ordinary route trusts Apple's real JWKS, never the synthetic key.
 check('real JWKS rejects synthetic '+aud,(await post('/api/em/native/apple',{nonce:n,token:signed})).status,401);
 const oracle=async value=>(await (await post('/__oracle',{nonce:n,token:value,jwk})).json()).status;
 for(const [name,extra] of [['unknown audience',{aud:'evil.example'}],['issuer',{iss:'https://evil.example'}],['nonce',{nonce:'f'.repeat(64)}],['expiry',{exp:1}]]) check(name,await oracle(await token(n,extra)),401);
 check('bad signature',await oracle(signed.slice(0,-10)+'AAAAAAAAAA'),401);
 check('synthetic signature accepted '+aud,await oracle(signed),200);
 check('replay rejected '+aud,await oracle(signed),401);
}
check('cross origin rejected',(await post('/api/em/native/apple/nonce',{},'https://evil.example')).status,403);
const web=await fetch(origin+'/api/em/auth/apple/start',{redirect:'manual'});
check('web redirect',web.status,302);
const target=new URL(web.headers.get('location'));
assert.equal(target.searchParams.get('client_id'),'com.tusneldax.electricman.web');
assert.equal(target.searchParams.get('redirect_uri'),origin+'/api/em/auth/apple/callback');
report.webReturnURL=target.searchParams.get('redirect_uri');
report.webReturnRegisteredWithApple='not verified; existing production callback configuration unchanged';
report.passed=true;report.at=new Date().toISOString();
mkdirSync('evidence',{recursive:true});writeFileSync('evidence/apple-staging30.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
