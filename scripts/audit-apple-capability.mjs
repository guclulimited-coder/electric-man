// ASC audit, optionally enabling the specifically requested Apple login capability.
// No private key/certificate files are opened
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
 let bearer;
 // Apple has distinct team (iss) and individual (sub=user) token formats.
 // Test identity with a filtered read; never assume an individual key can use
 // Provisioning endpoints merely because it can upload builds.
 stage='identity-check';report.authenticationModes=[];
 for(const identity of [{kid,label:'requested'},{kid:'AMWHRWY3U4',label:'existing-build-workflow'}]){
 for(const mode of ['team','individual']){
  const claims={...(mode==='team'?{iss}:{sub:'user'}),iat:now,exp:now+180,aud:'appstoreconnect-v1'};
  const payload=enc({alg:'ES256',kid:identity.kid,typ:'JWT'})+'.'+enc(claims);
  const candidate=payload+'.'+sign('sha256',Buffer.from(payload),{key,dsaEncoding:'ieee-p1363'}).toString('base64url');
  const r=await fetch('https://api.appstoreconnect.apple.com/v1/apps?'+new URLSearchParams({'filter[bundleId]':report.bundleId,limit:'1'}),{headers:{Authorization:'Bearer '+candidate},redirect:'error',signal:AbortSignal.timeout(15000)});
  report.authenticationModes.push({identity:identity.label,mode,httpStatus:r.status});
  if(r.ok){bearer=candidate;report.identityValidated=true;report.identityType=mode;report.validatedKeyId=identity.kid;break;}
 }
 if(bearer)break;
 }
 if(!bearer)throw new Error('identity-not-validated');
 async function get(path){
  const r=await fetch('https://api.appstoreconnect.apple.com/v1/'+path,{headers:{Authorization:'Bearer '+bearer},redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!r.ok){report.httpStatus=r.status;throw new Error('request-failed');}
  return r.json();
 }
 stage='bundle-lookup';
 const data=await get('bundleIds?'+new URLSearchParams({'filter[identifier]':report.bundleId,limit:'2'}));
 report.bundleMatches=data.data?.map(b=>({id:b.id,identifier:b.attributes?.identifier,platform:b.attributes?.platform}));
 const bundles=data.data?.filter(b=>b.attributes?.identifier===report.bundleId && ['IOS','UNIVERSAL'].includes(b.attributes?.platform))||[];
 if(bundles.length!==1)throw new Error('bundle-not-found');
 stage='capability-lookup';
 let caps=await get('bundleIds/'+encodeURIComponent(bundles[0].id)+'/bundleIdCapabilities');
 if(process.env.APPLE_ENABLE_CAPABILITY==='true' && !caps.data?.some(c=>c.attributes?.capabilityType==='APPLE_ID_AUTH')) {
  stage='enable-apple-capability';report.scope='ENABLE_REQUESTED_APPLE_LOGIN_CAPABILITY';
  const r=await fetch('https://api.appstoreconnect.apple.com/v1/bundleIdCapabilities',{method:'POST',headers:{Authorization:'Bearer '+bearer,'Content-Type':'application/json'},body:JSON.stringify({data:{type:'bundleIdCapabilities',attributes:{capabilityType:'APPLE_ID_AUTH',settings:[{key:'APPLE_ID_AUTH_APP_CONSENT',options:[{key:'PRIMARY_APP_CONSENT'}]}]},relationships:{bundleId:{data:{type:'bundleIds',id:bundles[0].id}}}}}),redirect:'error'});
  report.enableCapabilityHTTPStatus=r.status;
  if(!r.ok)throw new Error('capability-enable-failed');
  caps=await get('bundleIds/'+encodeURIComponent(bundles[0].id)+'/bundleIdCapabilities');
 }
 report.signInWithAppleEnabled=caps.data?.some(c=>['APPLE_ID_AUTH','SIGN_IN_WITH_APPLE'].includes(c.attributes?.capabilityType))===true;
 report.capabilityTypes=caps.data?.map(c=>c.attributes?.capabilityType);
 const certs=await get('certificates?'+new URLSearchParams({'filter[certificateType]':'DISTRIBUTION,IOS_DISTRIBUTION',limit:'100'}));
 report.distributionCertificateCount=certs.data?.length;
 report.currentBuild30LeafActive=certs.data?.some(c=>c.attributes?.serialNumber?.toUpperCase()==='20F8887B9CF8918B123F566361D20356');
 report.certificateInventory=certs.data?.map(c=>({id:c.id,type:c.attributes?.certificateType,serialNumber:c.attributes?.serialNumber,expirationDate:c.attributes?.expirationDate}));
 report.activeDistributionCertificatesByType={};
 for(const cert of certs.data||[]){const a=cert.attributes;if(Date.parse(a.expirationDate)>Date.now())report.activeDistributionCertificatesByType[a.certificateType]=(report.activeDistributionCertificatesByType[a.certificateType]||0)+1;}
 report.passed=true;
}catch{
 report.passed=false;report.failedStage=stage;process.exitCode=1;
}finally{
 mkdirSync('evidence',{recursive:true});
 writeFileSync('evidence/apple-capability.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}
