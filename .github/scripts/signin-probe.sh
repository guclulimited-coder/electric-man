#!/usr/bin/env bash
# Emulator: (A) Electric Hunter -> tarayicida giris (Custom Tab) -> "Google ile devam et" dokunusu: Google penceresi nerede aciliyor?
# (B) Acilir pencere one gectiginde arkadaki sayfanin electricman:// gecisi uygulamayi acabiliyor mu?
set -u
mkdir -p probe
shot(){ adb exec-out screencap -p > "probe/$1.png"; }
top(){ adb shell dumpsys activity activities | grep -m1 -E "topResumedActivity|mResumedActivity" | grep -o "[a-z.]*/[A-Za-z.]*" | head -1; }
chromeacts(){ adb shell dumpsys activity activities | grep -E "^\s+\* ActivityRecord|Hist #" | grep -oE "com.android.chrome/[A-Za-z.]+|com.tusneldax[a-z.]*/[A-Za-z.]+" | tr '\n' ' '; }
adb root >/dev/null 2>&1; sleep 3
adb shell 'echo "_ --disable-fre --no-default-browser-check --no-first-run" > /data/local/tmp/chrome-command-line'
adb shell am set-debug-app --persistent com.android.chrome
adb shell pm grant com.android.chrome android.permission.POST_NOTIFICATIONS 2>/dev/null
adb shell am start -a android.intent.action.VIEW -d https://example.com -p com.android.chrome >/dev/null; sleep 20; adb shell am force-stop com.android.chrome
adb install -r probe-apk/eh.apk >/dev/null 2>&1
adb install -r probe-apk/em.apk >/dev/null 2>&1
# B
mkdir -p /tmp/site && cd /tmp/site
T=$(printf 'a%.0s' $(seq 64)); S=$(printf 'b%.0s' $(seq 32)); TARGET="electricman://signin?ticket=$T&state=$S"
btn='<style>button{position:fixed;inset:0;width:100vw;height:100vh;font-size:40px}</style>'
echo "<!doctype html><meta name=viewport content='width=device-width'>$btn<button onclick=\"window.open('/child.html','_blank');setTimeout(()=>location.assign('/redir'),6000)\">popup</button>" > popup.html
echo "<!doctype html><meta name=viewport content='width=device-width'><h1>child window</h1><script>setTimeout(()=>window.close(),3000)</script>" > childclose.html
echo "<!doctype html><meta name=viewport content='width=device-width'><h1>child window</h1>" > child.html
echo "<!doctype html><meta name=viewport content='width=device-width'>$btn<button onclick=\"window.open('/childclose.html','_blank');setTimeout(()=>location.assign('/redir'),6000)\">auto</button>" > c1.html
echo "<!doctype html><meta name=viewport content='width=device-width'>$btn<button id=b onclick=\"if(!window.p){window.p=1;window.open('/childclose.html','_blank');this.textContent='back to game'}else{location.assign('/redir')}\">sign in</button>" > fix.html
echo "<!doctype html><meta name=viewport content='width=device-width'>$btn<button onclick=\"const w=window.open('/child.html','_blank');setTimeout(()=>{try{w.close()}catch(e){};location.assign('/redir')},6000)\">popup-close</button>" > popupclose.html
cat > /tmp/srv.py <<PY
import http.server, socketserver, os
os.chdir('/tmp/site')
class H(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/redir'):
            self.send_response(302); self.send_header('Location', '$TARGET'); self.end_headers(); return
        return super().do_GET()
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
socketserver.TCPServer(('127.0.0.1', 8765), H).serve_forever()
PY
python3 /tmp/srv.py & SRV=$!
cd - >/dev/null
adb reverse tcp:8765 tcp:8765
run(){ local name=$1 page=$2 cct=$3
  adb shell am force-stop com.tusneldax.electricman; adb shell am force-stop com.android.chrome; adb logcat -c
  if [ "$cct" = 1 ]; then adb shell am start -a android.intent.action.VIEW -d "http://127.0.0.1:8765/$page" -p com.android.chrome --es android.support.customtabs.extra.SESSION x >/dev/null
  else adb shell am start -a android.intent.action.VIEW -d "http://127.0.0.1:8765/$page" -p com.android.chrome >/dev/null; fi
  sleep 8; local t0=$(top); adb shell input tap 540 1000; sleep 3; local t1=$(top); sleep 12
  local started=$(adb logcat -d | grep -c "dat=electricman:"); shot "$name"
  echo "::notice title=$name::uygulama acildi=$([ "$started" -gt 0 ] && echo EVET || echo HAYIR) | baslangic=$t0 | acilir pencere sonrasi=$t1 | son=$(top)"
}
crun(){ local name=$1 page=$2 cct=$3 second=$4
  adb shell am force-stop com.tusneldax.electricman; adb shell am force-stop com.android.chrome; adb logcat -c
  if [ "$cct" = 1 ]; then adb shell am start -a android.intent.action.VIEW -d "http://127.0.0.1:8765/$page" -p com.android.chrome --es android.support.customtabs.extra.SESSION x >/dev/null
  else adb shell am start -a android.intent.action.VIEW -d "http://127.0.0.1:8765/$page" -p com.android.chrome >/dev/null; fi
  sleep 8; local t0=$(top); adb shell input tap 540 1000; sleep 2; local t1=$(top); shot "$name-1"; sleep 4; local t2=$(top); shot "$name-2"
  [ "$second" = 1 ] && { sleep 3; adb shell input tap 540 1000; }
  sleep 12; local started=$(adb logcat -d | grep -c "dat=electricman:"); shot "$name-3"
  echo "::notice title=$name::uygulama acildi=$([ "$started" -gt 0 ] && echo EVET || echo HAYIR) | once=${t0##*.} | pencere acikken=${t1##*.} | pencere kapandiktan sonra=${t2##*.} | son=$(top)"
}
crun C1-customtab-simdiki-akis c1.html 1 0
crun C2-customtab-duzeltme fix.html 1 1
crun C3-chrome-simdiki-akis c1.html 0 0
crun C4-chrome-duzeltme fix.html 0 1
kill $SRV 2>/dev/null
exit 0
