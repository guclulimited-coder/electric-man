"""Upload the already verified IPA only; no build, signing or certificate changes."""
import os,pathlib,hashlib,re,textwrap,subprocess,json
p=pathlib.Path('approved-input/ElectricMan.ipa')
assert hashlib.sha256(p.read_bytes()).hexdigest()=='a55dd751618613ec6a0d49ffc20c9b9e9fd856027d99e0c31817bc27e938f3d9'
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
  report['errors']=[{'code':e.get('code'),'message':e.get('message')} for e in data.get('product-errors',[])];report['successMessage']=data.get('success-message')
 except ValueError:report['machineOutputParsed']=False
except subprocess.TimeoutExpired:report['uploadSucceeded']=False;report['error']='upload-timeout-check-ASC-before-retrying'
out=pathlib.Path('evidence/upload30');out.mkdir(parents=True,exist_ok=True);(out/'result.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
if not report.get('uploadSucceeded'):raise SystemExit(1)
