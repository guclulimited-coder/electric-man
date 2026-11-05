"""Create the shared CI distribution certificate once. If both distribution slots are full, revoke ONLY the Gölge test
certificate named in REVOKE_ONLY (TestFlight-only; never MASTERCITY/Bus Rush/Electric Man/Electric Hunter store certificates)."""
import base64, json, os, pathlib, re, secrets, subprocess, sys, textwrap, time, urllib.error, urllib.request
import jwt, ci_vault
env = os.environ; temp = pathlib.Path(env.get('RUNNER_TEMP', '/tmp'))
raw = env['API_PRIVATE_KEY'].replace('\\n', '\n')
body = re.sub(r'[^A-Za-z0-9+/=]', '', re.sub(r'-----(BEGIN|END)[A-Z ]*-----', '', raw))
KEY = '-----BEGIN PRIVATE KEY-----\n' + '\n'.join(textwrap.wrap(body, 64)) + '\n-----END PRIVATE KEY-----\n'
def api(method, path, data=None, ok=()):
    tok = jwt.encode({'iss': env['ISSUER'], 'iat': int(time.time()), 'exp': int(time.time()) + 600, 'aud': 'appstoreconnect-v1'}, KEY, algorithm='ES256', headers={'kid': env['KEY_ID'], 'typ': 'JWT'})
    req = urllib.request.Request('https://api.appstoreconnect.apple.com' + path, method=method, data=json.dumps(data).encode() if data else None, headers={'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r: return json.load(r) if r.status != 204 else {}
    except urllib.error.HTTPError as e:
        msg = e.read().decode(errors='replace')[:300]
        if e.code in ok: return {'_error': e.code, '_msg': msg}
        print('::error::' + method + ' ' + path.split('?')[0] + ' -> ' + str(e.code) + ' ' + msg.replace('\n', ' ')); raise
ids = {c['id'] for c in api('GET', '/v1/certificates?limit=200')['data']}
vault = pathlib.Path('ci-cert.enc.json')
if vault.exists():
    v = ci_vault.load(vault)
    if v['certId'] in ids: print('::notice::shared CI certificate ' + v['certId'] + ' already exists and opens'); sys.exit(0)
    print('::warning::sealed certificate ' + v['certId'] + ' no longer exists; creating a new one')
k = temp / 'ci.key'; csr = temp / 'ci.csr'
subprocess.run(['openssl', 'req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', str(k), '-out', str(csr), '-subj', '/CN=TusneldaX CI/O=TusneldaX/C=TR'], check=True, capture_output=True)
csr_b64 = ''.join(l for l in csr.read_text().splitlines() if not l.startswith('-----'))
def make():
    for ctype, ident in [('DISTRIBUTION', 'Apple Distribution'), ('IOS_DISTRIBUTION', 'iPhone Distribution')]:
        r = api('POST', '/v1/certificates', {'data': {'type': 'certificates', 'attributes': {'certificateType': ctype, 'csrContent': csr_b64}}}, ok=(409,))
        if '_error' not in r: return r['data'], ident
    return None, None
cert, ident = make()
if not cert:
    only = env['REVOKE_ONLY'].strip()
    if only in ids:
        r = api('DELETE', '/v1/certificates/' + only, ok=(404, 409)); print('::warning::revoked Gölge TestFlight certificate ' + only)
        time.sleep(5); cert, ident = make()
if not cert: print('::error::no free distribution slot'); sys.exit(1)
der = temp / 'ci.cer'; der.write_bytes(base64.b64decode(cert['attributes']['certificateContent']))
pem = temp / 'ci.pem'; subprocess.run(['openssl', 'x509', '-inform', 'DER', '-in', str(der), '-out', str(pem)], check=True)
pw = secrets.token_urlsafe(24); p12 = temp / 'ci.p12'
r = subprocess.run(['openssl', 'pkcs12', '-export', '-legacy', '-inkey', str(k), '-in', str(pem), '-out', str(p12), '-passout', 'pass:' + pw], capture_output=True)
if r.returncode: print('::error::pkcs12 export failed'); sys.exit(1)
ci_vault.seal({'p12': base64.b64encode(p12.read_bytes()).decode(), 'password': pw, 'certId': cert['id'], 'signId': ident, 'type': cert['attributes']['certificateType'], 'created': int(time.time())}, vault)
for f in (k, csr, der, pem, p12): f.unlink(missing_ok=True)
assert ci_vault.load(vault)['certId'] == cert['id']
print('::notice::shared CI certificate ' + cert['id'] + ' (' + ident + ') sealed')
