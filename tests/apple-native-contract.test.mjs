import {readFileSync,readdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const text=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const swift=text('ios/ElectricMan/GameView.swift'),html=text('public/index.html');
let checks=0;
function check(condition,label){assert.ok(condition,label);checks++;}
check(text('ios/ElectricMan/ElectricMan.entitlements').includes('com.apple.developer.applesignin'),'SIWA entitlement');
check(text('ios/project.yml').includes('CODE_SIGN_ENTITLEMENTS: ElectricMan/ElectricMan.entitlements'),'entitlement in build');
check(text('ios/project.yml').includes('CURRENT_PROJECT_VERSION: "30"'),'build 30');
check(swift.includes('request.state = state')&&swift.includes('credential.state == expectedState'),'native state round trip');
check(swift.includes('request.nonce = nonce'),'server-issued nonce reaches native request');
check(swift.includes('guard controller === appleController else { return }'),'stale controller ignored');
check(swift.includes('guard self.appleAttempt == attempt else { return }'),'stale task ignored');
check(swift.includes('guard let window = self.activeWindow()'),'foreground anchor required after network wait');
check(swift.includes('self.appleWindow = window')&&!swift.includes('UIWindow(windowScene:'),'no detached fallback presentation');
check(swift.includes('coordinator.cancelSignIn()')&&swift.includes('appleTask?.cancel()'),'lifetime cancellation');
check(swift.includes('appleReply == nil, activeWindow() != nil'),'browser/native mutual exclusion');
check(swift.includes('callback.scheme == "electricman"'),'callback scheme validation');
check(swift.includes('message.frameInfo.request.url?.host == "game"'),'bridge restricted to bundled host');
check(html.includes('id="guestPlay"')&&html.includes("Native.call({action:'cancelLogin'})"),'guest visible and pending sign-in canceled');
check(swift.includes('#if DEBUG && targetEnvironment(simulator)'),'synthetic capture mode cannot ship in Release');
for(const file of readdirSync(new URL('../public/i18n',import.meta.url)).filter(n=>n.endsWith('.json'))){
 check(!!JSON.parse(text('public/i18n/'+file)).guestPlay,'guest label '+file);
}
// Parse all page scripts; no browser APIs or remote requests are executed.
for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
 if(/\bsrc\s*=|type="importmap"/.test(match[1]))continue;
 const js=match[2].replace(/^import .*?;\s*$/gm,'');
 new vm.Script(`(async()=>{${js}\n})()`);checks++;
}
// Execute the real native/offline account branches against a tiny DOM harness:
// guest dismisses the sheet and cancels pending native login, without auth calls.
const start=html.indexOf('  async function openAccount(){');
const account=html.slice(start,html.indexOf('    if (me) return accountView();',start))+'\n}';
for(const configured of [true,false]){
 const elements={sheet:{hidden:false}},buttons={},calls=[];
 const box={querySelector:id=>buttons[id]??=( {} )};
 let rendered='';
 const context=vm.createContext({cfg:configured?{}:null,me:null,
  Native:{app:true,platform:'ios',call:async x=>{calls.push(x);return {ok:true};}},
  T:k=>k,esc:x=>x,$:id=>elements[id]??={},sheet:(title,markup)=>{rendered=markup;return box;},
  Profile:{picker:()=>''},settingsRow:()=>'',langPicker:()=>'',legal:()=>'',
  bindLang:()=>{},bindSettings:()=>{},stopChat:()=>{},LANG:'en'});
 await new vm.Script(`(async()=>{${account};await openAccount()})()`).runInContext(context);
 check(rendered.includes('id="guestPlay"'),'guest rendered '+configured);
 buttons['#guestPlay'].onclick();
 check(elements.sheet.hidden===true,'guest closes sheet '+configured);
 check(configured?calls.length===1&&calls[0].action==='cancelLogin':calls.length===0,'guest never authenticates '+configured);
}
console.log(checks+' native source/guest UI contracts passed; Swift/Xcode execution not claimed');
