#!/usr/bin/env python3
"""Read-only: App Store Connect status of every app in the team (versions, builds, review submissions)."""
import json, sys, time, urllib.request, urllib.error
import jwt
KEY, KID, ISS = sys.argv[1:4]
BASE = 'https://api.appstoreconnect.apple.com'
tok = jwt.encode({'iss': ISS, 'iat': int(time.time()), 'exp': int(time.time()) + 1100, 'aud': 'appstoreconnect-v1'}, open(KEY).read(), algorithm='ES256', headers={'kid': KID, 'typ': 'JWT'})
def api(path):
    req = urllib.request.Request(BASE + path, headers={'Authorization': 'Bearer ' + tok})
    try:
        with urllib.request.urlopen(req, timeout=60) as r: return json.loads(r.read())
    except urllib.error.HTTPError as e: return {'error': f'{e.code} {e.read().decode(errors="replace")[:200]}'}
out = []
for a in api('/v1/apps?limit=50').get('data', []):
    A = a['attributes']; aid = a['id']
    out.append(f"== {A['name']} ({A['bundleId']}) id={aid}")
    for v in api(f'/v1/apps/{aid}/appStoreVersions?limit=4').get('data', []):
        va = v['attributes']
        b = api(f"/v1/appStoreVersions/{v['id']}/build").get('data')
        out.append(f"  version {va['versionString']} {va['platform']} state={va.get('appStoreState')} build={(b or {}).get('attributes',{}).get('version')}")
    bs = api(f'/v1/builds?filter[app]={aid}&sort=-uploadedDate&limit=3&include=preReleaseVersion').get('data', [])
    pre = {}
    for b in bs:
        out.append(f"  build {b['attributes']['version']} {b['attributes'].get('processingState')} uploaded={b['attributes'].get('uploadedDate','')[:16]} expired={b['attributes'].get('expired')}")
    for s in api(f'/v1/reviewSubmissions?filter[app]={aid}&limit=3').get('data', []):
        out.append(f"  reviewSubmission state={s['attributes'].get('state')} submitted={str(s['attributes'].get('submittedDate'))[:16]}")
print('::notice title=ASC::' + '%0A'.join(out))
