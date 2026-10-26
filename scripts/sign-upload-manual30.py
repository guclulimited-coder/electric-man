"""Re-sign the unchanged build30 archive with the dedicated EM CI identity.
No certificate/profile creation or revocation; credentials never enter logs/artifacts.
"""
import os,json,pathlib,base64,plistlib,subprocess,secrets,shutil,re,textwrap,hashlib
temp=pathlib.Path(os.environ['RUNNER_TEMP']);out=pathlib.Path('evidence/manual30');out.mkdir(parents=True,exist_ok=True)
report={'build':30,'app':'com.tusneldax.electricman','uploadSucceeded':False,'certificateOperations':False,'protectedHunterCertificate':'H3TYN7QW8J','credentialsPrinted':False}
stage='load-dedicated-identity'
def tool(args,**kw):
 r=subprocess.run(args,capture_output=True,**kw)
 if r.returncode:raise RuntimeError('tool-operation-failed')
 return r.stdout
try:
 b=json.loads(os.environ['EM_SIGNING_BUNDLE']);assert b['certificate_id']=='KZ6622463A';report['certificateId']=b['certificate_id'];report['profileId']=b['profile_id']
 p12=temp/'em30-identity.p12';fd=os.open(p12,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'wb') as f:f.write(base64.b64decode(b['p12']))
 stage='import-protected-ci-identity';kc=str(temp/'em30-signing.keychain-db');pw=secrets.token_urlsafe(32)
 for args in [['create-keychain','-p',pw,kc],['set-keychain-settings','-lut','7200',kc],['unlock-keychain','-p',pw,kc],['import',str(p12),'-P',b['password'],'-A','-t','cert','-f','pkcs12','-k',kc],['set-key-partition-list','-S','apple-tool:,apple:,codesign:','-s','-k',pw,kc],['list-keychains','-d','user','-s',kc,'login.keychain-db','/Library/Keychains/System.keychain']]:tool(['security']+args)
 payload=temp/'em30-payload';payload.mkdir();app=payload/'Payload/ElectricMan.app';app.parent.mkdir();shutil.copytree('build30/ElectricMan30.xcarchive/Products/Applications/ElectricMan.app',app,symlinks=True)
 info=plistlib.loads((app/'Info.plist').read_bytes());assert info['CFBundleIdentifier']==report['app'] and info['CFBundleVersion']=='30'
 profile=base64.b64decode(b['profile']);(app/'embedded.mobileprovision').write_bytes(profile)
 # Inspect public provisioning entitlements only; never extract certificates/keys.
 decoded=tool(['security','cms','-D','-i',str(app/'embedded.mobileprovision')]);details=plistlib.loads(decoded);allowed=details['Entitlements']
 assert allowed['application-identifier']=='YMAU5R6AA4.'+report['app'];assert allowed['com.apple.developer.applesignin']==['Default'];assert not allowed.get('get-task-allow',False)
 ent={k:allowed[k] for k in ['application-identifier','com.apple.developer.team-identifier','com.apple.developer.applesignin','beta-reports-active'] if k in allowed};ent['get-task-allow']=False
 entFile=temp/'em30-public-entitlements.plist';entFile.write_bytes(plistlib.dumps(ent))
 def requirement(identifier):
  # Pin the Apple Distribution marker, team and identifier; avoid a Unicode CN
  # dependency. This remains a real certificate-backed Apple signature.
  return '=designated => identifier "'+identifier+'" and anchor apple generic and certificate leaf[field.1.2.840.113635.100.6.1.4] exists and certificate leaf[subject.OU] = "YMAU5R6AA4"'
 stage='sign-nested-frameworks';frameworks=sorted((app/'Frameworks').glob('*.framework'))
 report['frameworkIds']=[]
 for framework in frameworks:
  ident=plistlib.loads((framework/'Info.plist').read_bytes())['CFBundleIdentifier'];report['frameworkIds'].append(ident)
  tool(['codesign','--force','--sign',b['certificate_sha1'],'--keychain',kc,'--identifier',ident,'--requirements',requirement(ident),'--generate-entitlement-der',str(framework)])
 stage='sign-electric-man';tool(['codesign','--force','--sign',b['certificate_sha1'],'--keychain',kc,'--identifier',report['app'],'--requirements',requirement(report['app']),'--entitlements',str(entFile),'--generate-entitlement-der',str(app)])
 stage='verify-signature-and-entitlements'
 tool(['codesign','--verify','--deep','--strict','--verbose=2','-R','=anchor apple generic and certificate leaf[field.1.2.840.113635.100.6.1.4] exists and certificate leaf[subject.OU] = "YMAU5R6AA4"',str(app)])
 actual=plistlib.loads(tool(['codesign','-d','--entitlements',':-',str(app)]));assert actual['com.apple.developer.applesignin']==['Default'];assert actual['application-identifier']=='YMAU5R6AA4.'+report['app']
 report['codesignVerified']=True;report['appleEntitlementVerified']=True
 stage='package-build30';ipa=(out/'ElectricMan-build30.ipa').resolve();tool(['zip','-qry',str(ipa),'Payload'],cwd=payload)
 report['ipaSHA256']=hashlib.sha256(ipa.read_bytes()).hexdigest();report['ipaBytes']=ipa.stat().st_size
 stage='approved-appstore-upload'
 folder=pathlib.Path.home()/'.appstoreconnect/private_keys';folder.mkdir(parents=True,exist_ok=True);key=folder/'AuthKey_AMWHRWY3U4.p8';raw=os.environ['ASC_PRIVATE_KEY'].replace('\\n','\n');body=re.sub(r'-----(BEGIN|END)[A-Z ]*-----|\s','',raw)
 fd=os.open(key,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'w') as f:f.write('-----BEGIN PRIVATE KEY-----\n'+'\n'.join(textwrap.wrap(body,64))+'\n-----END PRIVATE KEY-----\n')
 r=subprocess.run(['xcrun','altool','--upload-app','-f',str(ipa),'-t','ios','--apiKey','AMWHRWY3U4','--apiIssuer','cab75b07-a305-412b-a205-a91b4280d965','--output-format','json'],capture_output=True,text=True,timeout=240)
 report['uploadExitCode']=r.returncode;report['uploadSucceeded']=r.returncode==0
 try:
  data=json.loads(r.stdout);report['errors']=[{'code':e.get('code'),'message':e.get('message'),'reason':e.get('userInfo',{}).get('NSLocalizedFailureReason')} for e in data.get('product-errors',[])];report['successMessage']=data.get('success-message')
 except ValueError:report['machineOutputParsed']=False
except Exception as e:
 report['failedStage']=stage;report['error']=type(e).__name__ # Never print a command containing passwords.
finally:
 (out/'result.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
if not report['uploadSucceeded']:raise SystemExit(1)
