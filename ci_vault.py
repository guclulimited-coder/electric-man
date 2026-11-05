"""Shared persistent CI distribution certificate for Electric Man, Electric Hunter and Gölge (owner approval 5 Nov 2026 23:50).
The p12 is sealed with AES-GCM under a key derived (HKDF) from the App Store Connect API key secret, so only workflows that
already hold that secret can open it. Nothing here creates profiles or revokes anything."""
import base64, json, os, pathlib, re, secrets
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
AAD = b'tusneldax-ci-cert-v1'
def _key():
    raw = os.environ['API_PRIVATE_KEY'].replace('\\n', '\n')
    body = re.sub(r'[^A-Za-z0-9+/=]', '', re.sub(r'-----(BEGIN|END)[A-Z ]*-----', '', raw))
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=b'tusneldax-ci-cert', info=b'v1').derive(base64.b64decode(body))
def seal(obj, path):
    nonce = secrets.token_bytes(12)
    ct = AESGCM(_key()).encrypt(nonce, json.dumps(obj).encode(), AAD)
    pathlib.Path(path).write_text(json.dumps({'v': 1, 'certId': obj['certId'], 'signId': obj['signId'], 'nonce': base64.b64encode(nonce).decode(), 'ct': base64.b64encode(ct).decode()}) + '\n')
def load(path):
    d = json.loads(pathlib.Path(path).read_text())
    return json.loads(AESGCM(_key()).decrypt(base64.b64decode(d['nonce']), base64.b64decode(d['ct']), AAD))
