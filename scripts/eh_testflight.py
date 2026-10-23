"""Electric Hunter: en son işlenmiş derlemeyi TestFlight iç + dış test gruplarına ekle, dış test için beta incelemesine gönder.
Sahip onayı: 23 Ekim 2026 "tüm mağazalara gönder, TestFlight iç dış testlere de yükle"."""
import json, sys, time, urllib.request, urllib.error
import jwt
KEY, KID, ISS = sys.argv[1:4]; BUILD = sys.argv[4] if len(sys.argv) > 4 else ''
APP = '6819712674'; BASE = 'https://api.appstoreconnect.apple.com'
LOG = []
def note(m): LOG.append(str(m).replace('\n', ' ')); print(m, flush=True)
import atexit; atexit.register(lambda: print('::notice title=EH-TF::' + '%0A'.join(LOG)))
_t = [None, 0]
def tok():
    if time.time() - _t[1] > 600:
        n = int(time.time()); _t[0] = jwt.encode({'iss': ISS, 'iat': n, 'exp': n + 1100, 'aud': 'appstoreconnect-v1'}, open(KEY).read(), algorithm='ES256', headers={'kid': KID, 'typ': 'JWT'}); _t[1] = time.time()
    return _t[0]
def api(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method, data=None if body is None else json.dumps(body).encode(), headers={'Authorization': 'Bearer ' + tok(), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read(); return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'{method} {path.split("?")[0]} -> {e.code} {e.read().decode(errors="replace")[:1500]}')
# 1 newest VALID build (or the one asked for), wait up to 25 min for processing
b = None
for i in range(50):
    q = f'/v1/builds?filter[app]={APP}&sort=-uploadedDate&limit=3' + (f'&filter[version]={BUILD}' if BUILD else '')
    bs = api('GET', q)['data']
    if bs and bs[0]['attributes'].get('processingState') == 'VALID': b = bs[0]; break
    note(f"derleme işleniyor: {[(x['attributes']['version'], x['attributes'].get('processingState')) for x in bs]}"); time.sleep(30)
if not b: note('derleme VALID olmadı'); sys.exit(1)
note(f"derleme {b['attributes']['version']} VALID")
if b['attributes'].get('usesNonExemptEncryption') is None:
    api('PATCH', f"/v1/builds/{b['id']}", {'data': {'type': 'builds', 'id': b['id'], 'attributes': {'usesNonExemptEncryption': False}}}); note('şifreleme beyanı: muaf')
# 2 "what to test" text
try:
    locs = api('GET', f"/v1/builds/{b['id']}/betaBuildLocalizations")['data']
    txt = 'Yeni yaratık kadrosu, 36 gezegen ve Bölüm 4 Derin Kök; yeni tempo (bekleme duvarı yok), yeniden ölçülmüş boss dövüşü.'
    if locs: api('PATCH', f"/v1/betaBuildLocalizations/{locs[0]['id']}", {'data': {'type': 'betaBuildLocalizations', 'id': locs[0]['id'], 'attributes': {'whatsNew': txt}}})
    else: api('POST', '/v1/betaBuildLocalizations', {'data': {'type': 'betaBuildLocalizations', 'attributes': {'locale': 'en-US', 'whatsNew': txt}, 'relationships': {'build': {'data': {'type': 'builds', 'id': b['id']}}}}})
    note('test notu yazıldı')
except RuntimeError as e: note('test notu: ' + str(e)[:200])
# 3 groups: every existing group of the app; make sure one internal and one external exist
groups = api('GET', f'/v1/betaGroups?filter[app]={APP}&limit=50')['data']
have_int = any(g['attributes'].get('isInternalGroup') for g in groups); have_ext = any(not g['attributes'].get('isInternalGroup') for g in groups)
if not have_int:
    groups.append(api('POST', '/v1/betaGroups', {'data': {'type': 'betaGroups', 'attributes': {'name': 'İç Test', 'isInternalGroup': True, 'hasAccessToAllBuilds': True}, 'relationships': {'app': {'data': {'type': 'apps', 'id': APP}}}}})['data']); note('iç test grubu oluşturuldu')
if not have_ext:
    groups.append(api('POST', '/v1/betaGroups', {'data': {'type': 'betaGroups', 'attributes': {'name': 'Dış Test', 'isInternalGroup': False, 'publicLinkEnabled': True, 'publicLinkLimitEnabled': False}, 'relationships': {'app': {'data': {'type': 'apps', 'id': APP}}}}})['data']); note('dış test grubu oluşturuldu')
for g in groups:
    try:
        api('POST', f"/v1/betaGroups/{g['id']}/relationships/builds", {'data': [{'type': 'builds', 'id': b['id']}]})
        note(f"gruba eklendi: {g['attributes']['name']} ({'iç' if g['attributes'].get('isInternalGroup') else 'dış'}) link={g['attributes'].get('publicLink') or '-'}")
    except RuntimeError as e: note(f"grup {g['attributes']['name']}: " + str(e)[:300])
# 4 external testing needs Apple's beta review
try:
    api('POST', '/v1/betaAppReviewSubmissions', {'data': {'type': 'betaAppReviewSubmissions', 'relationships': {'build': {'data': {'type': 'builds', 'id': b['id']}}}}}); note('beta incelemesine gönderildi (dış test)')
except RuntimeError as e: note('beta inceleme: ' + str(e)[:400])
st = api('GET', f"/v1/builds/{b['id']}/betaAppReviewSubmission").get('data') or {}
note('beta inceleme durumu: ' + str(st.get('attributes', {}).get('betaReviewState')))
