"""Electric Man / Electric Hunter açılış hunisini okur (6 Kasım 2026, sahip onaylı ölçüm planı).
Okuma anahtarı App Store Connect API gizli anahtarından türetilir (HKDF); düz anahtar yazdırılmaz, yalnız SHA-256 özeti.
Sonuçlar ::notice:: satırlarıdır (yalnız sayaç; kimlik yok)."""
import base64, hashlib, json, os, re, sys, urllib.request
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
raw = os.environ['API_PRIVATE_KEY'].replace('\\n', '\n')
body = re.sub(r'[^A-Za-z0-9+/=]', '', re.sub(r'-----(BEGIN|END)[A-Z ]*-----', '', raw))
key = HKDF(algorithm=hashes.SHA256(), length=32, salt=b'em-funnel', info=b'read-v1').derive(base64.b64decode(body)).hex()
print('::add-mask::' + key)
print('::notice title=key hash::FUNNEL_KEY_SHA256=' + hashlib.sha256(('em-funnel:' + key).encode()).hexdigest())
days = (open('days.txt').read().strip() if os.path.exists('days.txt') else '7')
req = urllib.request.Request('https://electricman.tusneldax.com/api/em/admin/funnel?days=' + days, headers={'x-funnel-key': key, 'User-Agent': 'TusneldaX-Funnel/1.0'})
try:
    d = json.load(urllib.request.urlopen(req, timeout=30))
except Exception as e:
    print('::warning title=read::' + str(e)[:200]); sys.exit(0)
ORDER = ['app_open', 'first_paint', 'play_ready', 'level_start', 'level_done', 'level_fail', 'd1_return', 'd7_return', 'stall', 'boot_error']
lines = []
for day in sorted(d.get('days', {})):
    for g, x in sorted(d['days'][day].items()):
        st = x.get('stages', {}); nw = x.get('newInstalls', {})
        lines.append(f"{day} {g}: " + ' → '.join(f"{s} {st.get(s, 0)}" for s in ORDER if st.get(s)) + f" | yeni: açılış {nw.get('app_open', 0)} bölüm1bitti {x.get('details', {}).get('level_done', {}).get('l1', 0)}")
        if x.get('details'): lines.append(f"{day} {g} ayrıntı: " + json.dumps(x['details'], ensure_ascii=False)[:600])
        if x.get('countries'): lines.append(f"{day} {g} ülke/sürüm: " + json.dumps(x['countries'])[:300] + ' | ' + json.dumps(x.get('versions', {}))[:300])
        if x.get('timing'): lines.append(f"{day} {g} süre: " + json.dumps(x['timing'])[:300])
for i in range(0, len(lines), 9):
    print('::notice title=huni ' + str(i // 9 + 1) + '::' + ' %0A'.join(l.replace('%', '%25') for l in lines[i:i + 9]))
if not lines: print('::notice title=huni::henüz sayaç yok')
