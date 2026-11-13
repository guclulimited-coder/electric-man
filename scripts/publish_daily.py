import os,json,base64,urllib.request,urllib.error,pathlib
root='https://api.github.com/repos/'+os.environ['GITHUB_REPOSITORY']
def api(p,method='GET',data=None):
 req=urllib.request.Request(root+p,method=method,headers={'Authorization':'Bearer '+os.environ['GH_TOKEN'],'Accept':'application/vnd.github+json'},data=None if data is None else json.dumps(data).encode())
 with urllib.request.urlopen(req) as r:return json.load(r)
try:api('/git/ref/heads/olcum-raporu')
except urllib.error.HTTPError as e:
 if e.code!=404:raise
 api('/git/refs','POST',{'ref':'refs/heads/olcum-raporu','sha':os.environ['GITHUB_SHA']})
for f in pathlib.Path('report-output').glob('*.md'):
 path='/contents/gunluk/'+f.name;body={'message':'Daily aggregate report '+f.stem,'branch':'olcum-raporu','content':base64.b64encode(f.read_bytes()).decode()}
 try:body['sha']=api(path+'?ref=olcum-raporu')['sha']
 except urllib.error.HTTPError as e:
  if e.code!=404:raise
 api(path,'PUT',body)
