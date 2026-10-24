#!/usr/bin/env python3
"""MASTERCITY (com.tusnelda.ustasehri) — 1.0.38 (39) App Store gönderimi. Sahip onayı 24 Ekim 2026 11:25:
"Usta şehri için reklam kapat, herkese açık o şekilde AppStore incelemesine gönder, iPad simülatör kullan ekran fotoğraflarını koy".
Adımlar: bekleyen 1.0.30 incelemesini geri çek → sürüm 1.0.38, onaydan sonra otomatik yayın → derleme 39 → yaş derecelendirmesi
(simüle kumar: casino/bahis yalnız oyun parasıyla; reklam yok) → iPad 13" ve iPhone 6.9" simülatör ekran görüntüleri → inceleme notu → gönder."""
import json, sys, time, glob, hashlib, os, struct, urllib.request, urllib.error
import jwt
KEY, KID, ISS = sys.argv[1:4]
APP='6817973176'; VSTR='1.0.38'; BUILD='39'
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
        with urllib.request.urlopen(req,timeout=120) as r:
            raw=r.read(); return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'{method} {path.split("?")[0]} -> {e.code} {e.read().decode(errors="replace")[:2000]}')
def ver():
    v=[x for x in api('GET',f'/v1/apps/{APP}/appStoreVersions?filter[platform]=IOS&limit=5')['data'] if x['attributes']['appStoreState'] not in ('READY_FOR_SALE','REPLACED_WITH_NEW_INFO')]
    return v[0] if v else None
# 0) derleme hazır mı
bs=api('GET',f'/v1/builds?filter[app]={APP}&filter[version]={BUILD}&limit=5')['data']
if not bs or bs[0]['attributes']['processingState']!='VALID':
    note(f"derleme {BUILD} hazır değil: {bs[0]['attributes']['processingState'] if bs else 'YOK'}"); sys.exit(3)
b=bs[0]
SHOTS={'APP_IPAD_PRO_3GEN_129':sorted(glob.glob('store/mastercity/ipad/*.png')),'APP_IPHONE_67':sorted(glob.glob('store/mastercity/iphone/*.png'))}
if not SHOTS['APP_IPAD_PRO_3GEN_129'] or not SHOTS['APP_IPHONE_67']: note('ekran görüntüleri eksik'); sys.exit(1)
v=ver(); note(f"başlangıç: {v['attributes']['versionString']} {v['attributes']['appStoreState']}")
# 1) bekleyen incelemeyi geri çek
OLD=None
for s in api('GET',f'/v1/reviewSubmissions?filter[app]={APP}&limit=10')['data']:
    if s['attributes']['state'] in ('WAITING_FOR_REVIEW','IN_REVIEW','UNRESOLVED_ISSUES'):
        try:
            api('PATCH',f"/v1/reviewSubmissions/{s['id']}",{'data':{'type':'reviewSubmissions','id':s['id'],'attributes':{'canceled':True}}}); OLD=s['id']; note('eski inceleme geri çekildi '+s['id'])
        except RuntimeError as e: note('geri çekilemedi: '+str(e)[:300])
for i in range(60):
    v=ver(); st=v['attributes']['appStoreState']
    if st in ('DEVELOPER_REJECTED','PREPARE_FOR_SUBMISSION','REJECTED','METADATA_REJECTED'): break
    time.sleep(15)
note('durum: '+st)
if st not in ('DEVELOPER_REJECTED','PREPARE_FOR_SUBMISSION','REJECTED','METADATA_REJECTED'): note('sürüm düzenlenebilir değil, sonra tekrar'); sys.exit(0)
# 2) sürüm numarası + onaydan sonra otomatik yayın
api('PATCH',f"/v1/appStoreVersions/{v['id']}",{'data':{'type':'appStoreVersions','id':v['id'],'attributes':{'versionString':VSTR,'releaseType':'AFTER_APPROVAL'}}}); note('sürüm '+VSTR+' · onaydan sonra otomatik yayın')
# 3) derleme
if b['attributes'].get('usesNonExemptEncryption') is None:
    api('PATCH',f"/v1/builds/{b['id']}",{'data':{'type':'builds','id':b['id'],'attributes':{'usesNonExemptEncryption':False}}})
api('PATCH',f"/v1/appStoreVersions/{v['id']}/relationships/build",{'data':{'type':'builds','id':b['id']}}); note('derleme '+BUILD+' bağlandı')
# 4) yaş derecelendirmesi: casino ve at yarışı/spor bahsi yalnız oyun parasıyla (gerçek para yok) = simüle kumar; reklam yok
infos=api('GET',f'/v1/apps/{APP}/appInfos')['data']
info=next((i for i in infos if i['attributes'].get('appStoreState') not in ('READY_FOR_DISTRIBUTION','READY_FOR_SALE','REPLACED_WITH_NEW_INFO')),infos[0])
ar=api('GET',f"/v1/appInfos/{info['id']}/ageRatingDeclaration")['data']
want={'gamblingSimulated':'FREQUENT_OR_INTENSE','gambling':False,'advertising':False}
for k,val in want.items():
    try:
        api('PATCH',f"/v1/ageRatingDeclarations/{ar['id']}",{'data':{'type':'ageRatingDeclarations','id':ar['id'],'attributes':{k:val}}}); note(f'yaş: {k}={val}')
    except RuntimeError as e: note(f'yaş {k} değişmedi: '+str(e)[:300])
# 5) ekran görüntüleri (tüm diller)
def upload(set_id,path):
    data=open(path,'rb').read()
    sc=api('POST','/v1/appScreenshots',{'data':{'type':'appScreenshots','attributes':{'fileName':os.path.basename(path),'fileSize':len(data)},'relationships':{'appScreenshotSet':{'data':{'type':'appScreenshotSets','id':set_id}}}}})['data']
    for op in sc['attributes']['uploadOperations']:
        chunk=data[op['offset']:op['offset']+op['length']]
        req=urllib.request.Request(op['url'],method=op['method'],data=chunk,headers={h['name']:h['value'] for h in op['requestHeaders']})
        urllib.request.urlopen(req,timeout=300).read()
    api('PATCH',f"/v1/appScreenshots/{sc['id']}",{'data':{'type':'appScreenshots','id':sc['id'],'attributes':{'uploaded':True,'sourceFileChecksum':hashlib.md5(data).hexdigest()}}})
for loc in api('GET',f"/v1/appStoreVersions/{v['id']}/appStoreVersionLocalizations?limit=20")['data']:
    sets={s['attributes']['screenshotDisplayType']:s for s in api('GET',f"/v1/appStoreVersionLocalizations/{loc['id']}/appScreenshotSets?limit=30")['data']}
    for dt,files in SHOTS.items():
        s=sets.get(dt) or api('POST','/v1/appScreenshotSets',{'data':{'type':'appScreenshotSets','attributes':{'screenshotDisplayType':dt},'relationships':{'appStoreVersionLocalization':{'data':{'type':'appStoreVersionLocalizations','id':loc['id']}}}}})['data']
        for old in api('GET',f"/v1/appScreenshotSets/{s['id']}/appScreenshots?limit=20")['data']:
            api('DELETE',f"/v1/appScreenshots/{old['id']}")
        for f in files: upload(s['id'],f)
        note(f"{loc['attributes']['locale']} {dt}: {len(files)} görüntü")
# 6) inceleme notu
rd=api('GET',f"/v1/appStoreVersions/{v['id']}/appStoreReviewDetail").get('data')
extra=("\n\nVersion 1.0.38 notes for the reviewer: This build contains no advertising (ad SDK is not initialized). "
       "The casino, horse-race and sports betting features use only virtual in-game currency that cannot be withdrawn or exchanged for real money or prizes; "
       "the age rating declares frequent simulated gambling. The game is landscape and supports iPhone and iPad.")
if rd:
    n=rd['attributes'].get('notes') or ''
    if 'Version 1.0.38 notes' not in n:
        api('PATCH',f"/v1/appStoreReviewDetails/{rd['id']}",{'data':{'type':'appStoreReviewDetails','id':rd['id'],'attributes':{'notes':(n+extra)[:3900]}}}); note('inceleme notu eklendi')
# 7) gönder
if OLD:
    for i in range(40):
        st=api('GET',f'/v1/reviewSubmissions/{OLD}')['data']['attributes']['state']
        if st!='CANCELING': break
        time.sleep(15)
    note('eski gönderim: '+st)
subs=api('GET',f'/v1/reviewSubmissions?filter[app]={APP}&filter[state]=READY_FOR_REVIEW&filter[platform]=IOS&limit=5')['data']
sub=subs[0] if subs else api('POST','/v1/reviewSubmissions',{'data':{'type':'reviewSubmissions','attributes':{'platform':'IOS'},'relationships':{'app':{'data':{'type':'apps','id':APP}}}}})['data']
try:
    api('POST','/v1/reviewSubmissionItems',{'data':{'type':'reviewSubmissionItems','relationships':{'reviewSubmission':{'data':{'type':'reviewSubmissions','id':sub['id']}},'appStoreVersion':{'data':{'type':'appStoreVersions','id':v['id']}}}}}); note('sürüm gönderime eklendi')
except RuntimeError as e: note('öğe: '+str(e)[:1500])
try:
    api('PATCH',f"/v1/reviewSubmissions/{sub['id']}",{'data':{'type':'reviewSubmissions','id':sub['id'],'attributes':{'submitted':True}}}); note('İNCELEMEYE GÖNDERİLDİ')
except RuntimeError as e: note('GÖNDERİLEMEDİ: '+str(e)[:1500])
time.sleep(10); v=ver(); note(f"SON: {v['attributes']['versionString']} {v['attributes']['appStoreState']}")
