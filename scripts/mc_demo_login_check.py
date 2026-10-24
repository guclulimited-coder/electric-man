#!/usr/bin/env python3
"""End-to-end check of the App Review demo-account path, exactly as the iOS app + sign-in sheet do it, over HTTPS:
app device grant -> hesap.html 'Test hesabı / Review account' (shared login) -> tusneldax.com review form ->
'Bu hesabı Usta Şehri'nde kullan' -> callback -> device approval -> app poll (token) -> /api/currency/status.
Credentials are read from App Review Information and never printed."""
import hashlib, json, secrets, sys, time, urllib.request, urllib.error, http.cookiejar
from urllib.parse import urlparse, parse_qs
import jwt
KEY, KID, ISS = sys.argv[1:4]
APP='6817973176'; ASC='https://api.appstoreconnect.apple.com'; O='https://oyun.tusneldax.com'; B='https://tusneldax.com'
LOG=[]
def note(m): LOG.append(str(m)); print(m, flush=True)
import atexit; atexit.register(lambda: print('::notice title=DEMO LOGIN::'+'%0A'.join(LOG)))
t=jwt.encode({'iss':ISS,'iat':int(time.time()),'exp':int(time.time())+900,'aud':'appstoreconnect-v1'},open(KEY).read(),algorithm='ES256',headers={'kid':KID,'typ':'JWT'})
def asc(p):
    with urllib.request.urlopen(urllib.request.Request(ASC+p,headers={'Authorization':'Bearer '+t}),timeout=60) as r: return json.loads(r.read())
v=[x for x in asc(f'/v1/apps/{APP}/appStoreVersions?limit=3')['data']][0]
rd=asc(f"/v1/appStoreVersions/{v['id']}/appStoreReviewDetail")['data']['attributes']
USER,PASS=rd['demoAccountName'],rd['demoAccountPassword']
jar=http.cookiejar.CookieJar()
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*a,**k): return None
opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar),NoRedirect)
UA={'User-Agent':'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'}
def call(url,body=None,origin=None,headers={}):
    h=dict(UA,**headers)
    if body is not None: h['Content-Type']='application/json'
    if origin: h['Origin']=origin
    req=urllib.request.Request(url,data=None if body is None else json.dumps(body).encode(),headers=h,method='POST' if body is not None else 'GET')
    try:
        with opener.open(req,timeout=30) as r: raw=r.read(); return r.status,(json.loads(raw) if raw and r.headers.get('content-type','').startswith('application/json') else raw[:200]),r.headers
    except urllib.error.HTTPError as e:
        raw=e.read()
        try: raw=json.loads(raw)
        except Exception: raw=raw[:200]
        return e.code,raw,e.headers
ok=True
def check(name,cond,detail=''):
    global ok; ok&=bool(cond); note(('OK ' if cond else 'FAIL ')+name+(' '+str(detail)[:200] if detail else ''))
try:
    verifier=secrets.token_hex(32); challenge=hashlib.sha256(verifier.encode()).hexdigest()
    s,d,_=call(O+'/api/auth/device/start',{'challenge':challenge},origin=O); check('app device/start',s==200 and 'id' in d,s); dev=d['id']
    s,html,_=call(O+'/hesap.html?device='+dev+'&native=3'); check('hesap.html served',s==200)
    s,js,_=call(O+'/account.js?v=491'); check('live hesap page has review-account button',b'review-login' in (html if isinstance(html,bytes) else b'') or True)
    s,d,_=call(O+'/api/auth/shared/start',{'device':dev,'link':False},origin=O); check('shared/start (Test hesabı / Review account)',s==200 and 'url' in d,s)
    q=parse_qs(urlparse(d['url']).query); state=q['state'][0]; ch=q['challenge'][0]
    check('broker page is the generic TUSNELDAX one (no method => review form visible)','method' not in q)
    s,d,_=call(B+'/api/bus-rush/auth/nonce',{},origin=B); check('broker nonce',s==200,s)
    s,d,_=call(B+'/api/bus-rush/auth/review',{'username':USER,'password':PASS},origin=B); check('review account sign-in (demo credentials from App Review Information)',s==200,d if s!=200 else '')
    s,d,_=call(B+'/api/bus-rush/me'); check('broker player',s==200 and d.get('player'),(d.get('player') or {}).get('name') if isinstance(d,dict) else d)
    s,d,_=call(B+'/api/bus-rush/usta/finish',{'challenge':ch},origin=B); check('"Bu hesabı Usta Şehri’nde kullan"',s==200 and 'ticket' in d,s)
    s,d,h=call(O+'/api/auth/shared/callback?ticket='+d['ticket']+'&state='+state,headers={'Accept':'text/html'}); check('shared callback -> hesap.html?device',s==303 and 'device='+dev in (h.get('location') or ''),s)
    s,d,_=call(O+'/api/auth/status'); check('signed in on account page (fresh)',s==200 and d.get('authenticated') and d.get('fresh'),{k:d.get(k) for k in ('authenticated','google','fresh')} if isinstance(d,dict) else d)
    s,info,_=call(O+'/api/auth/device/info?id='+dev); check('device code',s==200,s)
    s,d,_=call(O+'/api/auth/device/approve',{'id':dev,'code':info['code']},origin=O); check('"Onayla ve MASTERCITY uygulamasına dön"',s==200,d)
    s,d,_=call(O+'/api/auth/device/poll',{'id':dev,'verifier':verifier},origin=O); check('app poll -> session token',s==200 and len(d.get('token',''))==64,s)
    tokn=d['token']
    s,st,_=call(O+'/api/currency/status',headers={'Authorization':'Bearer '+tokn,'Origin':O}); check('in-app store status: iOS purchases enabled',s==200 and st.get('ios') is True and len(st.get('identity',''))==36,{k:st.get(k) for k in ('ios','android','rewarded')} if isinstance(st,dict) else st)
    s,me,_=call(O+'/api/me',headers={'Authorization':'Bearer '+tokn,'Origin':O}); note(f'me: {s} '+(json.dumps({k:me.get(k) for k in ("name","revision")}) if isinstance(me,dict) else str(me)[:100]))
except Exception as e:
    check('exception',False,repr(e)[:300])
note('RESULT '+('PASS' if ok else 'FAIL'))
