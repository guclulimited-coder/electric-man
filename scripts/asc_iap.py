#!/usr/bin/env python3
"""Read-only: in-app purchases per app with state, plus review submission item counts."""
import json, sys, time, urllib.request, urllib.error
import jwt
KEY, KID, ISS = sys.argv[1:4]
BASE='https://api.appstoreconnect.apple.com'
tok=jwt.encode({'iss':ISS,'iat':int(time.time()),'exp':int(time.time())+1100,'aud':'appstoreconnect-v1'},open(KEY).read(),algorithm='ES256',headers={'kid':KID,'typ':'JWT'})
def api(p):
    req=urllib.request.Request(BASE+p,headers={'Authorization':'Bearer '+tok})
    try:
        with urllib.request.urlopen(req,timeout=60) as r: return json.loads(r.read())
    except urllib.error.HTTPError as e: return {'error':f'{e.code} {e.read().decode(errors="replace")[:300]}'}
out=[]
for a in api('/v1/apps?limit=50').get('data',[]):
    aid=a['id']; out.append(f"== {a['attributes']['name']}")
    iaps=api(f'/v1/apps/{aid}/inAppPurchasesV2?limit=50')
    if 'error' in iaps: out.append('  iap error '+iaps['error'])
    for i in iaps.get('data',[]):
        at=i['attributes']; out.append(f"  IAP {at.get('productId')} {at.get('inAppPurchaseType')} state={at.get('state')}")
    for s in api(f'/v1/reviewSubmissions?filter[app]={aid}&limit=2&include=items').get('data',[]):
        items=s.get('relationships',{}).get('items',{}).get('data',[])
        out.append(f"  submission {s['attributes'].get('state')} items={len(items)}")
print('::notice title=IAP::'+'%0A'.join(out))
