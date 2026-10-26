"""Reproduce the approved host-scoped Worker; never deploy or access credentials.
Usage: python scripts/make-production-apple30.py BASELINE_WORKER OUTPUT_WORKER
Keep every non-Worker asset byte-identical to the captured production deployment.
"""
import pathlib,sys,hashlib
baseline=pathlib.Path(sys.argv[1]).read_text(encoding='utf-8')
patch=pathlib.Path('public/_worker.js').read_text(encoding='utf-8')
assert baseline.count('export default {')==1
assert patch.rfind('export default {')>0
patch=patch[:patch.rfind('export default {')].replace('export ','')
worker=baseline.replace('export default {','const originalWorker = {')+'\nconst apple30 = (()=>{\n'+patch+'\nreturn {emAPI};})();\nexport default {fetch(request,env,ctx){const u=new URL(request.url); if(u.hostname==="electricman.tusneldax.com" && ["/api/em/native/apple/nonce","/api/em/native/apple","/api/em/auth/apple/start","/api/em/auth/apple/callback"].includes(u.pathname)) return apple30.emAPI(request,env); return originalWorker.fetch(request,env,ctx);}};\n'
pathlib.Path(sys.argv[2]).write_text(worker,encoding='utf-8')
print('Worker SHA256:',hashlib.sha256(pathlib.Path(sys.argv[2]).read_bytes()).hexdigest())
