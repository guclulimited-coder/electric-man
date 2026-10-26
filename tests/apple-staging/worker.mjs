// Isolated test Worker only. Never import this entry point in the live bundle.
import {emAPI} from '../../public/_worker.js';
export default {async fetch(req, env) {
  const url = new URL(req.url);
  if(url.pathname === '/__jwks') {
    try {
    const r=await fetch('https://appleid.apple.com/auth/keys',{redirect:'manual',signal:AbortSignal.timeout(8000)});
    const body=await r.json().catch(()=>({}));
    return Response.json({appleJWKSStatus:r.status,keyCount:body.keys?.length??0});
    } catch(e) {return Response.json({error:e.name,message:e.message});}
  }
  // Fixture route exists ONLY in this separate test deployment/database.
  // It exercises the unchanged API with a synthetic JWKS dependency and never
  // returns session tokens. The ordinary /api/em route always fetches Apple JWKS.
  if (url.pathname === '/__oracle' && req.method === 'POST') {
    if(req.headers.get('origin') !== url.origin) return new Response(null,{status:403});
    const raw = await req.text();
    if(raw.length > 24000) return new Response(null,{status:413});
    const {token,nonce,jwk} = JSON.parse(raw);
    const result = await emAPI(new Request(url.origin+'/api/em/native/apple',{
      method:'POST',headers:{origin:url.origin,'content-type':'application/json'},body:JSON.stringify({token,nonce})
    }),env,{fetch:async target=>{
      if(target!=='https://appleid.apple.com/auth/keys') throw new Error('unexpected-jwks');
      return Response.json({keys:[jwk]});
    }});
    return Response.json({synthetic:true,status:result.status},{headers:{'Cache-Control':'no-store'}});
  }
  if (url.pathname.startsWith('/api/em/')) return emAPI(req, env);
  return Response.json({environment:'ISOLATED_APPLE30_TEST',production:false,
    nativeNonce:'/api/em/native/apple/nonce',audiences:[env.EM_IOS_BUNDLE_ID,env.EM_APPLE_SERVICE_ID],
    note:'Real API uses Apple JWKS. Synthetic cryptographic scenarios run separately; no Apple account login claimed.'});
}};
