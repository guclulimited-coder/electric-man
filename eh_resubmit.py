import jwt,time,requests,os,sys,json
KEY=open(sys.argv[1]).read();KID=os.environ['KEY_ID'];ISS=os.environ['ISSUER']
def tok(): return jwt.encode({'iss':ISS,'iat':int(time.time()),'exp':int(time.time())+1100,'aud':'appstoreconnect-v1'},KEY,algorithm='ES256',headers={'kid':KID})
def api(m,p,b=None):
    r=requests.request(m,'https://api.appstoreconnect.apple.com'+p,headers={'Authorization':'Bearer '+tok(),'Content-Type':'application/json'},json=b,timeout=60)
    if r.status_code>=300: print('HATA',m,p,r.status_code,r.text[:800]); return None
    return r.json() if r.text else {}
app=api('GET','/v1/apps?filter[bundleId]=com.tusneldax.electrichunter')['data'][0];aid=app['id']
vs=api('GET',f'/v1/apps/{aid}/appStoreVersions?filter[platform]=IOS&limit=5')['data']
for v in vs: print('SURUM',v['id'],v['attributes']['versionString'],v['attributes']['appStoreState'])
v=vs[0];vid=v['id']
cur=api('GET',f'/v1/appStoreVersions/{vid}/build')
print('SECILI_DERLEME',(cur or {}).get('data') and cur['data']['attributes']['version'])
bs=api('GET',f'/v1/builds?filter[app]={aid}&sort=-uploadedDate&limit=10')['data']
for b in bs: print('DERLEME',b['attributes']['version'],b['attributes']['processingState'],b['attributes'].get('expired'))
b43=[b for b in bs if b['attributes']['version']=='43' and b['attributes']['processingState']=='VALID']
subs=api('GET',f'/v1/reviewSubmissions?filter[app]={aid}&limit=10')['data']
for s in subs: print('INCELEME',s['id'],s['attributes']['state'],s['attributes'].get('submittedDate'))
if os.environ.get('DO')!='1' or not b43: print('KURU_CALISMA_BITTI'); sys.exit(0)
if v['attributes']['appStoreState'] in ('WAITING_FOR_REVIEW','IN_REVIEW','READY_FOR_SALE','PENDING_DEVELOPER_RELEASE'): print('ZATEN_INCELEMEDE_VEYA_YAYINDA'); sys.exit(0)
api('PATCH',f'/v1/appStoreVersions/{vid}/relationships/build',{'data':{'type':'builds','id':b43[0]['id']}})
open_=[s for s in subs if s['attributes']['state'] in ('UNRESOLVED_ISSUES','READY_FOR_REVIEW')]
if open_: sid=open_[0]['id']
else:
    sid=api('POST','/v1/reviewSubmissions',{'data':{'type':'reviewSubmissions','attributes':{'platform':'IOS'},'relationships':{'app':{'data':{'type':'apps','id':aid}}}}})['data']['id']
    api('POST','/v1/reviewSubmissionItems',{'data':{'type':'reviewSubmissionItems','relationships':{'reviewSubmission':{'data':{'type':'reviewSubmissions','id':sid}},'appStoreVersion':{'data':{'type':'appStoreVersions','id':vid}}}}})
r=api('PATCH',f'/v1/reviewSubmissions/{sid}',{'data':{'type':'reviewSubmissions','id':sid,'attributes':{'submitted':True}}})
print('GONDERIM',r and r['data']['attributes']['state'])
v2=api('GET',f'/v1/appStoreVersions/{vid}')['data']['attributes']['appStoreState'];print('YENI_DURUM',v2)
