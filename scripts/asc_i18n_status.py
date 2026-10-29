"""Read-only: App Store Connect localization status for TUSNELDAX apps (no writes)."""
import json, sys, time, urllib.request, urllib.error, jwt
KEY, KID, ISS = sys.argv[1:4]
BASE='https://api.appstoreconnect.apple.com/v1'
def tok():
    n=int(time.time()); return jwt.encode({'iss':ISS,'iat':n,'exp':n+900,'aud':'appstoreconnect-v1'},open(KEY).read(),algorithm='ES256',headers={'kid':KID,'typ':'JWT'})
def get(p):
    req=urllib.request.Request(BASE+p,headers={'Authorization':'Bearer '+tok()})
    try:
        with urllib.request.urlopen(req,timeout=60) as r: return json.loads(r.read())
    except urllib.error.HTTPError as e: return {'error':f'{e.code} {e.read().decode()[:200]}'}
out=[]
for b in ['com.tusneldax.busrush','com.tusneldax.electrichunter','com.tusneldax.electricman','com.tusnelda.ustasehri']:
    a=get(f'/apps?filter[bundleId]={b}')
    if 'error' in a or not a.get('data'): out.append(f'{b}: no app / {a.get("error")}'); continue
    aid=a['data'][0]['id']; out.append(f'{b}: app {aid} primaryLocale={a["data"][0]["attributes"].get("primaryLocale")}')
    for i in get(f'/apps/{aid}/appInfos').get('data',[]):
        locs=get(f'/appInfos/{i["id"]}/appInfoLocalizations?limit=50').get('data',[])
        out.append(f'  appInfo state={i["attributes"].get("state") or i["attributes"].get("appStoreState")} locales={",".join(sorted(x["attributes"]["locale"] for x in locs))}')
    for v in get(f'/apps/{aid}/appStoreVersions?limit=4').get('data',[]):
        at=v['attributes']; locs=get(f'/appStoreVersions/{v["id"]}/appStoreVersionLocalizations?limit=50').get('data',[])
        out.append(f'  version {at.get("versionString")} {at.get("platform")} state={at.get("appVersionState") or at.get("appStoreState")} locales={",".join(sorted(x["attributes"]["locale"] for x in locs))}')
print('::notice title=ASC i18n status::'+'%0A'.join(out))
