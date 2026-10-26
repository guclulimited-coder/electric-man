"""20:40 approval: replace ONLY 3S37L2JAP7 after cross-project usage gates.
Private material exists in RAM only; artifact contains GitHub-sealed ciphertext.
No shared certificate, Hunter state branch, or other app profile is modified.
"""
import os,json,pathlib,base64,time,secrets,datetime,urllib.request,urllib.error
import jwt,re,textwrap
from cryptography import x509
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID
from nacl.public import PublicKey,SealedBox
proof=json.loads(pathlib.Path('docs/CERTIFICATE30-PRECHECK.json').read_text())
out=pathlib.Path('evidence/cert30');out.mkdir(parents=True,exist_ok=True)
report={'oldId':'3S37L2JAP7','protectedId':'H3TYN7QW8J','oldRevoked':False,'newCreated':False,'otherCertificatesModified':False,'privateKeyFilesWritten':False,'plaintextSecretArtifact':False}
raw=os.environ['ASC_PRIVATE_KEY'].replace('\\n','\n')
body=re.sub(r'-----(BEGIN|END)[A-Z ]*-----|\s','',raw)
raw='-----BEGIN PRIVATE KEY-----\n'+'\n'.join(textwrap.wrap(body,64))+'\n-----END PRIVATE KEY-----\n'
def api(method,path,data=None):
 now=int(time.time());token=jwt.encode({'iss':'cab75b07-a305-412b-a205-a91b4280d965','iat':now,'exp':now+180,'aud':'appstoreconnect-v1'},raw,algorithm='ES256',headers={'kid':'AMWHRWY3U4'})
 req=urllib.request.Request('https://api.appstoreconnect.apple.com/v1/'+path,method=method,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},data=json.dumps(data).encode() if data else None)
 try:
  with urllib.request.urlopen(req,timeout=30) as r:return json.load(r) if r.status!=204 else {}
 except urllib.error.HTTPError as e:
  report['apiFailure']={'method':method,'path':path,'status':e.code};raise RuntimeError('apple-api-operation-failed') from None
def inventory():return api('GET','certificates?filter[certificateType]=DISTRIBUTION,IOS_DISTRIBUTION&limit=100')['data']
def seal(bundle):
 public=proof['githubPublicKey'];box=SealedBox(PublicKey(base64.b64decode(public['key'])))
 payload={'key_id':public['key_id'],'encrypted_value':base64.b64encode(box.encrypt(json.dumps(bundle).encode())).decode()}
 (out/'prepared-secret.json').write_text(json.dumps(payload))
try:
 assert proof['oldCertificateId']==report['oldId']!=report['protectedId']
 assert len(proof['otherSecretAudits'])==2 and all(a['targetMatch'] is False for a in proof['otherSecretAudits'])
 assert proof['mastercityProfile']['target3S37Used'] is False
 report['busRushProfiles']=[]
 for pid in proof['busRushProfilesToCheckLive']:
  certs=api('GET','profiles/'+pid+'/certificates')['data']
  serials=[c['attributes']['serialNumber'].upper().lstrip('0') for c in certs]
  used=proof['oldSerial'] in serials
  report['busRushProfiles'].append({'id':pid,'oldCertificateUsed':used,'certificateIds':[c['id'] for c in certs]})
  if used:raise RuntimeError('STOP-old-certificate-used-by-Bus-Rush-profile')
 # Re-read Hunter's actual immutable state record in its own repository.
 req=urllib.request.Request('https://api.github.com/repos/guclulimited-coder/electric-man/contents/eh-ios-cert.txt?ref=eh-ios-cert',headers={'Authorization':'Bearer '+os.environ['GH_READ_TOKEN'],'Accept':'application/vnd.github+json'})
 with urllib.request.urlopen(req,timeout=20) as r:record=json.load(r)
 hunter=base64.b64decode(record['content']).decode().strip();assert hunter==report['protectedId'];report['hunterRecordVerified']=True
 before=inventory();ids={c['id'] for c in before};assert report['protectedId'] in ids
 old=next(c for c in before if c['id']==report['oldId']);assert old['attributes']['serialNumber'].upper().lstrip('0')==proof['oldSerial'];assert old['attributes']['certificateType']=='DISTRIBUTION'
 # Build and validate all cryptographic inputs before the approved revocation.
 private=rsa.generate_private_key(public_exponent=65537,key_size=2048)
 csr=x509.CertificateSigningRequestBuilder().subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,'Electric Man Build30 CI')])).sign(private,hashes.SHA256()).public_bytes(serialization.Encoding.DER)
 csr=base64.b64encode(csr).decode()
 report['usageGatesPassed']=True
 api('DELETE','certificates/'+report['oldId']);report['oldRevoked']=True
 current=inventory();assert report['oldId'] not in {c['id'] for c in current};assert report['protectedId'] in {c['id'] for c in current}
 created=api('POST','certificates',{'data':{'type':'certificates','attributes':{'certificateType':'DISTRIBUTION','csrContent':csr}}})['data'];report['newCreated']=True;report['newId']=created['id']
 cert=x509.load_der_x509_certificate(base64.b64decode(created['attributes']['certificateContent']))
 password=secrets.token_urlsafe(32)
 p12=pkcs12.serialize_key_and_certificates(b'Electric Man Build30',private,cert,None,serialization.BestAvailableEncryption(password.encode()))
 bundle={'p12':base64.b64encode(p12).decode(),'password':password,'certificate_id':created['id'],'certificate_sha1':cert.fingerprint(hashes.SHA1()).hex().upper()}
 seal(bundle) # Recoverable encrypted identity even if profile creation fails.
 profile=api('POST','profiles',{'data':{'type':'profiles','attributes':{'name':'Electric Man Build30 '+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d%H%M%S'),'profileType':'IOS_APP_STORE'},'relationships':{'bundleId':{'data':{'type':'bundleIds','id':'DQQ5B4RP2Z'}},'certificates':{'data':[{'type':'certificates','id':created['id']}]}}}})['data']
 bundle['profile']=profile['attributes']['profileContent'];bundle['profile_name']=profile['attributes']['name'];bundle['profile_id']=profile['id'];seal(bundle)
 report['profileId']=profile['id'];report['profileName']=profile['attributes']['name'];report['secretName']='EM_IOS_SIGNING_BUNDLE';report['encryptedSecretPrepared']=True
 after={c['id'] for c in inventory()};assert ids-{report['oldId']}<=after;assert report['protectedId'] in after
 report['protectedCertificateStillPresent']=True;report['passed']=True
except Exception as e:
 report['passed']=False;report['error']=str(e) if isinstance(e,(RuntimeError,AssertionError)) else type(e).__name__;raise SystemExit(1)
finally:
 (out/'receipt.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
