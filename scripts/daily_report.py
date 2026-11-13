"""GET-only aggregate reader; no raw responses or identifiers are persisted."""
import os,json,datetime,pathlib,urllib.request,sys
def read(url,key,header):
 if not key: raise RuntimeError('Missing read secret')
 with urllib.request.urlopen(urllib.request.Request(url,headers={header:key,'User-Agent':'Tusneldax-Daily/1.0'}),timeout=45) as r:return json.load(r)
def render(data,mode,day):
 if not isinstance(data.get('days'),dict):raise ValueError('Invalid stats schema')
 names={'br':'Bus Rush','em':'Electric Man','eh':'Electric Hunter','mc':'MASTERCITY'}
 games=['br'] if mode=='br' else ['em','eh'] if mode=='em' else ['mc']
 lines=[f'# Günlük ölçüm — {day}', '', 'Dönem: önceki UTC günü (00:00–24:00 UTC / 03:00–03:00 Türkiye). Çalışma: 07:00 Türkiye.', 'Sayılar olay sayaçlarıdır; tekil kişi veya mağaza kurulum sayısı değildir.', '', '| Oyun | Grup | Açılış | İlk görüntü | 1. bölüm başlama | 1. bölüm bitirme | 1. gün dönüşü |','|---|---|---:|---:|---:|---:|---:|']
 present=data['days'].get(day)
 def n(o,k):
  v=o.get(k,0);assert isinstance(v,(int,float)) and v>=0;return str(int(v))
 for g in games:
  x=(present or {}) if mode=='mc' else (present or {}).get(g,{})
  st=x.get('stages',{});nw=x.get('newInstalls',{})
  if mode=='mc':
   sums={}
   for v in nw.values():
    for k,c in v.items():sums[k]=sums.get(k,0)+c
   nw=sums
  if g!=games[0]:lines.extend(['| Oyun | Grup | Açılış | İlk görüntü | 1. bölüm başlama | 1. bölüm bitirme | 1. gün dönüşü |','|---|---|---:|---:|---:|---:|---:|'])
  for label,values in [('Tümü',st),('Yeni kurulum',nw)]:
   l1=[n(x.get('details',{}).get(s,{}),'l1') for s in ['level_start','level_done']] if mode!='mc' and label=='Tümü' else ['ölçülmüyor']*2
   row=[n(values,'app_open'),n(values,'first_paint'),*l1,n(values,'d1_return') if mode!='mc' else 'ölçülmüyor']
   if not x:row=['veri yok']*5
   lines.append('| '+' | '.join([names[g],label,*row])+' |')
  lines+=['',f'## {names[g]} platform dağılımı','', '| Platform | Açılış | İlk görüntü |','|---|---:|---:|']
  allowed=['android-app','ios-app','web-mobile','web-desktop','other','unknown']
  for p,v in sorted(x.get('byPlatform',{}).items()):
   if p not in allowed:p='diğer'
   lines.append(f'| {p} | {n(v,"app_open")} | {n(v,"first_paint")} |')
  if not x:lines.append('| veri yok | — | — |')
  if mode=='mc':lines+=['',f'Oyuna başlama: {n(st,"game_start")}; dünya hazır: {n(st,"world_ready")}.']
  lines+=['']
 lines+=['Yeni kurulumun 1. bölüm ayrımı API tarafından sunulmuyor. MASTERCITY bölüm ve 1. gün dönüşü ölçmüyor. Eksik gün sıfır kullanım olarak yorumlanmamalı.']
 return '\n'.join(lines)+'\n'
if __name__=='__main__':
 mode=sys.argv[1]
 if mode=='br':data=read('https://tusneldax.com/api/bus-rush/admin/funnel?days=8',os.environ['BR_FUNNEL_KEY'],'x-funnel-key')
 elif mode=='em':
  import base64,re
  from cryptography.hazmat.primitives import hashes
  from cryptography.hazmat.primitives.kdf.hkdf import HKDF
  raw=os.environ['API_PRIVATE_KEY'].replace('\\n','\n');body=re.sub(r'[^A-Za-z0-9+/=]','',re.sub(r'-----(BEGIN|END)[A-Z ]*-----','',raw))
  key=HKDF(algorithm=hashes.SHA256(),length=32,salt=b'em-funnel',info=b'read-v1').derive(base64.b64decode(body)).hex()
  data=read('https://electricman.tusneldax.com/api/em/admin/funnel?days=8',key,'x-funnel-key')
 else:data=json.load(open('/tmp/funnel.json'))
 day=(datetime.datetime.now(datetime.timezone.utc).date()-datetime.timedelta(days=1)).isoformat();text=render(data,mode,day)
 pathlib.Path('report-output').mkdir(exist_ok=True);pathlib.Path(f'report-output/{day}.md').write_text(text,encoding='utf8')
 if os.environ.get('GITHUB_STEP_SUMMARY'):
  with open(os.environ['GITHUB_STEP_SUMMARY'],'a',encoding='utf8') as f:f.write(text)
 print(text)
