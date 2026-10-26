// Explicitly approved Electric Man 1.0 build 30 submission. No other apps.
import {createPrivateKey,sign} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
const report={scope:'Electric Man 1.0 build30 only',submitted:false,otherAppsModified:false};
const key=createPrivateKey({key:Buffer.from(process.env.ASC_PRIVATE_KEY.replaceAll('\\n','\n').replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,''),'base64'),format:'der',type:'pkcs8'});
const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
async function api(method,path,data) {
 const now=Math.floor(Date.now()/1000),message=enc({alg:'ES256',kid:'AMWHRWY3U4',typ:'JWT'})+'.'+enc({iss:'cab75b07-a305-412b-a205-a91b4280d965',iat:now,exp:now+180,aud:'appstoreconnect-v1'});
 const jwt=message+'.'+sign('sha256',Buffer.from(message),{key,dsaEncoding:'ieee-p1363'}).toString('base64url');
 const r=await fetch('https://api.appstoreconnect.apple.com/v1/'+path,{method,headers:{Authorization:'Bearer '+jwt,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined,redirect:'error',signal:AbortSignal.timeout(30000)});
 const body=r.status===204?{}:await r.json();
 if(!r.ok){report.failedRequest={method,path,status:r.status,errors:body.errors?.map(e=>({code:e.code,title:e.title}))};throw new Error('asc-request-failed');}return body;
}
const q=o=>new URLSearchParams(o);
try {
 const apps=await api('GET','apps?'+q({'filter[bundleId]':'com.tusneldax.electricman','fields[apps]':'bundleId,name',limit:'2'}));
 if(apps.data.length!==1||apps.data[0].attributes.bundleId!=='com.tusneldax.electricman')throw new Error('app-scope-mismatch');
 const app=apps.data[0].id;report.appId=app;
 const versions=await api('GET',`apps/${app}/appStoreVersions?`+q({'filter[platform]':'IOS','fields[appStoreVersions]':'platform,versionString,appStoreState',limit:'20'}));
 const candidates=versions.data.filter(v=>['1.0','1.0.0'].includes(v.attributes.versionString));
 if(candidates.length!==1)throw new Error('version-ambiguous');const version=candidates[0];report.versionId=version.id;report.version=version.attributes.versionString;report.previousVersionState=version.attributes.appStoreState;
 let build;
 for(let i=0;i<65;i++) {
  const builds=await api('GET','builds?'+q({'filter[app]':app,'filter[version]':'30',include:'preReleaseVersion',limit:'10'}));
  const valid=builds.data.filter(b=>b.attributes.version==='30');
  if(valid.length>1)throw new Error('build-ambiguous');build=valid[0];report.buildProcessingState=build?.attributes.processingState??'NOT_VISIBLE';
  if(build?.attributes.processingState==='VALID')break;
  if(['INVALID','FAILED'].includes(build?.attributes.processingState))throw new Error('build-processing-failed');
  if(i===64)throw new Error('build-processing-pending');
  console.log(JSON.stringify({build:30,processingState:report.buildProcessingState,attempt:i+1}));await new Promise(r=>setTimeout(r,10000));
 }
 report.buildId=build.id;
 const current=await api('GET',`appStoreVersions/${version.id}/relationships/build`);
 if(current.data?.id!==build.id)await api('PATCH',`appStoreVersions/${version.id}/relationships/build`,{data:{type:'builds',id:build.id}});
 report.buildAttached=true;
 const details=await api('GET',`appStoreVersions/${version.id}/appStoreReviewDetail?`+q({'fields[appStoreReviewDetails]':'notes'}));
 const note='Build 30 - Guideline 2.1(a): Fixed Sign in with Apple on iPad. The native Apple sign-in sheet uses the active foreground window and validates state/nonce. Sign in with Apple capability is enabled; the live server now accepts both the native bundle ID and web Services ID while verifying Apple signatures, issuer, expiry and nonce. Play as guest is clearly available in the account screen. Existing player accounts and progress are preserved.';
 const old=details.data.attributes.notes||'';
 if(!old.includes('Build 30 - Guideline 2.1(a)'))await api('PATCH',`appStoreReviewDetails/${details.data.id}`,{data:{type:'appStoreReviewDetails',id:details.data.id,attributes:{notes:old+(old?'\n\n':'')+note}}});
 report.reviewNoteUpdated=true;
 const list=await api('GET','reviewSubmissions?'+q({'filter[app]':app,'filter[platform]':'IOS',include:'items',limit:'20'}));
 report.previousSubmissions=list.data.map(s=>({id:s.id,state:s.attributes.state}));
 let submission=list.data.find(s=>['READY_FOR_REVIEW','UNRESOLVED_ISSUES'].includes(s.attributes.state));
 if(!submission)submission=(await api('POST','reviewSubmissions',{data:{type:'reviewSubmissions',relationships:{app:{data:{type:'apps',id:app}}}}})).data;
 report.submissionId=submission.id;
 const items=await api('GET',`reviewSubmissions/${submission.id}/items?include=appStoreVersion`);
 let item=items.data.find(i=>i.relationships?.appStoreVersion?.data?.id===version.id);
 if(items.data.some(i=>i.relationships?.appStoreVersion?.data?.id!==version.id))throw new Error('submission-has-another-version');
 if(!item)item=(await api('POST','reviewSubmissionItems',{data:{type:'reviewSubmissionItems',relationships:{reviewSubmission:{data:{type:'reviewSubmissions',id:submission.id}},appStoreVersion:{data:{type:'appStoreVersions',id:version.id}}}}})).data;
 if(item.attributes?.state==='REJECTED')await api('PATCH',`reviewSubmissionItems/${item.id}`,{data:{type:'reviewSubmissionItems',id:item.id,attributes:{resolved:true}}});
 await api('PATCH',`reviewSubmissions/${submission.id}`,{data:{type:'reviewSubmissions',id:submission.id,attributes:{submitted:true}}});
 const result=await api('GET',`reviewSubmissions/${submission.id}`);report.submissionState=result.data.attributes.state;
 report.submitted=['WAITING_FOR_REVIEW','IN_REVIEW'].includes(report.submissionState);
 const final=await api('GET',`appStoreVersions/${version.id}`);report.finalVersionState=final.data.attributes.appStoreState;
 if(!report.submitted)throw new Error('submission-not-yet-confirmed');
}catch(e){report.error=e.message;process.exitCode=1;}
finally{mkdirSync('evidence/submit30',{recursive:true});writeFileSync('evidence/submit30/result.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
