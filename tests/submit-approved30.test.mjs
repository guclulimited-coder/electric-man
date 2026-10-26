// Offline fixture only: verify narrow app/version scope before real review writes.
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const moduleURL=new URL('../scripts/submit-approved30.mjs',import.meta.url);
process.env.ASC_PRIVATE_KEY=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey.export({type:'pkcs8',format:'pem'});
const previous=process.cwd(),realFetch=globalThis.fetch,realLog=console.log;
for(const wrongApp of [false,true]) {
 const dir=mkdtempSync(join(tmpdir(),'em-review-fixture-'));process.chdir(dir);
 const writes=[];console.log=()=>{};
 globalThis.fetch=async(url,init)=>{
  assert(url.startsWith('https://api.appstoreconnect.apple.com/v1/'));
  assert(init.headers.Authorization.startsWith('Bearer '));
  const path=new URL(url).pathname.slice(4),method=init.method;
  if(method!=='GET'){writes.push({path,...JSON.parse(init.body)});return Response.json({data:{}});}
  const data=path==='apps'?[{id:'app',attributes:{bundleId:wrongApp?'com.tusneldax.electrichunter':'com.tusneldax.electricman'}}]:
   path==='apps/app/appStoreVersions'?[{id:'version',attributes:{versionString:'1.0',appStoreState:'REJECTED'}}]:
   path==='builds'?[{id:'build30',attributes:{version:'30',processingState:'VALID'}}]:
   path==='appStoreVersions/version/relationships/build'?{id:'build29'}:
   path==='appStoreVersions/version/appStoreReviewDetail'?{id:'detail',attributes:{notes:'Keep previous review context.'}}:
   path==='reviewSubmissions'?[{id:'submission',attributes:{state:'UNRESOLVED_ISSUES'}}]:
   path==='reviewSubmissions/submission/items'?[{id:'item',attributes:{state:'REJECTED'},relationships:{appStoreVersion:{data:{id:'version'}}}}]:
   path==='reviewSubmissions/submission'?{attributes:{state:'WAITING_FOR_REVIEW'}}:
   path==='appStoreVersions/version'?{attributes:{appStoreState:'WAITING_FOR_REVIEW'}}:null;
  assert(data!==null,path);return Response.json({data});
 };
 await import(moduleURL.href+'?scenario='+wrongApp);
 const report=JSON.parse(readFileSync('evidence/submit30/result.json','utf8'));
 if(wrongApp){assert.equal(writes.length,0);assert.equal(report.error,'app-scope-mismatch');process.exitCode=0;}
 else {assert.equal(report.submitted,true);assert.equal(writes.length,4);assert.equal(writes[0].data.id,'build30');assert(writes[1].data.attributes.notes.startsWith('Keep previous review context.'));assert.equal(writes[2].data.attributes.resolved,true);assert.equal(writes[3].data.attributes.submitted,true);}
}
process.chdir(previous);globalThis.fetch=realFetch;console.log=realLog;
console.log('2 offline submission scenarios passed: Electric Man build30 resubmission; wrong app makes zero writes.');
