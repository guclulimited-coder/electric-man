#!/usr/bin/env python3
"""Read-only audit: per app, editable version details — screenshot sets per display type, age rating, review details, localizations, build device family."""
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
    aid=a['id']; out.append(f"== {a['attributes']['name']} {a['attributes']['bundleId']}")
    vs=api(f'/v1/apps/{aid}/appStoreVersions?filter[platform]=IOS&limit=3').get('data',[])
    for v in vs[:2]:
        va=v['attributes']; out.append(f" v{va['versionString']} {va['appStoreState']} created={va.get('createdDate','')[:10]} release={va.get('releaseType')}")
        b=api(f"/v1/appStoreVersions/{v['id']}/build").get('data')
        if b: out.append(f"  build {b['attributes']['version']} minOS={b['attributes'].get('minOsVersion')} encr={b['attributes'].get('usesNonExemptEncryption')}")
        for loc in api(f"/v1/appStoreVersions/{v['id']}/appStoreVersionLocalizations?limit=20").get('data',[]):
            sets=api(f"/v1/appStoreVersionLocalizations/{loc['id']}/appScreenshotSets?limit=30").get('data',[])
            desc=[]
            for s in sets:
                n=len(api(f"/v1/appScreenshotSets/{s['id']}/appScreenshots?limit=20").get('data',[]))
                desc.append(f"{s['attributes']['screenshotDisplayType']}:{n}")
            out.append(f"  loc {loc['attributes']['locale']} shots[{', '.join(desc) or 'YOK'}] whatsNew={bool(loc['attributes'].get('whatsNew'))} desc={len(loc['attributes'].get('description') or '')}")
        rd=api(f"/v1/appStoreVersions/{v['id']}/appStoreReviewDetail").get('data')
        if rd: out.append(f"  review: demoRequired={rd['attributes'].get('demoAccountRequired')} contact={'ok' if rd['attributes'].get('contactEmail') else 'YOK'} notes={len(rd['attributes'].get('notes') or '')}")
        else: out.append("  review detail: YOK")
    infos=api(f'/v1/apps/{aid}/appInfos').get('data',[])
    for i in infos[:2]:
        ar=api(f"/v1/appInfos/{i['id']}/ageRatingDeclaration").get('data')
        if ar:
            at=ar['attributes']; keys=[k for k,v in at.items() if v not in (None,'NONE',False)]
            out.append(f"  appInfo {i['attributes'].get('appStoreState')} rating={i['attributes'].get('appStoreAgeRating')} age:{','.join(f'{k}={at[k]}' for k in keys)[:400]}")
print('::notice title=AUDIT::'+'%0A'.join(out))
