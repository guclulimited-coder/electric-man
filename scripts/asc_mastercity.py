#!/usr/bin/env python3
"""MASTERCITY (com.tusnelda.ustasehri): bekleyen eski 1.0.21 incelemesini geri çek, sürümü 1.0.28 + derleme 29 yap,
uygulama adını MASTERCITY yap, yeniden incelemeye gönder. Sahip onayı: 21 Ekim 2026 "Google Play'de yayınlanan ama App Store'da olmayan tüm oyunları yayına al"."""
import json, sys, time, urllib.request, urllib.error
import jwt
KEY, KID, ISS = sys.argv[1:4]
APP='6817973176'; VSTR='1.0.30'; BUILD='31'
BASE='https://api.appstoreconnect.apple.com'
LOG=[]
def note(m): LOG.append(str(m).replace('\n',' ')); print(m, flush=True)
import atexit
atexit.register(lambda: print('::notice title=MASTERCITY::'+'%0A'.join(LOG)))
_t=[None,0]
def tok():
    if time.time()-_t[1]>600:
        n=int(time.time()); _t[0]=jwt.encode({'iss':ISS,'iat':n,'exp':n+1100,'aud':'appstoreconnect-v1'},open(KEY).read(),algorithm='ES256',headers={'kid':KID,'typ':'JWT'}); _t[1]=time.time()
    return _t[0]
def api(method,path,body=None):
    req=urllib.request.Request(BASE+path,method=method,data=None if body is None else json.dumps(body).encode(),headers={'Authorization':'Bearer '+tok(),'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=60) as r:
            raw=r.read(); return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'{method} {path.split("?")[0]} -> {e.code} {e.read().decode(errors="replace")[:3000]}')
def ver():
    v=[x for x in api('GET',f'/v1/apps/{APP}/appStoreVersions?filter[platform]=IOS&limit=5')['data'] if x['attributes']['appStoreState'] not in ('READY_FOR_SALE','REPLACED_WITH_NEW_INFO')]
    return v[0] if v else None
v=ver(); note(f"başlangıç: {v['attributes']['versionString']} {v['attributes']['appStoreState']}")
# 1) bekleyen incelemeyi geri çek
CANCELLED=[]
for s in api('GET',f'/v1/reviewSubmissions?filter[app]={APP}&filter[state]=WAITING_FOR_REVIEW&limit=5')['data']:
    if s['attributes']['state']=='WAITING_FOR_REVIEW':
        api('PATCH',f"/v1/reviewSubmissions/{s['id']}",{'data':{'type':'reviewSubmissions','id':s['id'],'attributes':{'canceled':True}}}); CANCELLED.append(s['id']); note('eski inceleme geri çekildi '+s['id'])
for i in range(40):
    v=ver(); st=v['attributes']['appStoreState']
    if st in ('DEVELOPER_REJECTED','PREPARE_FOR_SUBMISSION','REJECTED','METADATA_REJECTED'): break
    time.sleep(15)
note('durum: '+st)
# 2) sürüm numarası
if v['attributes']['versionString']!=VSTR:
    api('PATCH',f"/v1/appStoreVersions/{v['id']}",{'data':{'type':'appStoreVersions','id':v['id'],'attributes':{'versionString':VSTR}}}); note('sürüm '+VSTR)
# 3) derleme 29
bs=api('GET',f'/v1/builds?filter[app]={APP}&filter[version]={BUILD}&filter[processingState]=VALID&limit=5')['data']
b=bs[0]
if b['attributes'].get('usesNonExemptEncryption') is None:
    api('PATCH',f"/v1/builds/{b['id']}",{'data':{'type':'builds','id':b['id'],'attributes':{'usesNonExemptEncryption':False}}})
api('PATCH',f"/v1/appStoreVersions/{v['id']}/relationships/build",{'data':{'type':'builds','id':b['id']}}); note('derleme '+BUILD+' bağlandı')
# 4) uygulama adı MASTERCITY (düzenlenebilir appInfo)
infos=api('GET',f'/v1/apps/{APP}/appInfos')['data']
info=next((i for i in infos if i['attributes'].get('appStoreState') not in ('READY_FOR_DISTRIBUTION','READY_FOR_SALE','REPLACED_WITH_NEW_INFO')),infos[0])
for loc in api('GET',f"/v1/appInfos/{info['id']}/appInfoLocalizations")['data']:
    want='MASTERCITY: City Life' if loc['attributes']['locale'].startswith('en') else 'MASTERCITY: Şehir Hayatı'
    if loc['attributes'].get('name')!=want:
        try:
            api('PATCH',f"/v1/appInfoLocalizations/{loc['id']}",{'data':{'type':'appInfoLocalizations','id':loc['id'],'attributes':{'name':want}}}); note(f"ad {want} ({loc['attributes']['locale']})")
        except RuntimeError as e: note('AD DEĞİŞMEDİ: '+str(e)[:200])
# 5) eski gönderimin iptali bitince sürüm yeni gönderime eklenir ve gönderilir
OLD=CANCELLED[-1] if CANCELLED else None
st=api('GET',f'/v1/reviewSubmissions/{OLD}')['data']['attributes']['state'] if OLD else 'YOK'; note('eski gönderim: '+st)
if st=='CANCELING':
    note('Apple iptali henüz bitirmedi — sonra tekrar denenecek'); sys.exit(0)
subs=api('GET',f'/v1/reviewSubmissions?filter[app]={APP}&filter[state]=READY_FOR_REVIEW&filter[platform]=IOS&limit=5')['data']
sub=subs[0] if subs else api('POST','/v1/reviewSubmissions',{'data':{'type':'reviewSubmissions','attributes':{'platform':'IOS'},'relationships':{'app':{'data':{'type':'apps','id':APP}}}}})['data']
try:
    api('POST','/v1/reviewSubmissionItems',{'data':{'type':'reviewSubmissionItems','relationships':{'reviewSubmission':{'data':{'type':'reviewSubmissions','id':sub['id']}},'appStoreVersion':{'data':{'type':'appStoreVersions','id':v['id']}}}}}); note('sürüm gönderime eklendi')
except RuntimeError as e: note('öğe: '+str(e)[:1500])
try:
    api('PATCH',f"/v1/reviewSubmissions/{sub['id']}",{'data':{'type':'reviewSubmissions','id':sub['id'],'attributes':{'submitted':True}}}); note('İNCELEMEYE GÖNDERİLDİ')
except RuntimeError as e: note('GÖNDERİLEMEDİ: '+str(e)[:1500])
time.sleep(10); v=ver(); note(f"SON: {v['attributes']['versionString']} {v['attributes']['appStoreState']}")
