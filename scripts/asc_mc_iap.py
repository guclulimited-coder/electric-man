#!/usr/bin/env python3
"""MASTERCITY (6817973176): complete metadata of the 5 consumable game-cash IAPs so they reach READY_TO_SUBMIT.
Localizations (en-US, tr), price schedule (USA base, TR and euro area manual, as public/currency-catalog.mjs),
availability in all territories, App Review screenshot (in-game shop panel) and review note. Does NOT submit."""
import hashlib, json, os, sys, time, urllib.error, urllib.request
import jwt
KEY, KID, ISS = sys.argv[1:4]
APP='6817973176'; BASE='https://api.appstoreconnect.apple.com'; SHOT='store/mastercity/iap/shop-review.png'
LOG=[]
def note(m): LOG.append(str(m).replace('\n',' ')); print(m, flush=True)
import atexit
@atexit.register
def _out():
    for i in range(0,len(LOG),12): print('::notice title=MCIAP %d::'%(i//12)+'%0A'.join(LOG[i:i+12]))
_t=[None,0]
def tok():
    if time.time()-_t[1]>600:
        n=int(time.time()); _t[0]=jwt.encode({'iss':ISS,'iat':n,'exp':n+1100,'aud':'appstoreconnect-v1'},open(KEY).read(),algorithm='ES256',headers={'kid':KID,'typ':'JWT'}); _t[1]=time.time()
    return _t[0]
class ApiError(Exception): pass
def api(method,path,body=None):
    url=path if path.startswith('http') else BASE+path
    req=urllib.request.Request(url,method=method,data=None if body is None else json.dumps(body).encode(),headers={'Authorization':'Bearer '+tok(),'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=120) as r:
            raw=r.read(); return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        txt=e.read().decode(errors='replace')
        try: txt=' | '.join(f"{x.get('code')}: {x.get('detail') or x.get('title')}" for x in json.loads(txt).get('errors',[])) or txt
        except Exception: pass
        raise ApiError(f'{method} {path.split("?")[0]} -> {e.code} {txt[:500]}')
def get_all(path):
    out,url=[],path
    while url:
        r=api('GET',url); out+=r.get('data',[]); url=(r.get('links') or {}).get('next')
    return out
def step(name,fn):
    try:
        v=fn(); note(f'OK {name}'+(f': {v}' if v else '')); return v
    except Exception as e: note(f'FAIL {name}: {e}')
EUROZONE=['AUT','BEL','HRV','CYP','EST','FIN','FRA','DEU','GRC','IRL','ITA','LVA','LTU','LUX','MLT','NLD','PRT','SVK','SVN','ESP']
PACKS=[('mc_cash_5000',5000,99.99,4.99),('mc_cash_12000',12000,149.99,7.49),('mc_cash_30000',30000,249.99,12.49),('mc_cash_70000',70000,499.99,24.99),('mc_cash_150000',150000,999.99,49.99)]
TERR=[t['id'] for t in get_all('/v1/territories?limit=200')]
iaps={i['attributes']['productId']:i for i in get_all(f'/v1/apps/{APP}/inAppPurchasesV2?limit=50')}
def upsert_loc(IAP,locale,attrs):
    have={x['attributes']['locale']:x for x in get_all(f'/v2/inAppPurchases/{IAP}/inAppPurchaseLocalizations')}
    if locale in have:
        x=have[locale]; api('PATCH',f"/v1/inAppPurchaseLocalizations/{x['id']}",{'data':{'type':'inAppPurchaseLocalizations','id':x['id'],'attributes':attrs}}); return 'updated'
    api('POST','/v1/inAppPurchaseLocalizations',{'data':{'type':'inAppPurchaseLocalizations','attributes':dict(attrs,locale=locale),'relationships':{'inAppPurchaseV2':{'data':{'type':'inAppPurchases','id':IAP}}}}}); return 'created'
def point(IAP,terr,amount):
    url=f'/v2/inAppPurchases/{IAP}/pricePoints?filter[territory]={terr}&limit=200'
    while url:
        r=api('GET',url)
        pt=next((p for p in r['data'] if abs(float(p['attributes']['customerPrice'])-amount)<0.001),None)
        if pt: return pt['id']
        url=(r.get('links') or {}).get('next')
    # nearest price point if the exact one does not exist
    allp=get_all(f'/v2/inAppPurchases/{IAP}/pricePoints?filter[territory]={terr}&limit=200')
    best=min(allp,key=lambda p:abs(float(p['attributes']['customerPrice'])-amount)); note(f'  nearest {terr} {best["attributes"]["customerPrice"]} for {amount}'); return best['id']
def current_prices(IAP):
    try:
        sid=api('GET',f'/v2/inAppPurchases/{IAP}/iapPriceSchedule')['data']['id']
        r=api('GET',f'/v1/inAppPurchasePriceSchedules/{sid}/manualPrices?filter[territory]=USA,TUR,DEU&include=inAppPurchasePricePoint,territory&limit=10')
        pts={x['id']:x['attributes']['customerPrice'] for x in r.get('included',[]) if x['type']=='inAppPurchasePricePoints'}
        out={}
        for m in r.get('data',[]):
            pid=m['relationships']['inAppPurchasePricePoint']['data']['id']; ter=(m['relationships'].get('territory') or {}).get('data',{}).get('id')
            out[ter]=pts.get(pid)
        return out
    except ApiError: return {}
for pid,n,tr,usd in PACKS:
    if pid not in iaps: note(f'MISSING product {pid}'); continue
    IAP=iaps[pid]['id']
    en=f'{n:,} Game Cash'; trn=f'{n:,} Oyun Parası'.replace(',','.')
    step(f'{pid} en-US',lambda: upsert_loc(IAP,'en-US',{'name':en,'description':f'Adds {n:,} MASTERCITY game cash to your account.'}))
    step(f'{pid} tr',lambda: upsert_loc(IAP,'tr',{'name':trn,'description':f'Hesabına {n:,} MASTERCITY oyun parası eklenir.'.replace(',','.')}))
    step(f'{pid} attrs',lambda: (api('PATCH',f'/v2/inAppPurchases/{IAP}',{'data':{'type':'inAppPurchases','id':IAP,'attributes':{'name':f'{n} MASTERCITY Cash','familySharable':False,
        'reviewNote':(f'Consumable virtual currency: adds {n:,} game cash (in-game money only; it cannot be withdrawn or exchanged for real money or prizes). '
                      'Where: sign in (demo account in App Review Information), enter the city, tap "Menü" (top right) and then "Mağaza · Oyun parası". '
                      'The shop lists all five packs with App Store prices; tap "Satın al" (Buy) to open the App Store purchase sheet. '
                      'After purchase the cash is added to the balance shown in the HUD.')}}}),'')[1])
    def price():
        cur=current_prices(IAP)
        if cur.get('USA') and abs(float(cur['USA'])-usd)<0.001 and cur.get('TUR') and abs(float(cur['TUR'])-tr)<0.001: return f'already USA ${cur["USA"]} TUR ₺{cur["TUR"]} DEU {cur.get("DEU")}'
        manual=[('USA',usd),('TUR',tr)]+[(t,usd) for t in EUROZONE]
        pts=[point(IAP,t,a) for t,a in manual]
        api('POST','/v1/inAppPurchasePriceSchedules',{'data':{'type':'inAppPurchasePriceSchedules','relationships':{
            'inAppPurchase':{'data':{'type':'inAppPurchases','id':IAP}},'baseTerritory':{'data':{'type':'territories','id':'USA'}},
            'manualPrices':{'data':[{'type':'inAppPurchasePrices','id':f'${{p{i}}}'} for i in range(len(pts))]}}},
            'included':[{'type':'inAppPurchasePrices','id':f'${{p{i}}}','attributes':{'startDate':None},
                         'relationships':{'inAppPurchasePricePoint':{'data':{'type':'inAppPurchasePricePoints','id':pt}}}} for i,pt in enumerate(pts)]})
        cur=current_prices(IAP); return f'set (was {cur}) now USA ${cur.get("USA")} TUR ₺{cur.get("TUR")} DEU €{cur.get("DEU")}'
    step(f'{pid} price',price)
    def avail():
        try:
            a=api('GET',f'/v2/inAppPurchases/{IAP}/inAppPurchaseAvailability?include=availableTerritories&limit[availableTerritories]=200')
            have=len(a['data']['relationships'].get('availableTerritories',{}).get('data',[]))
            if have>=len(TERR)-2: return f'already {have} territories'
        except ApiError: pass
        api('POST','/v1/inAppPurchaseAvailabilities',{'data':{'type':'inAppPurchaseAvailabilities','attributes':{'availableInNewTerritories':True},
            'relationships':{'inAppPurchase':{'data':{'type':'inAppPurchases','id':IAP}},'availableTerritories':{'data':[{'type':'territories','id':t} for t in TERR]}}}})
        return f'{len(TERR)} territories'
    step(f'{pid} availability',avail)
    def shot():
        data=open(SHOT,'rb').read()
        try:
            cur=api('GET',f'/v2/inAppPurchases/{IAP}/appStoreReviewScreenshot').get('data')
            if cur:
                if cur['attributes'].get('sourceFileChecksum')==hashlib.md5(data).hexdigest() and (cur['attributes'].get('assetDeliveryState') or {}).get('state')=='COMPLETE': return 'already'
                api('DELETE',f"/v1/inAppPurchaseAppStoreReviewScreenshots/{cur['id']}")
        except ApiError: pass
        r=api('POST','/v1/inAppPurchaseAppStoreReviewScreenshots',{'data':{'type':'inAppPurchaseAppStoreReviewScreenshots','attributes':{'fileName':'mastercity-shop.png','fileSize':len(data)},
            'relationships':{'inAppPurchaseV2':{'data':{'type':'inAppPurchases','id':IAP}}}}})
        sid=r['data']['id']
        for op in r['data']['attributes']['uploadOperations']:
            req=urllib.request.Request(op['url'],method=op['method'],data=data[op['offset']:op['offset']+op['length']],headers={h['name']:h['value'] for h in op.get('requestHeaders',[])})
            urllib.request.urlopen(req,timeout=300).read()
        api('PATCH',f'/v1/inAppPurchaseAppStoreReviewScreenshots/{sid}',{'data':{'type':'inAppPurchaseAppStoreReviewScreenshots','id':sid,'attributes':{'uploaded':True,'sourceFileChecksum':hashlib.md5(data).hexdigest()}}})
        return 'uploaded'
    step(f'{pid} review screenshot',shot)
time.sleep(20)
for i in get_all(f'/v1/apps/{APP}/inAppPurchasesV2?limit=50'):
    note(f"STATE {i['attributes']['productId']} {i['attributes']['state']}")
