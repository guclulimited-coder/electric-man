#!/usr/bin/env python3
"""Read-only probe for MASTERCITY: review detail (no password), IAP details, submission items, live store config."""
import json, sys, time, urllib.request, urllib.error
import jwt
KEY, KID, ISS = sys.argv[1:4]
APP='6817973176'; BASE='https://api.appstoreconnect.apple.com'
tok=jwt.encode({'iss':ISS,'iat':int(time.time()),'exp':int(time.time())+1100,'aud':'appstoreconnect-v1'},open(KEY).read(),algorithm='ES256',headers={'kid':KID,'typ':'JWT'})
def api(p):
    req=urllib.request.Request(p if p.startswith('http') else BASE+p,headers={'Authorization':'Bearer '+tok})
    try:
        with urllib.request.urlopen(req,timeout=60) as r: return json.loads(r.read())
    except urllib.error.HTTPError as e: return {'error':f'{e.code} {e.read().decode(errors="replace")[:300]}'}
out=[]
v=api(f'/v1/apps/{APP}/appStoreVersions?limit=3')['data']
for x in v: out.append(f"version {x['id']} {x['attributes']['versionString']} {x['attributes']['appStoreState']}")
rd=api(f"/v1/appStoreVersions/{v[0]['id']}/appStoreReviewDetail").get('data') or {}
a=rd.get('attributes',{})
out.append(f"review demoRequired={a.get('demoAccountRequired')} demoName={a.get('demoAccountName')} pwSet={bool(a.get('demoAccountPassword'))} pwLen={len(a.get('demoAccountPassword') or '')} contact={a.get('contactFirstName')} {a.get('contactLastName')}")
out.append('NOTES: '+(a.get('notes') or '').replace('\n',' | '))
for i in api(f'/v1/apps/{APP}/inAppPurchasesV2?limit=50').get('data',[]):
    at=i['attributes']; out.append(f"IAP {i['id']} {at.get('productId')} name={at.get('name')} state={at.get('state')} note={bool(at.get('reviewNote'))}")
    locs=api(f"/v2/inAppPurchases/{i['id']}/inAppPurchaseLocalizations").get('data',[])
    out.append('   locs '+', '.join(f"{l['attributes']['locale']}:{l['attributes'].get('name')}" for l in locs))
    ps=api(f"/v2/inAppPurchases/{i['id']}/iapPriceSchedule"); out.append('   price '+('none '+ps['error'][:60] if 'error' in ps else 'set'))
    av=api(f"/v2/inAppPurchases/{i['id']}/inAppPurchaseAvailability"); out.append('   avail '+('none' if 'error' in av else 'set'))
    sh=api(f"/v2/inAppPurchases/{i['id']}/appStoreReviewScreenshot"); out.append('   shot '+('none' if 'error' in sh or not sh.get('data') else str(sh['data']['attributes'].get('assetDeliveryState'))))
for s in api(f'/v1/reviewSubmissions?filter[app]={APP}&limit=3&include=items').get('data',[]):
    out.append(f"submission {s['id']} {s['attributes'].get('state')} items={len(s['relationships']['items']['data'])}")
try:
    with urllib.request.urlopen('https://oyun.tusneldax.com/api/currency/config',timeout=20) as r: out.append('live config '+r.read().decode()[-200:])
except Exception as e: out.append('live config error '+str(e)[:200])
print('::notice title=MCPROBE::'+'%0A'.join(out))
