"""6 Kasım 2026 sahip: "bütün uygulamaları tüm ülkelere aç". App Store: her uygulamada kapalı ülkeleri açar.
Çin anakarası (CHN) hariç: oyunlar için devlet oyun lisansı (ISBN) zorunlu, lisanssız açılamaz.
Kullanım: python asc-availability.py read|open"""
import os, sys, time, json, jwt, requests, re, textwrap
raw=os.environ['ASC_PRIVATE_KEY'].replace('\\n','\n'); body=re.sub(r'[^A-Za-z0-9+/=]','',re.sub(r'-----(BEGIN|END)[A-Z ]*-----','',raw))
KEY='-----BEGIN PRIVATE KEY-----\n'+'\n'.join(textwrap.wrap(body,64))+'\n-----END PRIVATE KEY-----\n'
B='https://api.appstoreconnect.apple.com'
def tok():
    n=int(time.time()); return jwt.encode({'iss':os.environ['ASC_ISSUER_ID'],'iat':n,'exp':n+900,'aud':'appstoreconnect-v1'},KEY,algorithm='ES256',headers={'kid':os.environ['ASC_KEY_ID']})
def api(m,p,body=None):
    r=requests.request(m,p if p.startswith('http') else B+p,headers={'Authorization':'Bearer '+tok(),'Content-Type':'application/json'},data=json.dumps(body) if body else None,timeout=60)
    if r.status_code>=300: print('::warning::',m,p.split('?')[0],r.status_code,r.text[:300].replace('\n',' ')); return None
    return r.json() if r.text else {}
mode=sys.argv[1] if len(sys.argv)>1 else 'read'
if mode=='status':
    for a in api('GET','/v1/apps?limit=50')['data']:
        v=api('GET',f"/v1/apps/{a['id']}/appStoreVersions?limit=3&filter[platform]=IOS") or {'data':[]}
        print('::notice::'+a['attributes']['name']+': '+' | '.join(f"{x['attributes']['versionString']} {x['attributes']['appStoreState']}" for x in v['data']))
    sys.exit(0)
SKIP={'CHN'}
apps=api('GET','/v1/apps?limit=50')['data']
for a in apps:
    name=a['attributes']['name']; aid=a['id']
    av=api('GET',f'/v1/apps/{aid}/appAvailabilityV2')
    if not av: print(name,'erişilebilirlik okunamadı'); continue
    avid=av['data']['id']; newT=av['data']['attributes'].get('availableInNewTerritories')
    rows=[]; url=f'/v2/appAvailabilities/{avid}/territoryAvailabilities?limit=200&include=territory'
    while url:
        j=api('GET',url)
        if not j: break
        rows+=j['data']; url=j.get('links',{}).get('next')
    closed=[r for r in rows if not r['attributes'].get('available')]
    terr=lambda r:(r.get('relationships',{}).get('territory',{}).get('data') or {}).get('id','?')
    print(f"{name}: {len(rows)-len(closed)}/{len(rows)} açık; yeni ülkelere otomatik: {newT}; kapalı: {' '.join(sorted(terr(r) for r in closed))}")
    if mode!='open': continue
    if not newT: api('PATCH',f'/v1/appAvailabilities/{avid}',{'data':{'type':'appAvailabilities','id':avid,'attributes':{'availableInNewTerritories':True}}})
    ok=0
    for r in closed:
        if terr(r) in SKIP: continue
        res=api('PATCH',f"/v1/territoryAvailabilities/{r['id']}",{'data':{'type':'territoryAvailabilities','id':r['id'],'attributes':{'available':True}}})
        ok+=bool(res)
    print(f"::notice::{name}: {ok} ülke açıldı")
