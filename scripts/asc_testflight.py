#!/usr/bin/env python3
"""MASTERCITY derleme 31'i TestFlight iç + dış test gruplarına ekler, dış test incelemesine gönderir (canlı web 633)."""
import json, sys, time, urllib.request, urllib.error
import jwt
KEY, KID, ISS = sys.argv[1:4]
APP='6817973176'; BUILD='38'; GROUPS=['e1897fb0-9574-48e3-ba4e-6787c660fa5f','caf9413a-ca85-4f9e-b55a-adf29b7834fa']
BASE='https://api.appstoreconnect.apple.com'; LOG=[]
def note(m): LOG.append(str(m)); print(m, flush=True)
import atexit; atexit.register(lambda: print('::notice title=TestFlight::'+'%0A'.join(LOG)))
_t=[None,0]
def tok():
    if time.time()-_t[1]>600:
        n=int(time.time()); _t[0]=jwt.encode({'iss':ISS,'iat':n,'exp':n+1100,'aud':'appstoreconnect-v1'},open(KEY).read(),algorithm='ES256',headers={'kid':KID,'typ':'JWT'}); _t[1]=time.time()
    return _t[0]
def api(method,path,body=None):
    req=urllib.request.Request(BASE+path,method=method,data=None if body is None else json.dumps(body).encode(),headers={'Authorization':'Bearer '+tok(),'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=60) as r:
            raw=r.read(); return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'{method} {path.split("?")[0]} -> {e.code} {e.read().decode(errors="replace")[:800]}')
b=None
for x in api('GET',f'/v1/builds?filter[app]={APP}&sort=-uploadedDate&limit=5&fields[builds]=version,processingState,uploadedDate')['data']: note('son: '+str(x['attributes']))
for i in range(80):
    bs=api('GET',f'/v1/builds?filter[app]={APP}&filter[version]={BUILD}&limit=3')['data']
    if bs and bs[0]['attributes']['processingState']=='VALID': b=bs[0]; break
    note(f'bekleniyor: {[x["attributes"]["processingState"] for x in bs]}') if i%8==0 else None
    time.sleep(30)
if not b: note('DERLEME HENÜZ HAZIR DEĞİL'); sys.exit(1)
if b['attributes'].get('usesNonExemptEncryption') is None:
    api('PATCH',f"/v1/builds/{b['id']}",{'data':{'type':'builds','id':b['id'],'attributes':{'usesNonExemptEncryption':False}}})
for g in GROUPS:
    try: api('POST',f'/v1/betaGroups/{g}/relationships/builds',{'data':[{'type':'builds','id':b['id']}]}); note('gruba eklendi '+g[:8])
    except RuntimeError as e: note('grup '+g[:8]+': '+str(e)[:300])
try:
    api('POST','/v1/betaAppReviewSubmissions',{'data':{'type':'betaAppReviewSubmissions','relationships':{'build':{'data':{'type':'builds','id':b['id']}}}}}); note('dış test incelemesine gönderildi')
except RuntimeError as e: note('dış inceleme: '+str(e)[:400])
d=api('GET',f"/v1/builds/{b['id']}/buildBetaDetail")['data']['attributes']; note(f"iç={d.get('internalBuildState')} dış={d.get('externalBuildState')}")
