// Localization review only: synthetic GET fixtures, no database, no upstream calls.
const player={id:'localization-preview',name:'Preview Driver',code:'PREVIEW01',adult:true,locale:'en'};
const rival={id:'preview-rival',name:'Sample Rival',code:'PREVIEW02',adult:true,rank:2,points:150,league:'silver',friendship:'none'};
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-BusRush-Preview':'synthetic-read-only'}});
export default {async fetch(request,env){const u=new URL(request.url);
 if(u.pathname.startsWith('/api/bus-rush/')){
  if(!['GET','HEAD'].includes(request.method))return json({error:'PREVIEW_READ_ONLY'},403);
  const p=u.pathname.slice('/api/bus-rush'.length);
  if(p==='/config')return json({version:'localization-preview',webRelease:'cd316f64a6fdc16a',translation:false});
  if(p==='/me')return json({player});
  if(p==='/progress')return json({revision:1,profile:{progressEpoch:'bus-rush-20261003-fifo-level3',coins:0,unlocked:1,stars:{},sound:false,haptic:false,resume:null,owned:['classic'],skin:'classic',firstClears:[],stats:{passengers:0,wins:0}}});
  if(p==='/notifications')return json({requests:[],messages:[]});
  if(p==='/presence')return json({online:0});
  if(p==='/league')return json({week:'2026-10-19',ends:'2026-10-26T00:00:00Z',serverTime:Date.now(),totalPlayers:2,own:{...player,rank:1,points:200,league:'gold',me:true,eligible:false},rows:[{...player,rank:1,points:200,league:'gold',me:true},rival],lastWeek:{top:[]}});
  if(p==='/match')return json({record:{wins:0,losses:0,draws:0},incoming:[],outgoing:[],recent:[]});
  if(p==='/friends')return json({friends:[],incoming:[],outgoing:[],blocked:[]});
  if(p==='/special')return json({rank:{best:null,rank:null,total:0,top:[]}});
  if(p==='/global-chat')return json({messages:[]});
  return json({error:'PREVIEW_READ_ONLY'},404);
 }
 return env.ASSETS.fetch(request);
}};
