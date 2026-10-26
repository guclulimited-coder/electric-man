# Export the existing archive only. No upload, no explicit certificate operations.
# The existing CI secret goes directly to Xcode through an ephemeral protected
# credential file; its contents are never read back, printed, or archived.
import os, pathlib, plistlib, subprocess, json, re, textwrap
temp=pathlib.Path(os.environ['RUNNER_TEMP'])
out=pathlib.Path('evidence/sign30');out.mkdir(parents=True,exist_ok=True)
report={'build':30,'version':'1.0.0','storeUpload':False,'certificateRevocation':False,'keyContentsInspected':False,'credentialFile':'ephemeral CI file, Xcode only, excluded from artifact'}
raw=os.environ['ASC_PRIVATE_KEY'].replace('\\n','\n')
body=re.sub(r'-----(BEGIN|END)[A-Z ]*-----|\s','',raw)
key=temp/'em-export30-auth.p8'
fd=os.open(key,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as f:f.write('-----BEGIN PRIVATE KEY-----\n'+'\n'.join(textwrap.wrap(body,64))+'\n-----END PRIVATE KEY-----\n')
options=temp/'Export30.plist'
options.write_bytes(plistlib.dumps({'method':'app-store-connect','destination':'export','signingStyle':'automatic','teamID':'YMAU5R6AA4','manageAppVersionAndBuildNumber':False,'uploadSymbols':False}))
# An unsigned archive has no embedded requested entitlements. Seed them using
# ad-hoc signing; the export then replaces that signature with distribution
# signing. Without this, Xcode silently drops Sign in with Apple on export.
entitlements=temp/'Apple30.entitlements'
entitlements.write_bytes(plistlib.dumps({'com.apple.developer.applesignin':['Default'],'application-identifier':'YMAU5R6AA4.com.tusneldax.electricman','com.apple.developer.team-identifier':'YMAU5R6AA4','get-task-allow':False}))
app='build30/ElectricMan30.xcarchive/Products/Applications/ElectricMan.app'
subprocess.run(['codesign','--force','--sign','-','--entitlements',str(entitlements),'--generate-entitlement-der',app],check=True,capture_output=True)
cmd=['xcodebuild','-exportArchive','-archivePath','build30/ElectricMan30.xcarchive','-exportPath',str(out),'-exportOptionsPlist',str(options),'-allowProvisioningUpdates','-authenticationKeyPath',str(key),'-authenticationKeyID','AMWHRWY3U4','-authenticationKeyIssuerID','cab75b07-a305-412b-a205-a91b4280d965']
try:
 r=subprocess.run(cmd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=240)
 # Keep only generic result/error categories; raw export logs can contain
 # provisioning payloads and are deliberately not uploaded.
 report['exportExitCode']=r.returncode
 report['diagnostics']=[line.strip()[:400] for line in r.stdout.splitlines() if any(x in line for x in ['error: exportArchive','EXPORT SUCCEEDED','EXPORT FAILED'])][:15]
 ipas=list(out.glob('*.ipa'));report['signedIPAReady']=r.returncode==0 and bool(ipas)
 if report['signedIPAReady']:
  import zipfile,hashlib
  ipa=ipas[0]
  with zipfile.ZipFile(ipa) as z:
   meta=plistlib.loads(z.read('Payload/ElectricMan.app/Info.plist'))
   assert meta['CFBundleVersion']=='30' and meta['CFBundleIdentifier']=='com.tusneldax.electricman'
   assert any(n.endswith('/_CodeSignature/CodeResources') for n in z.namelist())
   verify=temp/'verify30';z.extractall(verify)
  signed_app=str(verify/'Payload/ElectricMan.app')
  subprocess.run(['codesign','--verify','--deep','--strict',signed_app],check=True,capture_output=True)
  actual=plistlib.loads(subprocess.check_output(['codesign','-d','--entitlements',':-',signed_app],stderr=subprocess.DEVNULL))
  assert actual.get('com.apple.developer.applesignin')==['Default']
  assert actual.get('application-identifier')=='YMAU5R6AA4.com.tusneldax.electricman'
  assert actual.get('get-task-allow',False)==False
  report['codesignVerified']=True;report['appleEntitlementVerified']=True
  report['ipaSHA256']=hashlib.sha256(ipa.read_bytes()).hexdigest()
  report['ipaBytes']=ipa.stat().st_size
except subprocess.TimeoutExpired:
 report['signedIPAReady']=False;report['error']='export-timeout'
except Exception as e:
 report['signedIPAReady']=False;report['error']=type(e).__name__
finally:
 (out/'result.json').write_text(json.dumps(report,indent=2)+'\n')
 print(json.dumps(report))
if not report.get('signedIPAReady'):raise SystemExit(1)
