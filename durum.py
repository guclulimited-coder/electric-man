import json,os,re,textwrap,time,urllib.request,jwt
raw=os.environ['K'].replace('\\n','\n');body=re.sub(r'[^A-Za-z0-9+/=]','',re.sub(r'-----(BEGIN|END)[A-Z ]*-----','',raw))
K='-----BEGIN PRIVATE KEY-----\n'+'\n'.join(textwrap.wrap(body,64))+'\n-----END PRIVATE KEY-----\n'
now=int(time.time())
t=jwt.encode({'iss':os.environ['ISS'],'iat':now,'exp':now+900,'aud':'appstoreconnect-v1'},K,algorithm='ES256',headers={'kid':os.environ['KID'],'typ':'JWT'})
def g(p): return json.load(urllib.request.urlopen(urllib.request.Request('https://api.appstoreconnect.apple.com'+p,headers={'Authorization':'Bearer '+t}),timeout=60))
for b in ['com.tusneldax.electricman','com.tusneldax.electrichunter']:
    a=g(f'/v1/apps?filter[bundleId]={b}')['data']
    for x in a:
        v=g(f"/v1/apps/{x['id']}/appStoreVersions?filter[platform]=IOS&limit=5")['data']
        for y in v:
            s=y['attributes']; print('ASC',b,s.get('versionString'),s.get('appStoreState'),s.get('appVersionState'),s.get('releaseType'),s.get('createdDate'))
