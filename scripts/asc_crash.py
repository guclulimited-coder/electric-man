#!/usr/bin/env python3
"""Read-only: TestFlight crash feedback for MASTERCITY (betaFeedbackCrashSubmissions) + crash logs."""
import json, sys, time, urllib.request, urllib.error
import jwt
KEY, KID, ISS = sys.argv[1:4]
APP = '6817973176'
BASE = 'https://api.appstoreconnect.apple.com'
tok = jwt.encode({'iss': ISS, 'iat': int(time.time()), 'exp': int(time.time()) + 1100, 'aud': 'appstoreconnect-v1'}, open(KEY).read(), algorithm='ES256', headers={'kid': KID, 'typ': 'JWT'})
def api(path):
    req = urllib.request.Request(BASE + path, headers={'Authorization': 'Bearer ' + tok})
    try:
        with urllib.request.urlopen(req, timeout=60) as r: return json.loads(r.read())
    except urllib.error.HTTPError as e: return {'error': f'{e.code} {e.read().decode(errors="replace")[:300]}'}
out = []
r = api(f'/v1/apps/{APP}/betaFeedbackCrashSubmissions?limit=10&sort=-createdDate')
if 'error' in r: out.append('crashSubmissions ' + r['error'])
for s in r.get('data', []):
    A = s['attributes']
    out.append(f"crash {A.get('createdDate','')[:16]} build={A.get('buildBundleId','')} device={A.get('deviceModel')} os={A.get('osVersion')} mem={A.get('deviceFreeMemory') or ''} batt={A.get('batteryPercentage')} comment={str(A.get('comment'))[:120]}")
    log = api(f"/v1/betaFeedbackCrashSubmissions/{s['id']}/crashLog")
    if 'error' in log: out.append('  log ' + log['error'][:150]); continue
    txt = (log.get('data') or {}).get('attributes', {}).get('logText') or ''
    lines = [l for l in txt.splitlines() if any(k in l for k in ('Exception Type','Termination','Exception Codes','Triggered by Thread','jetsam','memory','Crashed:','EXC_','reason'))]
    out.extend('  ' + l.strip()[:200] for l in lines[:14])
    th = txt.split('Crashed:')
    if len(th) > 1: out.extend('  | ' + l.strip()[:160] for l in th[1].splitlines()[1:12])
r = api(f'/v1/apps/{APP}/betaFeedbackScreenshotSubmissions?limit=5&sort=-createdDate')
for s in r.get('data', []):
    A = s['attributes']; out.append(f"feedback {A.get('createdDate','')[:16]} {A.get('deviceModel')} comment={str(A.get('comment'))[:160]}")
if 'error' in r: out.append('screenshotSubmissions ' + r['error'])
print('::notice title=CRASH::' + '%0A'.join(out or ['kayıt yok']))
