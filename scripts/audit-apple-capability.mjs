// Approved ASC identity, READ ONLY. No private key/certificate files are opened
// or written. The existing CI secret is used solely inside this process.
import {createPrivateKey,sign} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
let stage='configuration';
const report={scope:'READ_ONLY_APP_ID_CAPABILITY_AUDIT',bundleId:'com.tusneldax.electricman',privateKeyFilesOpened:false,privateKeyFilesWritten:false,certificateOperations:false,storeUpload:false};
try{
 const raw=process.env.APPLE_AUDIT_PRIVATE_KEY;
 const kid=process.env.APPLE_AUDIT_KEY_ID,iss=process.env.APPLE_AUDIT_ISSUER;
 if(!raw||!kid||!iss)throw new Error('missing-configuration');
 report.requestedIdentityMatchesConfigured=kid==='7368ZSQD95';
 stage='key-parse-in-memory';
 const body=raw.replaceAll('\\n','\n').replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');
 const key=createPrivateKey({key:Buffer.from(body,'base64'),format:'der',type:'pkcs8'});
 const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const now=Math.floor(Date.now()/1000);
 const payload=enc({alg:'ES256',kid,typ:'JWT'})+'.'+enc({iss,iat:now,exp:now+180,aud:'appstoreconnect-v1'});
 const bearer=payload+'.'+sign('sha256',Buffer.from(payload),{key,dsaEncoding:'ieee-p1363'}).toString('base64url');
 async function get(path){
  const r=await fetch('https://api.appstoreconnect.apple.com/v1/'+path,{headers:{Authorization:'Bearer '+bearer},redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!r.ok){report.httpStatus=r.status;throw new Error('request-failed');}
  return r.json();
 }
 stage='bundle-lookup';
 const data=await get('bundleIds?'+new URLSearchParams({'filter[identifier]':report.bundleId,limit:'2'}));
 if(data.data?.length!==1)throw new Error('bundle-not-found');
 stage='capability-lookup';
 const caps=await get('bundleIds/'+encodeURIComponent(data.data[0].id)+'/bundleIdCapabilities');
 report.signInWithAppleEnabled=caps.data?.some(c=>c.attributes?.capabilityType==='SIGN_IN_WITH_APPLE')===true;
 report.passed=true;
}catch{
 report.passed=false;report.failedStage=stage;process.exitCode=1;
}finally{
 mkdirSync('evidence',{recursive:true});
 writeFileSync('evidence/apple-capability.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}
