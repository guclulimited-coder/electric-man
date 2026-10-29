#!/usr/bin/env python3
"""Electric Man / Electric Hunter — App Store review resubmission (24 Oct 2026).
Owner approval: "diğer uygulamaların hepsini kontrol et ... ona göre aksiyon al".
Modes (store/em-asc-mode.txt):
  check                 read-only: versions, builds, review submissions + items, IAPs, review details, bundle capabilities, certificates
  submit <app> <build>  app = em | eh. Cancels a pending submission (eh), attaches <build>, AFTER_APPROVAL, reviewer note,
                        submits the version together with every READY_TO_SUBMIT in-app purchase, verifies the item count.
Never prints keys or passwords."""
import json, sys, time, urllib.request, urllib.error
import jwt
KEY, KID, ISS = sys.argv[1:4]
MODE = open('store/em-asc-mode.txt').read().split()
APPS = {'em': ('6819511421', 'com.tusneldax.electricman', 'Electric Man'), 'eh': ('6819712674', 'com.tusneldax.electrichunter', 'Electric Hunter'), 'mc': ('6817973176', 'com.tusnelda.ustasehri', 'MASTERCITY'), 'br': ('6817836111', 'com.tusneldax.busrush', 'TUSNELDAX Bus Rush')}
BASE = 'https://api.appstoreconnect.apple.com'
LOG = []
def note(m): LOG.append(str(m).replace('\n', ' ')); print(m, flush=True)
import atexit
atexit.register(lambda: print('::notice title=ASC ' + ' '.join(MODE) + '::' + '%0A'.join(LOG[-150:])))
_t = [None, 0]
def tok():
    if time.time() - _t[1] > 600:
        n = int(time.time()); _t[0] = jwt.encode({'iss': ISS, 'iat': n, 'exp': n + 1100, 'aud': 'appstoreconnect-v1'}, open(KEY).read(), algorithm='ES256', headers={'kid': KID, 'typ': 'JWT'}); _t[1] = time.time()
    return _t[0]
def api(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method, data=None if body is None else json.dumps(body).encode(), headers={'Authorization': 'Bearer ' + tok(), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            raw = r.read(); return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'{method} {path.split("?")[0]} -> {e.code} {e.read().decode(errors="replace")[:1500]}')
def safe(f, *a):
    try: return f(*a)
    except RuntimeError as e: note('  ! ' + str(e)[:600]); return None

def versions(app):
    return [x for x in api('GET', f'/v1/apps/{app}/appStoreVersions?filter[platform]=IOS&limit=5')['data'] if x['attributes']['appStoreState'] not in ('READY_FOR_SALE', 'REPLACED_WITH_NEW_INFO')]
def iaps(app):
    out = []
    r = safe(api, 'GET', f'/v1/apps/{app}/inAppPurchasesV2?limit=50')
    for x in (r or {}).get('data', []): out.append(x)
    return out
def items(sub):
    r = safe(api, 'GET', f'/v1/reviewSubmissions/{sub}/items?limit=50&include=appStoreVersion')
    return (r or {}).get('data', [])

def check(only=None):
    for key, (app, bid_name, name) in APPS.items():
        if only and key not in only: continue
        note(f'== {name} {app}')
        for v in versions(app):
            va = v['attributes']; b = (safe(api, 'GET', f"/v1/appStoreVersions/{v['id']}/build") or {}).get('data')
            note(f"  version {va['versionString']} {va['appStoreState']} release={va.get('releaseType')} build={(b or {}).get('attributes', {}).get('version')}")
            rd = (safe(api, 'GET', f"/v1/appStoreVersions/{v['id']}/appStoreReviewDetail") or {}).get('data')
            if rd:
                a = rd['attributes']
                note(f"  review detail: demoRequired={a.get('demoAccountRequired')} demoUser={a.get('demoAccountName')} demoPassSet={bool(a.get('demoAccountPassword'))}")
                note('  notes: ' + (a.get('notes') or '')[:900])
        for b in api('GET', f'/v1/builds?filter[app]={app}&sort=-uploadedDate&limit=4')['data']:
            note(f"  build {b['attributes']['version']} {b['attributes']['processingState']} {b['attributes'].get('uploadedDate', '')[:16]}")
        for s in api('GET', f'/v1/reviewSubmissions?filter[app]={app}&limit=4')['data']:
            its = items(s['id'])
            note(f"  submission {s['id']} {s['attributes']['state']} submitted={str(s['attributes'].get('submittedDate'))[:16]} items={len(its)} " + ','.join(i['attributes'].get('state', '') for i in its))
        for x in iaps(app):
            note(f"  iap {x['id']} {x['attributes'].get('productId')} {x['attributes'].get('state')}")
        bid = [b for b in api('GET', '/v1/bundleIds?filter[identifier]=' + bid_name)['data'] if b['attributes']['identifier'] == bid_name]
        if bid:
            caps = safe(api, 'GET', f"/v1/bundleIds/{bid[0]['id']}/bundleIdCapabilities?limit=50") or {'data': []}
            note('  capabilities: ' + ','.join(c['attributes'].get('capabilityType', '') for c in caps['data']))
    certs = safe(api, 'GET', '/v1/certificates?limit=50') or {'data': []}
    for c in certs['data']:
        a = c['attributes']
        if a.get('certificateType') in ('DISTRIBUTION', 'IOS_DISTRIBUTION'):
            note(f"cert {c['id']} {a.get('certificateType')} {a.get('name')} exp={str(a.get('expirationDate'))[:10]}")

def submit(key, build):
    app, bid_name, name = APPS[key]
    bs = api('GET', f'/v1/builds?filter[app]={app}&filter[version]={build}&limit=5')['data']
    if not bs or bs[0]['attributes']['processingState'] != 'VALID':
        note(f"{name}: build {build} not ready: {bs[0]['attributes']['processingState'] if bs else 'MISSING'}"); sys.exit(3)
    b = bs[0]
    v = versions(app)[0]; note(f"{name}: start {v['attributes']['versionString']} {v['attributes']['appStoreState']}")
    if key == 'br' and v['attributes']['versionString'] != '1.7.3':
        # Bus Rush is live (1.7.1): create the new version record; 1.7.1 stays on sale until 1.7.3 is approved
        v = api('POST', '/v1/appStoreVersions', {'data': {'type': 'appStoreVersions', 'attributes': {'platform': 'IOS', 'versionString': '1.7.3', 'releaseType': 'AFTER_APPROVAL'}, 'relationships': {'app': {'data': {'type': 'apps', 'id': app}}}}})['data']; note('version 1.7.3 created')
        wn = {'tr': 'Hesabınla giriş: ilerlemen, ligin ve arkadaşların tüm cihazlarda saklanır. Daha önce giriş yapmadan oynadıysan ilerlemen hesabına aktarılır.'}
        for loc in api('GET', f"/v1/appStoreVersions/{v['id']}/appStoreVersionLocalizations")['data']:
            lc = loc['attributes']['locale']
            txt = wn.get(lc.split('-')[0], 'Sign in to play: your progress, league and friends are saved across all your devices. Progress made before signing in is moved to your account.')
            safe(api, 'PATCH', f"/v1/appStoreVersionLocalizations/{loc['id']}", {'data': {'type': 'appStoreVersionLocalizations', 'id': loc['id'], 'attributes': {'whatsNew': txt}}}); note('whatsNew ' + lc)
    # 1) withdraw a pending submission (Electric Hunter); a rejected one (UNRESOLVED_ISSUES) stays and is reused/replaced
    old = None
    for s in api('GET', f'/v1/reviewSubmissions?filter[app]={app}&limit=10')['data']:
        if s['attributes']['state'] in ('WAITING_FOR_REVIEW', 'IN_REVIEW'):
            if safe(api, 'PATCH', f"/v1/reviewSubmissions/{s['id']}", {'data': {'type': 'reviewSubmissions', 'id': s['id'], 'attributes': {'canceled': True}}}) is not None:
                old = s['id']; note('withdrew submission ' + s['id'])
    for i in range(60):
        v = versions(app)[0]; st = v['attributes']['appStoreState']
        if st in ('DEVELOPER_REJECTED', 'PREPARE_FOR_SUBMISSION', 'REJECTED', 'METADATA_REJECTED'): break
        time.sleep(15)
    note('version state: ' + st)
    if st not in ('DEVELOPER_REJECTED', 'PREPARE_FOR_SUBMISSION', 'REJECTED', 'METADATA_REJECTED'): note('version not editable yet'); sys.exit(4)
    if old:
        for i in range(40):
            s2 = api('GET', f'/v1/reviewSubmissions/{old}')['data']['attributes']['state']
            if s2 != 'CANCELING': break
            time.sleep(15)
        note('old submission: ' + s2)
    if key == 'mc':
        # MASTERCITY: the only (never released) version record is reused for the new version
        api('PATCH', f"/v1/appStoreVersions/{v['id']}", {'data': {'type': 'appStoreVersions', 'id': v['id'], 'attributes': {'versionString': '1.0.44'}}}); note('version string -> 1.0.44')
    # 2) release after approval, build
    api('PATCH', f"/v1/appStoreVersions/{v['id']}", {'data': {'type': 'appStoreVersions', 'id': v['id'], 'attributes': {'releaseType': 'AFTER_APPROVAL'}}}); note('releaseType AFTER_APPROVAL')
    if b['attributes'].get('usesNonExemptEncryption') is None:
        safe(api, 'PATCH', f"/v1/builds/{b['id']}", {'data': {'type': 'builds', 'id': b['id'], 'attributes': {'usesNonExemptEncryption': False}}})
    api('PATCH', f"/v1/appStoreVersions/{v['id']}/relationships/build", {'data': {'type': 'builds', 'id': b['id']}}); note(f'build {build} attached')
    # 3) reviewer note
    rd = (api('GET', f"/v1/appStoreVersions/{v['id']}/appStoreReviewDetail") or {}).get('data')
    extra = (f"Build {build} (29 Oct 2026): The game now requires an account (sign-in is shown at first launch) because it includes "
             "online chat, friends, leagues and cloud saves across devices; the reason is shown on the sign-in screen. Progress made earlier "
             "without an account is moved to the account on first sign-in. Sign in with Apple is offered (native system sheet), plus Google and e-mail code. "
             "Demo account: on the sign-in screen tap 'Sign in with demo account (App Review)' and use the username and password above. "
             "Account deletion is available in the app: Account (profile) > Delete account. "
             "The coin packs in the shop are consumable in-app purchases and are submitted together with this version.")
    if rd:
        n = rd['attributes'].get('notes') or ''
        if key in ('mc', 'br'):
            mc = (f"Build {build} (29 Oct 2026): sign-in is required at first launch (online chat, friends, shared multiplayer city, cloud saves; "
                  "the reason is shown on the sign-in screen). Progress made earlier without an account is moved to the account on first sign-in. "
                  "Sign in with Apple is offered. Account deletion in the app: profile menu > 'Hesap ayarları ve silme', and the app menu > 'Hesabımı silme seçenekleri'. "
                  "No gambling or casino content in the iOS app. Demo account steps below are unchanged.\n\n")
            if key == 'br':
                mc = (f"Build {build} (30 Oct 2026): sign-in is now required at first launch (leagues, friends, duels and cloud saves across devices; "
                      "the reason is shown on the sign-in screen). Progress made earlier without an account is moved to the account on first sign-in. "
                      "Sign in with Apple is offered. Account deletion in the app: Hesabım (My account) > delete account. Demo account steps below are unchanged.\n\n")
            if f'Build {build} (29 Oct 2026)' not in n:
                api('PATCH', f"/v1/appStoreReviewDetails/{rd['id']}", {'data': {'type': 'appStoreReviewDetails', 'id': rd['id'], 'attributes': {'notes': (mc + n)[:3990]}}}); note('reviewer note prepended (demo steps kept)')
        elif f'Build {build} (29 Oct 2026)' not in n:
            api('PATCH', f"/v1/appStoreReviewDetails/{rd['id']}", {'data': {'type': 'appStoreReviewDetails', 'id': rd['id'], 'attributes': {'notes': extra[:3900]}}}); note('reviewer note replaced')
    # 3b) age rating: answer Apple's new questions (owner approved 30 Oct 00:01: not a social media app)
    for ai in api('GET', f'/v1/apps/{app}/appInfos')['data']:
        d = (safe(api, 'GET', f"/v1/appInfos/{ai['id']}/ageRatingDeclaration") or {}).get('data')
        if not d: continue
        fix = {k: False for k in ('socialMedia', 'socialMediaAgeRestricted') if d['attributes'].get(k) is None}
        if fix:
            safe(api, 'PATCH', f"/v1/ageRatingDeclarations/{d['id']}", {'data': {'type': 'ageRatingDeclarations', 'id': d['id'], 'attributes': fix}}); note('age rating set: ' + str(fix))
    # 4) submission: version + in-app purchases
    subs = api('GET', f'/v1/reviewSubmissions?filter[app]={app}&filter[platform]=IOS&limit=10')['data']
    sub = next((s for s in subs if s['attributes']['state'] in ('READY_FOR_REVIEW', 'UNRESOLVED_ISSUES')), None)
    if not sub:
        sub = api('POST', '/v1/reviewSubmissions', {'data': {'type': 'reviewSubmissions', 'attributes': {'platform': 'IOS'}, 'relationships': {'app': {'data': {'type': 'apps', 'id': app}}}}})['data']
    note(f"submission {sub['id']} {sub['attributes'].get('state')}")
    its = items(sub['id'])
    if not any((i.get('relationships', {}).get('appStoreVersion', {}).get('data') or {}).get('id') == v['id'] for i in its):
        safe(api, 'POST', '/v1/reviewSubmissionItems', {'data': {'type': 'reviewSubmissionItems', 'relationships': {'reviewSubmission': {'data': {'type': 'reviewSubmissions', 'id': sub['id']}}, 'appStoreVersion': {'data': {'type': 'appStoreVersions', 'id': v['id']}}}}})
    want = [x for x in iaps(app) if x['attributes'].get('state') in ('READY_TO_SUBMIT', 'DEVELOPER_ACTION_NEEDED', 'REJECTED')]
    for x in want:
        r = safe(api, 'POST', '/v1/inAppPurchaseSubmissions', {'data': {'type': 'inAppPurchaseSubmissions', 'relationships': {'inAppPurchaseV2': {'data': {'type': 'inAppPurchases', 'id': x['id']}}}}})
        note(f"iap {x['attributes'].get('productId')}: " + ('added' if r is not None else 'NOT added'))
    its = items(sub['id']); note(f'items before submit: {len(its)}')
    r = safe(api, 'PATCH', f"/v1/reviewSubmissions/{sub['id']}", {'data': {'type': 'reviewSubmissions', 'id': sub['id'], 'attributes': {'submitted': True}}})
    note('SUBMITTED' if r is not None else 'NOT SUBMITTED')
    time.sleep(15)
    s = api('GET', f"/v1/reviewSubmissions/{sub['id']}")['data']; its = items(sub['id'])
    note(f"final submission {s['id']} {s['attributes']['state']} items={len(its)}")
    for x in iaps(app): note(f"  iap {x['attributes'].get('productId')} {x['attributes'].get('state')}")
    v = versions(app)[0]; note(f"FINAL {name}: {v['attributes']['versionString']} {v['attributes']['appStoreState']}")


def agecheck(key):
    app, bid_name, name = APPS[key]
    v = versions(app)[0]
    info = api('GET', f'/v1/apps/{app}/appInfos')['data']
    for ai in info:
        note(f"appInfo {ai['id']} {ai['attributes'].get('appStoreState') or ai['attributes'].get('state')}")
        d = safe(api, 'GET', f"/v1/appInfos/{ai['id']}/ageRatingDeclaration")
        if d: note('AGE ' + json.dumps(d['data']['attributes'])[:3000])
    r = safe(api, 'GET', f"/v1/appStoreVersions/{v['id']}/ageRatingDeclaration")
    if r: note('VAGE ' + json.dumps(r['data']['attributes'])[:3000])

if MODE[0] == 'agecheck': agecheck(MODE[1])
if MODE[0] == 'check': check(MODE[1:] or None)
elif MODE[0] == 'submit':
    for i in range(1, len(MODE), 2): submit(MODE[i], MODE[i + 1])
