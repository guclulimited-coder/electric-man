#!/usr/bin/env python3
"""Fill the App Store listing of Electric Man through the App Store Connect API.

Usage: asc_store.py <AuthKey.p8> <key id> <issuer id> <screenshots dir (tr/, en/ with 1..7.png)>
Every step reports as a GitHub annotation so the result can be read without the log.
Does NOT submit for review (App Privacy must be answered in the web UI first).
"""
import hashlib, json, os, sys, time, urllib.error, urllib.request
import jwt

KEY, KID, ISS, SHOTS = sys.argv[1:5]
BUNDLE = 'com.tusneldax.electricman'
BASE = 'https://api.appstoreconnect.apple.com'
SITE = 'https://electricman.tusneldax.com'
IAP_ID = 'em_coins_500'

LOG = []
def note(msg, level='notice'):
    LOG.append(('! ' if level != 'notice' else '') + str(msg).replace('\n', ' '))
    print(msg, flush=True)

import atexit
@atexit.register
def _summary():
    # GitHub keeps only 10 annotations per level and step, so everything goes into one annotation
    print('::notice::' + '%0A'.join(LOG).replace('\r', ''), flush=True)

_tok = [None, 0]
def token():
    if time.time() - _tok[1] > 600:
        now = int(time.time())
        _tok[0] = jwt.encode({'iss': ISS, 'iat': now, 'exp': now + 1100, 'aud': 'appstoreconnect-v1'},
                             open(KEY).read(), algorithm='ES256', headers={'kid': KID, 'typ': 'JWT'})
        _tok[1] = time.time()
    return _tok[0]

class ApiError(Exception):
    pass

def api(method, path, body=None):
    url = path if path.startswith('http') else BASE + path
    req = urllib.request.Request(url, method=method, data=None if body is None else json.dumps(body).encode(),
                                 headers={'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        txt = e.read().decode(errors='replace')
        try:
            errs = json.loads(txt).get('errors', [])
            txt = ' | '.join(f"{x.get('code')}: {x.get('detail') or x.get('title')}" + (f" ({x['source'].get('pointer') or x['source'].get('parameter')})" if x.get('source') else '') for x in errs) or txt
        except Exception:
            pass
        raise ApiError(f'{method} {path.split("?")[0]} -> {e.code} {txt[:600]}')

def get_all(path):
    out, url = [], path
    while url:
        r = api('GET', url)
        out += r.get('data', [])
        url = (r.get('links') or {}).get('next')
    return out

def step(name):
    def wrap(fn):
        def run(*a, **k):
            try:
                v = fn(*a, **k)
                note(f'OK {name}' + (f': {v}' if isinstance(v, str) else ''))
                return v
            except Exception as e:
                note(f'FAIL {name}: {e}', 'warning')
                return None
        return run
    return wrap

# ---------------------------------------------------------------- texts
L = {
  'tr': dict(
    name='Electric Man', subtitle='Kabloları döndür, ışıkları yak',
    keywords='bulmaca,kablo,elektrik,zeka,beyin,bağlantı,ışık,yol,3d,mantık,boru,devre',
    promo='300 bölüm, 15 semt! Kabloları döndür, mahalleyi aydınlat, arkadaşlarınla haftalık ligde yarış.',
    description='''Electric Man ile mahalleyi aydınlatma zamanı! Kablolara dokun, döndür ve trafodan çıkan akımı her eve ulaştır. Usta elektrikçiler Serhat ve Zeynep dokunduğun kabloya koşup bağlantıyı yapar.

• 300 el yapımı bölüm: Köy'den Gökdelenler'e 15 farklı semt
• Gittikçe zorlaşan mekanikler: cıvatalı kablolar, kırık kablolar, bulutların altında gizli yollar
• Dönüş yönünü sen seç, az hamleyle üç yıldız topla
• Rengârenk 3D evler, canlı animasyonlar
• Haftalık lig: puan topla, arkadaşlarınla yarış
• Arkadaş ekle ve mesajlaş — mesajlar otomatik olarak senin diline çevrilir
• Bulutta kayıt: telefon değiştirsen de ilerlemen kaybolmaz
• 13 dil desteği

Oyun ücretsizdir; reklam izleyerek veya mağazadan jeton alabilirsin.

Gizlilik: https://electricman.tusneldax.com/gizlilik
Kullanım koşulları: https://electricman.tusneldax.com/kosullar''',
    iap_name='500 Jeton', iap_desc='Oyun içi 500 jeton'),
  'en-US': dict(
    name='Electric Man: Cable Puzzle', subtitle='Rotate cables, light up homes',
    keywords='puzzle,cable,electric,brain,logic,connect,pipe,circuit,light,path,3d,wire',
    promo='300 levels across 15 districts! Rotate the cables, light up the town and race your friends in the weekly league.',
    description='''Time to light up the neighbourhood with Electric Man! Tap the cables to rotate them and carry power from the transformer to every house. Master electricians Serhat and Zeynep run to the cable you tap and make the connection.

• 300 hand-tuned levels across 15 districts, from the Village to the Skyscrapers
• New twists as you go: bolted cables, broken cables, hidden paths under the clouds
• Choose your rotation direction and earn three stars with fewer moves
• Colourful 3D houses and lively animations
• Weekly league: earn points and race your friends
• Add friends and chat — messages are translated into your language automatically
• Cloud save: keep your progress when you switch phones
• Available in 13 languages

Free to play; get coins by watching ads or in the shop.

Privacy: https://electricman.tusneldax.com/gizlilik
Terms of use: https://electricman.tusneldax.com/kosullar''',
    iap_name='500 Coins', iap_desc='500 in-game coins'),
}
SHOT_DIR = {'tr': 'tr', 'en-US': 'en'}
REVIEW_NOTES = ('Sign-in is optional; the full game is playable without an account. Sign-in opens our website in Safari '
                '(Google or e-mail code) and returns to the app. Chat is limited to friends added by friend code, with Block and '
                'Report in every conversation (reports are reviewed within 24 hours; users can delete their account in the app). '
                'Coins are a consumable in-app purchase (em_coins_500) used for hints, extra moves and undo. Ads: Google AdMob '
                'app-open, interstitial (every 5 levels) and optional rewarded ads; consent via Google UMP and the ATT prompt.')

# ---------------------------------------------------------------- helpers
def upsert_loc(list_path, create_type, rel_name, rel_type, rel_id, locale, attrs):
    existing = {x['attributes']['locale']: x for x in get_all(list_path)}
    if locale in existing:
        x = existing[locale]
        api('PATCH', f"/v1/{create_type}/{x['id']}", {'data': {'type': create_type, 'id': x['id'], 'attributes': attrs}})
        return x['id']
    r = api('POST', f'/v1/{create_type}', {'data': {'type': create_type, 'attributes': dict(attrs, locale=locale),
            'relationships': {rel_name: {'data': {'type': rel_type, 'id': rel_id}}}}})
    return r['data']['id']

def upload_asset(create_type, rel_name, rel_type, rel_id, path):
    data = open(path, 'rb').read()
    r = api('POST', f'/v1/{create_type}', {'data': {'type': create_type, 'attributes': {'fileName': os.path.basename(path), 'fileSize': len(data)},
            'relationships': {rel_name: {'data': {'type': rel_type, 'id': rel_id}}}}})
    aid = r['data']['id']
    for op in r['data']['attributes']['uploadOperations']:
        chunk = data[op['offset']:op['offset'] + op['length']]
        req = urllib.request.Request(op['url'], method=op['method'], data=chunk, headers={h['name']: h['value'] for h in op.get('requestHeaders', [])})
        urllib.request.urlopen(req, timeout=120).read()
    api('PATCH', f'/v1/{create_type}/{aid}', {'data': {'type': create_type, 'id': aid,
        'attributes': {'uploaded': True, 'sourceFileChecksum': hashlib.md5(data).hexdigest()}}})
    return aid

# ---------------------------------------------------------------- steps
apps = api('GET', f'/v1/apps?filter[bundleId]={BUNDLE}')['data']
if not apps:
    note('app record not found', 'error'); sys.exit(1)
APP = apps[0]['id']
note(f"app {APP} {apps[0]['attributes'].get('name')} primaryLocale={apps[0]['attributes'].get('primaryLocale')}")

@step('content rights')
def content_rights():
    api('PATCH', f'/v1/apps/{APP}', {'data': {'type': 'apps', 'id': APP, 'attributes': {'contentRightsDeclaration': 'DOES_NOT_USE_THIRD_PARTY_CONTENT'}}})
content_rights()

infos = get_all(f'/v1/apps/{APP}/appInfos')
info = next((i for i in infos if (i['attributes'].get('state') or i['attributes'].get('appStoreState')) not in ('READY_FOR_DISTRIBUTION', 'READY_FOR_SALE', 'REPLACED_WITH_NEW_INFO')), infos[0])
INFO = info['id']

@step('category Games › Puzzle')
def category():
    api('PATCH', f'/v1/appInfos/{INFO}', {'data': {'type': 'appInfos', 'id': INFO, 'relationships': {
        'primaryCategory': {'data': {'type': 'appCategories', 'id': 'GAMES'}},
        'primarySubcategoryOne': {'data': {'type': 'appCategories', 'id': 'GAMES_PUZZLE'}},
        'secondaryCategory': {'data': {'type': 'appCategories', 'id': 'ENTERTAINMENT'}}}}})
category()

for loc, t in L.items():
    step(f'app info {loc}')(lambda loc=loc, t=t: upsert_loc(f'/v1/appInfos/{INFO}/appInfoLocalizations', 'appInfoLocalizations', 'appInfo', 'appInfos', INFO, loc,
        {'name': t['name'], 'subtitle': t['subtitle'], 'privacyPolicyUrl': SITE + '/gizlilik'}))()

@step('age rating')
def age():
    d = api('GET', f'/v1/appInfos/{INFO}/ageRatingDeclaration')['data']
    want = {'alcoholTobaccoOrDrugUseOrReferences': 'NONE', 'contests': 'NONE', 'gamblingSimulated': 'NONE', 'gunsOrOtherWeapons': 'NONE',
            'horrorOrFearThemes': 'NONE', 'matureOrSuggestiveThemes': 'NONE', 'medicalOrTreatmentInformation': 'NONE',
            'profanityOrCrudeHumor': 'NONE', 'sexualContentGraphicAndNudity': 'NONE', 'sexualContentOrNudity': 'NONE',
            'violenceCartoonOrFantasy': 'NONE', 'violenceRealistic': 'NONE', 'violenceRealisticProlongedGraphicOrSadistic': 'NONE',
            'gambling': False, 'unrestrictedWebAccess': False, 'lootBox': False, 'messagingAndChat': True, 'userGeneratedContent': True,
            'advertising': True, 'healthOrWellnessTopics': False, 'parentalControls': False, 'ageAssurance': False}
    attrs = {k: v for k, v in want.items() if k in d['attributes']}
    api('PATCH', f"/v1/ageRatingDeclarations/{d['id']}", {'data': {'type': 'ageRatingDeclarations', 'id': d['id'], 'attributes': attrs}})
    return 'set ' + ','.join(sorted(attrs)) + ' | unknown fields: ' + ','.join(k for k in d['attributes'] if k not in want)
age()

vers = get_all(f'/v1/apps/{APP}/appStoreVersions?filter[platform]=IOS')
ver = next((v for v in vers if v['attributes'].get('appStoreState') in ('PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED')), vers[0] if vers else None)
VER = ver['id']; VSTR = ver['attributes']['versionString']
note(f"version {VSTR} state={ver['attributes'].get('appStoreState')}")

@step('version: copyright, manual release')
def version():
    api('PATCH', f'/v1/appStoreVersions/{VER}', {'data': {'type': 'appStoreVersions', 'id': VER,
        'attributes': {'copyright': '2026 Tusnelda Enerji', 'releaseType': 'MANUAL'}}})
version()

LOC_IDS = {}
for loc, t in L.items():
    LOC_IDS[loc] = step(f'version texts {loc}')(lambda loc=loc, t=t: upsert_loc(f'/v1/appStoreVersions/{VER}/appStoreVersionLocalizations', 'appStoreVersionLocalizations',
        'appStoreVersion', 'appStoreVersions', VER, loc, {'description': t['description'], 'keywords': t['keywords'], 'promotionalText': t['promo'],
        'supportUrl': SITE + '/destek', 'marketingUrl': SITE}))()

def screenshots(loc, lid):
    folder = os.path.join(SHOTS, SHOT_DIR[loc])
    files = [os.path.join(folder, f'{n}.png') for n in range(1, 7) if os.path.exists(os.path.join(folder, f'{n}.png'))]
    if not files:
        return 'no files'
    sets = get_all(f'/v1/appStoreVersionLocalizations/{lid}/appScreenshotSets')
    s = next((x for x in sets if x['attributes']['screenshotDisplayType'] == 'APP_IPHONE_67'), None)
    if s:
        for old in get_all(f"/v1/appScreenshotSets/{s['id']}/appScreenshots"):
            api('DELETE', f"/v1/appScreenshots/{old['id']}")
        sid = s['id']
    else:
        sid = api('POST', '/v1/appScreenshotSets', {'data': {'type': 'appScreenshotSets', 'attributes': {'screenshotDisplayType': 'APP_IPHONE_67'},
            'relationships': {'appStoreVersionLocalization': {'data': {'type': 'appStoreVersionLocalizations', 'id': lid}}}}})['data']['id']
    for f in files:
        upload_asset('appScreenshots', 'appScreenshotSet', 'appScreenshotSets', sid, f)
    time.sleep(15)
    states = [x['attributes'].get('assetDeliveryState', {}).get('state') for x in get_all(f'/v1/appScreenshotSets/{sid}/appScreenshots')]
    return f'{len(files)} uploaded, states {states}'
for loc, lid in LOC_IDS.items():
    if lid:
        step(f'screenshots {loc}')(screenshots)(loc, lid)

@step('review contact + notes')
def review():
    attrs = {'contactFirstName': 'Ömer', 'contactLastName': 'Güçlü', 'contactPhone': '+905300529563', 'contactEmail': 'info@tusneldaenerji.com',
             'demoAccountRequired': False, 'notes': REVIEW_NOTES}
    try:
        d = api('GET', f'/v1/appStoreVersions/{VER}/appStoreReviewDetail')['data']
    except ApiError:
        d = None
    if d:
        api('PATCH', f"/v1/appStoreReviewDetails/{d['id']}", {'data': {'type': 'appStoreReviewDetails', 'id': d['id'], 'attributes': attrs}})
    else:
        api('POST', '/v1/appStoreReviewDetails', {'data': {'type': 'appStoreReviewDetails', 'attributes': attrs,
            'relationships': {'appStoreVersion': {'data': {'type': 'appStoreVersions', 'id': VER}}}}})
review()

@step('price: free')
def price():
    try:
        cur = api('GET', f'/v1/apps/{APP}/appPriceSchedule?include=manualPrices')
        if cur.get('included'):
            return 'already set'
    except ApiError:
        pass
    pts = get_all(f'/v1/apps/{APP}/appPricePoints?filter[territory]=USA&limit=200')
    free = next(p for p in pts if float(p['attributes']['customerPrice']) == 0)
    api('POST', '/v1/appPriceSchedules', {'data': {'type': 'appPriceSchedules', 'relationships': {
        'app': {'data': {'type': 'apps', 'id': APP}}, 'baseTerritory': {'data': {'type': 'territories', 'id': 'USA'}},
        'manualPrices': {'data': [{'type': 'appPrices', 'id': '${p0}'}]}}},
        'included': [{'type': 'appPrices', 'id': '${p0}', 'attributes': {'startDate': None},
                      'relationships': {'appPricePoint': {'data': {'type': 'appPricePoints', 'id': free['id']}}}}]})
price()

TERR = [t['id'] for t in get_all('/v1/territories?limit=200')]

@step('availability: all territories')
def availability():
    try:
        api('GET', f'/v1/apps/{APP}/appAvailabilityV2')
        return 'already set'
    except ApiError:
        pass
    api('POST', '/v2/appAvailabilities', {'data': {'type': 'appAvailabilities', 'attributes': {'availableInNewTerritories': True},
        'relationships': {'app': {'data': {'type': 'apps', 'id': APP}},
                          'territoryAvailabilities': {'data': [{'type': 'territoryAvailabilities', 'id': f'${{{t}}}'} for t in TERR]}}},
        'included': [{'type': 'territoryAvailabilities', 'id': f'${{{t}}}', 'attributes': {'available': True},
                      'relationships': {'territory': {'data': {'type': 'territories', 'id': t}}}} for t in TERR]})
    return f'{len(TERR)} territories'
availability()

@step('build: attach latest valid build')
def build():
    bs = api('GET', f'/v1/builds?filter[app]={APP}&filter[preReleaseVersion.version]={VSTR}&sort=-uploadedDate&limit=10')['data']
    b = next((x for x in bs if x['attributes'].get('processingState') == 'VALID'), None)
    if not b:
        return 'no valid build for ' + VSTR + ' (found ' + str([(x['attributes'].get('version'), x['attributes'].get('processingState')) for x in bs]) + ')'
    if b['attributes'].get('usesNonExemptEncryption') is None:
        api('PATCH', f"/v1/builds/{b['id']}", {'data': {'type': 'builds', 'id': b['id'], 'attributes': {'usesNonExemptEncryption': False}}})
    api('PATCH', f'/v1/appStoreVersions/{VER}/relationships/build', {'data': {'type': 'builds', 'id': b['id']}})
    return 'build ' + b['attributes'].get('version')
build()

# ---------------------------------------------------------------- in-app purchases (consumable coin packs)
# (product id, coins, TRY price, USD price) — USA is the base territory (Apple equalizes the rest, e.g. €4.99), Türkiye is set by hand
PACKS = [('em_coins_500', 500, 99.99, 4.99), ('em_coins_1200', 1200, 149.99, 7.49), ('em_coins_3000', 3000, 249.99, 12.49),
         ('em_coins_7000', 7000, 499.99, 24.99), ('em_coins_15000', 15000, 999.99, 49.99)]

def iap_pack(pid, n, price, usd):
    IAP = None
    def create():
        nonlocal IAP
        have = get_all(f'/v1/apps/{APP}/inAppPurchasesV2?filter[productId]={pid}')
        if have:
            IAP = have[0]['id']; return 'exists ' + IAP + ' state=' + str(have[0]['attributes'].get('state'))
        r = api('POST', '/v2/inAppPurchases', {'data': {'type': 'inAppPurchases', 'attributes': {
            'name': f'{n} Coins', 'productId': pid, 'inAppPurchaseType': 'CONSUMABLE', 'familySharable': False,
            'reviewNote': f'Adds {n} coins. Tap the coin counter (top-left) to open the shop; coins buy hints, extra moves and undo.'},
            'relationships': {'app': {'data': {'type': 'apps', 'id': APP}}}}})
        IAP = r['data']['id']; return 'created ' + IAP
    step(f'{pid}')(create)()
    if not IAP:
        return
    texts = {'tr': (f'{n:,} Jeton'.replace(',', '.'), f'Oyun içi {n:,} jeton'.replace(',', '.')),
             'en-US': (f'{n:,} Coins', f'{n:,} in-game coins')}
    for loc, (nm, ds) in texts.items():
        step(f'{pid} text {loc}')(lambda loc=loc, nm=nm, ds=ds: upsert_loc(f'/v2/inAppPurchases/{IAP}/inAppPurchaseLocalizations', 'inAppPurchaseLocalizations',
            'inAppPurchaseV2', 'inAppPurchases', IAP, loc, {'name': nm, 'description': ds}))()

    def point(terr, amount):
        url = f'/v2/inAppPurchases/{IAP}/pricePoints?filter[territory]={terr}&limit=200'
        while url:
            r = api('GET', url)
            pt = next((p for p in r['data'] if abs(float(p['attributes']['customerPrice']) - amount) < 0.001), None)
            if pt:
                return pt['id']
            url = (r.get('links') or {}).get('next')
        raise ApiError(f'no {amount} {terr} price point')

    def set_price():
        # a new schedule replaces the old one: base USA (equalized everywhere) + Türkiye by hand
        usa, tur = point('USA', usd), point('TUR', price)
        api('POST', '/v1/inAppPurchasePriceSchedules', {'data': {'type': 'inAppPurchasePriceSchedules', 'relationships': {
            'inAppPurchase': {'data': {'type': 'inAppPurchases', 'id': IAP}}, 'baseTerritory': {'data': {'type': 'territories', 'id': 'USA'}},
            'manualPrices': {'data': [{'type': 'inAppPurchasePrices', 'id': '${p0}'}, {'type': 'inAppPurchasePrices', 'id': '${p1}'}]}}},
            'included': [{'type': 'inAppPurchasePrices', 'id': '${p0}', 'attributes': {'startDate': None},
                          'relationships': {'inAppPurchasePricePoint': {'data': {'type': 'inAppPurchasePricePoints', 'id': usa}}}},
                         {'type': 'inAppPurchasePrices', 'id': '${p1}', 'attributes': {'startDate': None},
                          'relationships': {'inAppPurchasePricePoint': {'data': {'type': 'inAppPurchasePricePoints', 'id': tur}}}}]})
        eur = ''
        try:
            r = api('GET', f'/v2/inAppPurchases/{IAP}/iapPriceSchedule')
            sid = r['data']['id']
            r = api('GET', f'/v1/inAppPurchasePriceSchedules/{sid}/automaticPrices?filter[territory]=DEU&include=inAppPurchasePricePoint&limit=5')
            eur = ' DE €' + ','.join(x['attributes']['customerPrice'] for x in r.get('included', []) if x['type'] == 'inAppPurchasePricePoints')
        except ApiError as e:
            eur = ' (DE price unknown: ' + str(e)[:80] + ')'
        return f'${usd} base, ₺{price} TR' + eur
    step(f'{pid} price')(set_price)()

    def avail():
        try:
            api('GET', f'/v2/inAppPurchases/{IAP}/inAppPurchaseAvailability')
            return 'already set'
        except ApiError:
            pass
        api('POST', '/v1/inAppPurchaseAvailabilities', {'data': {'type': 'inAppPurchaseAvailabilities', 'attributes': {'availableInNewTerritories': True},
            'relationships': {'inAppPurchase': {'data': {'type': 'inAppPurchases', 'id': IAP}},
                              'availableTerritories': {'data': [{'type': 'territories', 'id': t} for t in TERR]}}}})
    step(f'{pid} availability')(avail)()

    def shot():
        f = os.path.join(SHOTS, 'tr', '7.png')
        if not os.path.exists(f):
            return 'no shop screenshot'
        try:
            cur = api('GET', f'/v2/inAppPurchases/{IAP}/appStoreReviewScreenshot')
            if cur.get('data'):
                return 'already set'
        except ApiError:
            pass
        upload_asset('inAppPurchaseAppStoreReviewScreenshots', 'inAppPurchaseV2', 'inAppPurchases', IAP, f)
    step(f'{pid} review screenshot')(shot)()

for pack in PACKS:
    iap_pack(*pack)

note('done — App Privacy questionnaire and the final "Submit for Review" are done in App Store Connect web UI')
