#!/usr/bin/env python3
"""Read-only: how were Bus Rush's first IAPs attached to its version submission (item relationship types)?"""
import json, sys, time, urllib.request, urllib.error
import jwt
KEY, KID, ISS = sys.argv[1:4]
BASE='https://api.appstoreconnect.apple.com'
tok=jwt.encode({'iss':ISS,'iat':int(time.time()),'exp':int(time.time())+1100,'aud':'appstoreconnect-v1'},open(KEY).read(),algorithm='ES256',headers={'kid':KID,'typ':'JWT'})
def api(p):
    req=urllib.request.Request(BASE+p,headers={'Authorization':'Bearer '+tok})
    try:
        with urllib.request.urlopen(req,timeout=60) as r: return json.loads(r.read())
    except urllib.error.HTTPError as e: return {'error':f'{e.code} {e.read().decode(errors="replace")[:400]}'}
out=[]
for app in ['6817836111','6817973176']:
    for s in api(f'/v1/reviewSubmissions?filter[app]={app}&limit=20').get('data',[]):
        its=api(f"/v1/reviewSubmissions/{s['id']}/items?limit=20")
        kinds=[]
        for it in its.get('data',[]):
            rel={k:(v.get('data') or {}).get('type') for k,v in it.get('relationships',{}).items() if isinstance(v,dict) and v.get('data')}
            kinds.append(f"{it['attributes'].get('state')}:{','.join(rel.keys()) or 'links-only:'+','.join(it.get('relationships',{}).keys())}")
        out.append(f"{app} {s['id'][:8]} {s['attributes'].get('state')} {str(s['attributes'].get('submittedDate'))[:16]} n={len(its.get('data',[]))} {kinds[:8]}")
for x in api('/v1/apps/6817836111/inAppPurchasesV2?limit=3').get('data',[])[:1]:
    out.append('busrush iap rels: '+','.join(x.get('relationships',{}).keys()))
    sub=api(f"/v2/inAppPurchases/{x['id']}/relationships/... ".strip()) if False else None
for i in range(0,len(out),10): print('::notice title=P2 %d::'%i+'%0A'.join(out[i:i+10]))
