#!/usr/bin/env python3
"""Read-only: Electric Hunter App Store Connect review detail (submissions, items, rejection reasons)."""
import json, sys, time, urllib.request, urllib.error
import jwt
KEY, KID, ISS = sys.argv[1:4]
APP = '6819712674'
BASE = 'https://api.appstoreconnect.apple.com'
tok = jwt.encode({'iss': ISS, 'iat': int(time.time()), 'exp': int(time.time()) + 1100, 'aud': 'appstoreconnect-v1'}, open(KEY).read(), algorithm='ES256', headers={'kid': KID, 'typ': 'JWT'})
def api(path):
    req = urllib.request.Request(BASE + path, headers={'Authorization': 'Bearer ' + tok})
    try:
        with urllib.request.urlopen(req, timeout=60) as r: return json.loads(r.read())
    except urllib.error.HTTPError as e: return {'error': f'{e.code} {e.read().decode(errors="replace")[:300]}'}
out = []
def p(s): out.append(str(s)[:900])
for v in api(f'/v1/apps/{APP}/appStoreVersions?limit=5').get('data', []):
    a = v['attributes']
    p(f"version {a['versionString']} state={a.get('appStoreState')} reviewType={a.get('reviewType')} created={str(a.get('createdDate'))[:16]} id={v['id']}")
    d = api(f"/v1/appStoreVersions/{v['id']}/appStoreReviewDetail").get('data') or {}
    da = d.get('attributes', {})
    p(f"  reviewDetail demoRequired={da.get('demoAccountRequired')} demoName={da.get('demoAccountName')} notes={str(da.get('notes'))[:300]} contact={da.get('contactEmail')}")
    for k in ('ageRatingDeclaration',):
        x = api(f"/v1/appStoreVersions/{v['id']}/{k}")
        p(f"  {k}: {json.dumps((x.get('data') or {}).get('attributes', x.get('error')))[:400]}")
    loc = api(f"/v1/appStoreVersions/{v['id']}/appStoreVersionLocalizations?limit=20").get('data', [])
    p(f"  localizations={len(loc)}: " + ', '.join(l['attributes']['locale'] for l in loc))
for s in api(f'/v1/reviewSubmissions?filter[app]={APP}&limit=5&include=items').get('data', []):
    a = s['attributes']
    p(f"submission id={s['id']} state={a.get('state')} platform={a.get('platform')} submitted={str(a.get('submittedDate'))[:16]}")
    for it in api(f"/v1/reviewSubmissions/{s['id']}/items?limit=10").get('data', []):
        p(f"  item state={it['attributes'].get('state')} rel={json.dumps({k:(v.get('data') or {}).get('id') for k,v in it.get('relationships',{}).items()})}")
app = api(f'/v1/apps/{APP}?fields[apps]=name,bundleId,contentRightsDeclaration,isOrEverWasMadeForKid').get('data', {})
p(f"app attrs={json.dumps(app.get('attributes'))}")
ai = api(f'/v1/apps/{APP}/appInfos?limit=2').get('data', [])
for i in ai:
    p(f"appInfo state={i['attributes'].get('appStoreState')} kind={i['attributes'].get('kind')} ageRating={i['attributes'].get('appStoreAgeRating')} brazil={i['attributes'].get('brazilAgeRating')} id={i['id']}")
    cats = api(f"/v1/appInfos/{i['id']}?include=primaryCategory,secondaryCategory").get('included', [])
    p("  categories: " + ', '.join(c['id'] for c in cats))
print('::notice title=EH::' + '%0A'.join(out))
