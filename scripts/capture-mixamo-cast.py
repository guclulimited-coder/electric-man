"""Electric Hunter: in-game capture of the Mixamo boss (mutant) + two mesh enemies (zombi, goblin). Frames → mp4."""
import pathlib,http.server,threading,subprocess,sys,json,time
from playwright.sync_api import sync_playwright
root=pathlib.Path('/tmp/claude-0/-home-claude/a3cf984e-e7d2-5987-aef5-5cd37d00a67b/scratchpad').resolve();out=pathlib.Path(sys.argv[1]);frames=out/'frames';frames.mkdir(parents=True,exist_ok=True)
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*a,**k): super().__init__(*a,directory=str(root),**k)
    def log_message(self,*a): pass
srv=http.server.ThreadingHTTPServer(('127.0.0.1',0),H);threading.Thread(target=srv.serve_forever,daemon=True).start()
N=int(sys.argv[2]) if len(sys.argv)>2 else 40
with sync_playwright() as pw:
    b=pw.chromium.launch(headless=True,args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']);p=b.new_page(viewport={'width':1280,'height':720})
    p.goto(f'http://127.0.0.1:{srv.server_address[1]}/hunter-www/index.html?shot&lang=tr');p.wait_for_function('()=>window.__eh&&!document.getElementById("startBtn").disabled',timeout=180000)
    p.evaluate("()=>{localStorage.setItem('eh_introSeen','1');}")
    p.evaluate("()=>__eh.store.set('introSeen',1)");p.evaluate("()=>__eh.startGame()");p.wait_for_timeout(4000)
    setup="""()=>{const E=__eh,T=E.scene;const isl=E.islands[0];const ac=isl.arena.c;
      E.dressBoss(isl.boss,Object.assign({name:'Mutant'},E.CAST.find(c=>c.id==='mutant')));
      isl.boss.body.traverse(o=>{if(o.userData.cage)o.visible=false;});
      E.player.pos.set(ac.x,0,ac.z+7);
      const z=E.spawn('zombi',E.player.pos.clone().add({x:-3,y:0,z:-2}),{});const g=E.spawn('goblin',E.player.pos.clone().add({x:3,y:0,z:-2}),{});
      z.state='chase';g.state='chase';isl.boss.state='chase';isl.boss.awake=true;
      return {boss:isl.boss.cast&&isl.boss.cast.id,n:E.enemies.length};}"""
    print(p.evaluate(setup));p.wait_for_timeout(2500)
    p.evaluate("()=>{const b=document.getElementById('storyBtn')||document.querySelector('#storyCard button');if(b)b.click();for(const id of ['dlg','storyCard'])document.getElementById(id).hidden=true;}");p.wait_for_timeout(4000)
    p.evaluate("()=>{const E=__eh;const isl=E.islands[0];E.player.pos.set(isl.arena.c.x,0,isl.arena.c.z+7);}")
    print('err',p.evaluate('()=>window.__ehErr'))
    ok=p.evaluate("()=>{let n=0;for(const e of __eh.enemies)if(e.mixer)n++;return n;}");print('models with mixer',ok)
    t0=time.time()
    for i in range(N):
        p.wait_for_timeout(120);p.screenshot(path=str(frames/f'{i:04d}.png'))
    print('capture s',round(time.time()-t0))
    b.close()
subprocess.run(['ffmpeg','-y','-framerate','8','-i',str(frames/'%04d.png'),'-c:v','libx264','-pix_fmt','yuv420p',str(out/'electric-hunter-mixamo.mp4')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
print('done')
