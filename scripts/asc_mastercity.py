#!/usr/bin/env python3
"""MASTERCITY (com.tusnelda.ustasehri) — 1.0.39 (40) App Store gönderimi: sürüm + 5 uygulama içi satın alma (mc_cash_*) birlikte.
24 Ekim 2026: 1.0.38 (39) IAP'siz bekliyordu; IAP meta verisi tamamlandı (READY_TO_SUBMIT), sunucu iOS satın almayı açtı,
demo hesap bilgisi düzeltildi (çalışan TUSNELDAX test hesabı), inceleme notu yeniden yazıldı. Önceki not: Sahip onayı 24 Ekim 2026 11:25:
"Usta şehri için reklam kapat, herkese açık o şekilde AppStore incelemesine gönder, iPad simülatör kullan ekran fotoğraflarını koy".
Adımlar: bekleyen 1.0.30 incelemesini geri çek → sürüm 1.0.38, onaydan sonra otomatik yayın → derleme 39 → yaş derecelendirmesi
(simüle kumar: casino/bahis yalnız oyun parasıyla; reklam yok) → iPad 13" ve iPhone 6.9" simülatör ekran görüntüleri → inceleme notu → gönder."""
import json, sys, time, glob, hashlib, os, struct, urllib.request, urllib.error
import jwt
KEY, KID, ISS = sys.argv[1:4]
APP='6817973176'; VSTR='1.0.39'; BUILD='40'; BUSRUSH='6817836111'
IAP_IDS=['mc_cash_5000','mc_cash_12000','mc_cash_30000','mc_cash_70000','mc_cash_150000']
BASE='https://api.appstoreconnect.apple.com'
LOG=[]
def note(m): LOG.append(str(m).replace('\n',' ')); print(m, flush=True)
import atexit
atexit.register(lambda: [print('::notice title=MASTERCITY %d::'%(k//12)+'%0A'.join(LOG[k:k+12])) for k in range(0,len(LOG),12)])
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
        have=api('GET',f"/v1/appScreenshotSets/{s['id']}/appScreenshots?limit=20")['data']
        if len(have)==len(files) and all((x['attributes'].get('assetDeliveryState') or {}).get('state')=='COMPLETE' for x in have):
            note(f"{loc['attributes']['locale']} {dt}: {len(have)} görüntü zaten yüklü"); continue
        for old in have:
            api('DELETE',f"/v1/appScreenshots/{old['id']}")
        for f in files: upload(s['id'],f)
        note(f"{loc['attributes']['locale']} {dt}: {len(files)} görüntü")
# 6) inceleme bilgisi: çalışan demo hesap (Bus Rush ile aynı TUSNELDAX test hesabı, değerler yazdırılmaz) + yeni not
brv=api('GET',f'/v1/apps/{BUSRUSH}/appStoreVersions?limit=1')['data'][0]
brd=api('GET',f"/v1/appStoreVersions/{brv['id']}/appStoreReviewDetail")['data']['attributes']
NOTES=("MASTERCITY is a 3D city-life / electrician career game (Turkish UI). An internet connection and a game account are required (cloud save, shared multiplayer city).\n\n"
"SIGN IN WITH THE DEMO ACCOUNT (iPhone and iPad):\n"
"1) On the start screen tap \"Hesabınla giriş yap\" (Sign in). The sign-in sheet (oyun.tusneldax.com) opens.\n"
"2) Tap \"Test hesabıyla giriş / Sign in with review account\" (section 4 · Test hesabı / Review account).\n"
"3) On the TUSNELDAX page open \"Test hesabı / Review account\", enter the username and password above and tap \"Test hesabına giriş / Sign in\".\n"
"4) Tap \"Bu hesabı Usta Şehri’nde kullan\" (Use this account), then \"Onayla ve MASTERCITY uygulamasına dön\" (Approve and return). The app opens the game.\n"
"Sign in with Apple is offered on the same sheet (\"2 · Apple ile giriş\"), equal to Google and e-mail.\n\n"
"IN-APP PURCHASES (5 consumables, mc_cash_5000 … mc_cash_150000): in the city tap \"Menü\" (top right) → \"Mağaza · Oyun parası\" (Shop · Game cash). "
"All five packs show App Store prices; tap \"Satın al\" (Buy) to open the App Store purchase sheet. The cash is added to the balance right after purchase; "
"\"Bekleyen satın almaları kontrol et\" re-checks unfinished purchases.\n"
"Purchases are virtual in-game currency only: it cannot be withdrawn or exchanged for real money or prizes. The casino, horse-race and sports-betting features "
"use only this virtual currency; the age rating declares frequent simulated gambling.\n\n"
"No advertising in this build (ad SDK not initialized). Supports iPhone and iPad, landscape. Account deletion: account sheet → \"Hesabımı ve verilerimi sil\".")
rd=api('GET',f"/v1/appStoreVersions/{v['id']}/appStoreReviewDetail").get('data')
attrs={'notes':NOTES[:3900],'demoAccountRequired':True}
if brd.get('demoAccountName') and brd.get('demoAccountPassword'):
    attrs.update(demoAccountName=brd['demoAccountName'],demoAccountPassword=brd['demoAccountPassword'])
if rd: api('PATCH',f"/v1/appStoreReviewDetails/{rd['id']}",{'data':{'type':'appStoreReviewDetails','id':rd['id'],'attributes':attrs}})
else: api('POST','/v1/appStoreReviewDetails',{'data':{'type':'appStoreReviewDetails','attributes':attrs,'relationships':{'appStoreVersion':{'data':{'type':'appStoreVersions','id':v['id']}}}}})
note(f"inceleme bilgisi: demo hesap={attrs.get('demoAccountName','(değişmedi)')} not={len(NOTES)} karakter")
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
iaps={i['attributes']['productId']:i for i in api('GET',f'/v1/apps/{APP}/inAppPurchasesV2?limit=50')['data']}
for pid in IAP_IDS:
    x=iaps.get(pid)
    if not x: note('IAP yok: '+pid); continue
    if x['attributes']['state'] not in ('READY_TO_SUBMIT','DEVELOPER_ACTION_NEEDED','REJECTED'): note(f"IAP {pid} {x['attributes']['state']} (eklenmedi)"); continue
    try: api('POST','/v1/inAppPurchaseSubmissions',{'data':{'type':'inAppPurchaseSubmissions','relationships':{'inAppPurchaseV2':{'data':{'type':'inAppPurchases','id':x['id']}}}}}); note('IAP gönderime eklendi '+pid)
    except RuntimeError as e: note(f'IAP {pid}: '+str(e)[:600])
its=api('GET',f"/v1/reviewSubmissions/{sub['id']}/items?limit=20")['data']; note(f'gönderim öğeleri: {len(its)}')
try:
    api('PATCH',f"/v1/reviewSubmissions/{sub['id']}",{'data':{'type':'reviewSubmissions','id':sub['id'],'attributes':{'submitted':True}}}); note('İNCELEMEYE GÖNDERİLDİ')
except RuntimeError as e: note('GÖNDERİLEMEDİ: '+str(e)[:1500])
time.sleep(20); v=ver(); note(f"SON: {v['attributes']['versionString']} {v['attributes']['appStoreState']} derleme={api('GET',f"/v1/appStoreVersions/{v['id']}/build")['data']['attributes']['version']}")
for x in api('GET',f'/v1/reviewSubmissions?filter[app]={APP}&limit=3&include=items')['data']: note(f"gönderim {x['id']} {x['attributes']['state']} öğe={len(x['relationships']['items']['data'])}")
for i in api('GET',f'/v1/apps/{APP}/inAppPurchasesV2?limit=50')['data']: note(f"IAP {i['attributes']['productId']} {i['attributes']['state']}")
