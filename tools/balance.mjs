// Electric Hunter pacing model: free-play power over time vs coin upgrades; boss gates in public/hunter/index.html (bossGate).
// Run: node tools/balance.mjs
const W={pense:[11,.55,'melee'],tornavida:[8,.3,'melee'],falcata:[14,.6,'melee'],keser:[32,1.6,'slam'],testere:[6,.25,'spin'],zimba:[12,.6,'shot'],kablo:[10,1.1,'chain']};
const TOOL=['tornavida','falcata','zimba','keser','testere','kablo'];
const mixes=[['surungen','surungen','surungen'],['goz','goz','surungen'],['tukurucu','tukurucu','surungen'],['tank','surungen','surungen'],['tukurucu','goz','tank']];
const cmdTypes=[['tank','tukurucu'],['surungen','goz'],['tukurucu','tank'],['goz','surungen']];
function sim(hours,k,coins,P,start){
  const p=start?structuredClone(start):{dmg:1,maxHp:100,rate:1,regen:.6,gear:[{id:'pense',lv:1}],ups:{dmg:0,hp:0,rate:0}};
  const eat=t=>{ if(t==='sifa'){p.maxHp+=1.2;p.regen+=.05;return} if(t==='ofke'){p.dmg+=P.ofke;return}
    p.dmg+=P.eat;p.maxHp+=.6; if(t==='tukurucu')p.dmg+=P.eat/3; if(t==='tank')p.maxHp+=.4; if(t==='goz')p.rate=Math.max(.5,p.rate*.999)};
  const addW=id=>{const h=p.gear.find(w=>w.id===id); if(h)h.lv++; else if(p.gear.length<4)p.gear.push({id,lv:1}); else p.dmg+=.06};
  const camps=[];
  for(let i=0;i<5;i++){const m=mixes[(i+k)%5].slice();for(let n=0;n<k;n++)m.push(m[n%m.length]);camps.push({m,next:0,c:0,b:60,cap:10800})}
  for(let i=0;i<2;i++)camps.push({m:[cmdTypes[k%4][i],'surungen','surungen'],elite:TOOL[(k*2+i)%6],next:0,c:0,b:P.cmdBase,cap:P.cmdCap});
  for(const t of ['sifa','ofke','ofke','sifa','sifa','ofke','sifa','ofke'])camps.push({m:[t],next:0,c:0,b:120,cap:16200});
  for(let t=0;t<=hours*3600;t+=10){for(const c of camps){ if(c.next>t)continue; for(const x of c.m)eat(x); if(c.elite){p.dmg+=.03;p.maxHp+=3;addW(c.elite)} c.c++; c.next=t+Math.min(c.cap,c.b*2**(c.c-1)); }}
  let left=coins;
  for(;;){const opts=[['dmg',100],['hp',100],['rate',180]].map(([id,b])=>[id,Math.round(b*(P.g||1.18)**p.ups[id]/5)*5]).sort((a,b)=>a[1]-b[1]); const [id,c]=opts[0]; if(c>left)break; left-=c; p.ups[id]++;}
  return p;
}
function power(p,P){ const dm=p.dmg*(1+P.upD)**p.ups.dmg, hp=p.maxHp+P.upH*p.ups.hp, rate=p.rate*.97**p.ups.rate;
  let dps=0; for(const w of p.gear){const [b,cd,kind]=W[w.id]; dps+=b*(1+P.lvD*(w.lv-1))*dm/(cd*P.lvC**(w.lv-1)*rate)*(kind==='spin'||kind==='slam'?1.6:kind==='chain'?2:1)}
  return Math.round(dps*4+hp*1.2+p.regen*20);}

const P={eat:.002,ofke:.004,cmdBase:600,cmdCap:21600,lvD:.12,lvC:.97,upD:.04,upH:12,g:1.1};
const f=h=>power(sim(h,0,0,P),P);
console.log('k0 free', [1/6,1,6,12,24].map(f).join(' '), 'ads6',power(sim(6,0,3000,P),P),'ads12',power(sim(12,0,3000,P),P),'pack1',power(sim(1,0,15000,P),P));
// chain: each island one more day of free play after the boss bonus
let st=null; const G=[];
for(let k=0;k<12;k++){ const p=sim(24,k,0,P,st); G.push(power(p,P)); p.dmg+=.25; p.maxHp+=40; st=p; }
console.log('G', G.join(', '));
console.log('ratios', G.slice(1).map((g,i)=>(g/G[i]).toFixed(2)).join(' '));
