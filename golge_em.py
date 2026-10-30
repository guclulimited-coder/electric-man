"""Gölge Operasyonu – electric-man tarafı: yalnız Apple kimlik işleri (paket kimliği, geçici dağıtım sertifikası,
App Store profili). Sertifika paketi, usta-sehri golge-ios CI'sinin türetilmiş açık anahtarına şifrelenir
(X25519 + AES-GCM); düz metin hiçbir yere yazılmaz. Yer yoksa yalnız eh-ios-cert kaydındaki CI sertifikası
iptal edilir ve kayıt yeni sertifika ile güncellenir (Electric Hunter/Man CI'si bir sonraki koşuda onu döndürür).
MASTERCITY sertifikasına dokunulmaz. Uygulama kaydı oluşturulmaz (API izin vermez), inceleme gönderimi yoktur."""
import base64, json, os, pathlib, re, secrets, subprocess, sys, textwrap, time, urllib.error, urllib.request
import jwt
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

BUNDLE = 'com.tusneldax.golgeoperasyonu'
env = os.environ
temp = pathlib.Path(env.get('RUNNER_TEMP', '/tmp'))


def note(level, title, msg):
    print('::%s title=%s::%s' % (level, title, str(msg).replace('%', '%25').replace('\n', ' | ')), flush=True)


raw = env['API_PRIVATE_KEY'].replace('\\n', '\n')
body = re.sub(r'[^A-Za-z0-9+/=]', '', re.sub(r'-----(BEGIN|END)[A-Z ]*-----', '', raw))
KEY = '-----BEGIN PRIVATE KEY-----\n' + '\n'.join(textwrap.wrap(body, 64)) + '\n-----END PRIVATE KEY-----\n'


def api(method, path, data=None, ok=()):
    tok = jwt.encode({'iss': env['ISSUER'], 'iat': int(time.time()), 'exp': int(time.time()) + 600, 'aud': 'appstoreconnect-v1'}, KEY, algorithm='ES256', headers={'kid': env['KEY_ID'], 'typ': 'JWT'})
    req = urllib.request.Request('https://api.appstoreconnect.apple.com' + path, method=method, data=json.dumps(data).encode() if data else None,
                                 headers={'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r) if r.status != 204 else {}
    except urllib.error.HTTPError as e:
        msg = e.read().decode(errors='replace')[:400]
        if e.code in ok:
            return {'_error': e.code, '_msg': msg}
        note('error', 'asc', method + ' ' + path.split('?')[0] + ' -> ' + str(e.code) + ' ' + msg); raise


cfg = json.loads(pathlib.Path('golge-ios.json').read_text())
found = [b for b in api('GET', '/v1/bundleIds?filter[identifier]=' + BUNDLE)['data'] if b['attributes']['identifier'] == BUNDLE]
bid = found[0] if found else api('POST', '/v1/bundleIds', {'data': {'type': 'bundleIds', 'attributes': {'identifier': BUNDLE, 'name': 'Golge Operasyonu', 'platform': 'IOS'}}})['data']
note('notice', 'bundle', BUNDLE + ' id=' + bid['id'] + (' (existing)' if found else ' (registered now)'))
apps = [a for a in api('GET', '/v1/apps?filter[bundleId]=' + BUNDLE)['data'] if a['attributes']['bundleId'] == BUNDLE]
note('notice' if apps else 'warning', 'app record', ('id=' + apps[0]['id'] + ' ' + apps[0]['attributes']['name']) if apps else 'MISSING (create in App Store Connect web UI)')
certs = api('GET', '/v1/certificates?limit=200')['data']
dist = [c for c in certs if c['attributes']['certificateType'] in ('DISTRIBUTION', 'IOS_DISTRIBUTION')]
note('notice', 'distribution certificates', '; '.join('%s %s %s' % (c['id'], c['attributes']['certificateType'], c['attributes'].get('displayName')) for c in dist) or 'none')
if cfg.get('stage') != 'sign':
    sys.exit(0)
recipient = X25519PublicKey.from_public_bytes(base64.b64decode(cfg['recipient']))

k = temp / 'g.key'; csr = temp / 'g.csr'
subprocess.run(['openssl', 'req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', str(k), '-out', str(csr), '-subj', '/CN=Golge Operasyonu CI/O=TusneldaX/C=TR'], check=True, capture_output=True)
csr_b64 = ''.join(l for l in csr.read_text().splitlines() if not l.startswith('-----'))
sign_id = 'Apple Distribution'


def make():
    global sign_id
    for ctype, ident in [('DISTRIBUTION', 'Apple Distribution'), ('IOS_DISTRIBUTION', 'iPhone Distribution')]:
        r = api('POST', '/v1/certificates', {'data': {'type': 'certificates', 'attributes': {'certificateType': ctype, 'csrContent': csr_b64}}}, ok=(409,))
        if '_error' not in r:
            sign_id = ident; return r['data']
    return None


cert = make()
if not cert:
    prev = pathlib.Path('prev-cert/eh-ios-cert.txt'); pid = prev.read_text().strip() if prev.exists() else ''
    if pid:
        r = api('DELETE', '/v1/certificates/' + pid, ok=(404, 409))
        note('warning', 'cert', 'revoked previous recorded CI certificate ' + pid + (' (' + str(r['_error']) + ')' if '_error' in r else ''))
        time.sleep(5); cert = make()
if not cert:
    note('error', 'cert', 'Apple distribution certificate limit reached'); sys.exit(1)
pathlib.Path('prev-cert/eh-ios-cert.txt').write_text(cert['id'] + '\n')
note('notice', 'cert', 'new CI certificate ' + cert['id'] + ' (' + sign_id + ')')
der = temp / 'g.cer'; der.write_bytes(base64.b64decode(cert['attributes']['certificateContent']))
pem = temp / 'g.pem'; subprocess.run(['openssl', 'x509', '-inform', 'DER', '-in', str(der), '-out', str(pem)], check=True)
pw = secrets.token_urlsafe(24); p12 = temp / 'g.p12'
r = subprocess.run(['openssl', 'pkcs12', '-export', '-legacy', '-inkey', str(k), '-in', str(pem), '-out', str(p12), '-passout', 'pass:' + pw], capture_output=True)
if r.returncode:
    r = subprocess.run(['openssl', 'pkcs12', '-export', '-inkey', str(k), '-in', str(pem), '-out', str(p12), '-passout', 'pass:' + pw], capture_output=True)
if r.returncode:
    note('error', 'pkcs12', r.stderr[:200]); sys.exit(1)
name = 'Golge Operasyonu CI ' + time.strftime('%Y%m%d%H%M%S')
prof = api('POST', '/v1/profiles', {'data': {'type': 'profiles', 'attributes': {'name': name, 'profileType': 'IOS_APP_STORE'},
           'relationships': {'bundleId': {'data': {'type': 'bundleIds', 'id': bid['id']}}, 'certificates': {'data': [{'type': 'certificates', 'id': cert['id']}]}}}})['data']
payload = json.dumps({'p12': base64.b64encode(p12.read_bytes()).decode(), 'password': pw, 'profile': prof['attributes']['profileContent'],
                      'profileName': name, 'profileId': prof['id'], 'signId': sign_id, 'certId': cert['id'], 'created': int(time.time())}).encode()
eph = X25519PrivateKey.generate(); eph_pub = eph.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
rcp = recipient.public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
aes = HKDF(algorithm=hashes.SHA256(), length=32, salt=eph_pub + rcp, info=b'golge-ios-v1').derive(eph.exchange(recipient))
nonce = secrets.token_bytes(12)
ct = AESGCM(aes).encrypt(nonce, payload, b'golge-ios-v1')
pathlib.Path('golge-sign.enc.json').write_text(json.dumps({'v': 1, 'eph': base64.b64encode(eph_pub).decode(), 'nonce': base64.b64encode(nonce).decode(), 'ct': base64.b64encode(ct).decode(), 'certId': cert['id'], 'profile': name}) + '\n')
for f in (k, csr, der, pem, p12):
    f.unlink(missing_ok=True)
note('notice', 'sealed', 'encrypted signing bundle written for usta-sehri golge-ios (profile ' + name + ')')
