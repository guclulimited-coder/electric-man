"""Upload the already verified IPA only; no build, signing or certificate changes."""
import os,pathlib,hashlib,re,textwrap,subprocess,json
p=pathlib.Path('approved-input/ElectricMan.ipa')
assert hashlib.sha256(p.read_bytes()).hexdigest()=='a55dd751618613ec6a0d49ffc20c9b9e9fd856027d99e0c31817bc27e938f3d9'
if os.environ.get('DIAG_ONLY')=='true':
 import zipfile,plistlib,tempfile
 target=pathlib.Path(tempfile.mkdtemp(prefix='em-signature-check-'))
 with zipfile.ZipFile(p) as z:z.extractall(target)
 app=target/'Payload/ElectricMan.app';results=[]
 for name in ['ElectricMan.app','ElectricMan.app/Frameworks/GoogleMobileAds.framework','ElectricMan.app/Frameworks/UserMessagingPlatform.framework']:
  path=target/'Payload'/name
  row={'component':name}
  for label,requirement in [('appleAnchor','anchor apple generic'),('distribution','anchor apple generic and certificate leaf[field.1.2.840.113635.100.6.1.4] exists')]:
   r=subprocess.run(['codesign','--verify','--deep','--strict','-R','='+requirement,str(path)],capture_output=True,text=True);row[label]={'exitCode':r.returncode,'diagnostic':r.stderr.strip()[:1500]}
  r=subprocess.run(['codesign','-d','-r-',str(path)],capture_output=True,text=True);row['designatedRequirement']=r.stdout.strip()[:1500]
  results.append(row)
 info=plistlib.loads(subprocess.check_output(['security','cms','-D','-i',str(app/'embedded.mobileprovision')],stderr=subprocess.DEVNULL))
 profile={'name':info.get('Name'),'uuid':info.get('UUID'),'team':info.get('TeamIdentifier'),'appleEntitlement':info.get('Entitlements',{}).get('com.apple.developer.applesignin'),'applicationIdentifier':info.get('Entitlements',{}).get('application-identifier'),'expiration':str(info.get('ExpirationDate')),'certSerials':[]}
 for cert in info.get('DeveloperCertificates',[]):
  r=subprocess.run(['openssl','x509','-inform','DER','-noout','-serial'],input=cert,capture_output=True);profile['certSerials'].append(r.stdout.decode().strip())
 out=pathlib.Path('evidence/upload30');out.mkdir(parents=True,exist_ok=True);report={'diagnoseOnly':True,'components':results,'profile':profile};(out/'result.json').write_text(json.dumps(report,indent=2));print(json.dumps(report));raise SystemExit(0)
folder=pathlib.Path.home()/'.appstoreconnect/private_keys';folder.mkdir(parents=True,exist_ok=True)
key=folder/'AuthKey_AMWHRWY3U4.p8'
body=re.sub(r'-----(BEGIN|END)[A-Z ]*-----|\s','',os.environ['ASC_PRIVATE_KEY'].replace('\\n','\n'))
fd=os.open(key,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:f.write('-----BEGIN PRIVATE KEY-----\n'+'\n'.join(textwrap.wrap(body,64))+'\n-----END PRIVATE KEY-----\n')
report={'scope':'Electric Man existing build 30 only','ipaHashVerified':True,'keysInspected':False,'certificateOperations':False}
try:
 r=subprocess.run(['xcrun','altool','--upload-app','-f',str(p),'-t','ios','--apiKey','AMWHRWY3U4','--apiIssuer','cab75b07-a305-412b-a205-a91b4280d965','--output-format','json'],capture_output=True,text=True,timeout=240)
 report['exitCode']=r.returncode;report['uploadSucceeded']=r.returncode==0
 try:
  data=json.loads(r.stdout)
  report['errors']=[{'code':e.get('code'),'message':e.get('message'),'reason':e.get('userInfo',{}).get('NSLocalizedFailureReason'),'description':e.get('userInfo',{}).get('NSLocalizedDescription')} for e in data.get('product-errors',[])];report['successMessage']=data.get('success-message')
 except ValueError:report['machineOutputParsed']=False
except subprocess.TimeoutExpired:report['uploadSucceeded']=False;report['error']='upload-timeout-check-ASC-before-retrying'
out=pathlib.Path('evidence/upload30');out.mkdir(parents=True,exist_ok=True);(out/'result.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
if not report.get('uploadSucceeded'):raise SystemExit(1)
