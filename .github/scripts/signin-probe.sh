#!/usr/bin/env bash
# Emulator icinde: (1) Chrome'da kullanici dokunusu olmadan/olan ozel adres (electricman://) gecisleri,
# (2) uygulamanin acilis ekrani ve "tarayicida giris" dugmesi (Custom Tab'ta app-login).
set -u
PKG=com.tusneldax.electricman
mkdir -p probe
adb install -r android/app/build/outputs/apk/debug/app-debug.apk >/dev/null && echo "::notice title=kurulum::hata ayiklama APK kuruldu"
# Chrome ilk acilis ekranini atla
adb root >/dev/null 2>&1; sleep 3
adb shell 'echo "_ --disable-fre --no-default-browser-check --no-first-run" > /data/local/tmp/chrome-command-line'
adb shell 'echo "_ --disable-fre --no-default-browser-check --no-first-run" > /data/local/chrome-command-line' 2>/dev/null
adb shell am set-debug-app --persistent com.android.chrome
CV=$(adb shell dumpsys package com.android.chrome | grep -m1 versionName | tr -d ' \r')
echo "::notice title=Chrome::$CV"
# test sayfalari
mkdir -p /tmp/site && cd /tmp/site
T=$(printf 'a%.0s' $(seq 64)); S=$(printf 'b%.0s' $(seq 32))
TARGET="electricman://signin?ticket=$T&state=$S"
btn='<style>button{position:fixed;inset:0;width:100vw;height:100vh;font-size:40px}</style>'
echo "<!doctype html><meta name=viewport content='width=device-width'><p>auto</p><script>setTimeout(()=>location.assign('/redir'),3000)</script>" > auto.html
echo "<!doctype html><meta name=viewport content='width=device-width'>$btn<button onclick=\"setTimeout(()=>location.assign('/redir'),1000)\">tap-fast</button>" > tapfast.html
echo "<!doctype html><meta name=viewport content='width=device-width'>$btn<button onclick=\"setTimeout(()=>location.assign('/redir'),7000)\">tap-slow</button>" > tapslow.html
echo "<!doctype html><meta name=viewport content='width=device-width'>$btn<button onclick=\"setTimeout(()=>location.href='$TARGET',1000)\">tap-direct</button>" > tapdirect.html
echo "<!doctype html><meta name=viewport content='width=device-width'><p>auto-direct</p><script>setTimeout(()=>location.href='$TARGET',3000)</script>" > autodirect.html
cat > /tmp/srv.py <<PY
import http.server, socketserver, os
os.chdir('/tmp/site')
class H(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/redir'):
            self.send_response(302); self.send_header('Location', '$TARGET'); self.send_header('Cache-Control','no-store'); self.end_headers(); return
        return super().do_GET()
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
socketserver.TCPServer(('127.0.0.1', 8765), H).serve_forever()
PY
python3 /tmp/srv.py & SRV=$!
cd - >/dev/null
adb reverse tcp:8765 tcp:8765
# Chrome'u bir kez isit
adb shell am start -a android.intent.action.VIEW -d http://127.0.0.1:8765/auto.html -p com.android.chrome >/dev/null; sleep 25
adb shell am force-stop com.android.chrome; adb shell am force-stop $PKG
run(){ # ad, sayfa, dokun(0/1), cct(0/1)
  local name=$1 page=$2 tap=$3 cct=$4
  adb shell am force-stop $PKG; adb shell am force-stop com.android.chrome; adb logcat -c
  if [ "$cct" = 1 ]; then
    adb shell am start -a android.intent.action.VIEW -d "http://127.0.0.1:8765/$page" -p com.android.chrome --ez android.support.customtabs.extra.SESSION_FAKE true --es android.support.customtabs.extra.SESSION x >/dev/null
  else
    adb shell am start -a android.intent.action.VIEW -d "http://127.0.0.1:8765/$page" -p com.android.chrome >/dev/null
  fi
  sleep 8
  [ "$tap" = 1 ] && adb shell input tap 540 1000
  sleep 14
  local started=$(adb logcat -d | grep -c "dat=electricman:")
  local top=$(adb shell dumpsys activity activities | grep -m1 -E "mResumedActivity|topResumedActivity" | grep -o "[a-z.]*/[A-Za-z.]*" | head -1)
  local blocked=$(adb logcat -d | grep -iE "Navigation is blocked|external.*block|cr_UrlHandler|ExternalNavigation" | head -2 | tr '\n' ' ' | cut -c1-200)
  adb exec-out screencap -p > probe/$name.png
  echo "::notice title=$name::uygulama acildi=$([ "$started" -gt 0 ] && echo EVET || echo HAYIR) | ondeki=$top | chrome: ${blocked:--}"
}
run "1-otomatik-yonlendirme-dokunussuz" auto.html 0 0
run "2-dokunus-1sn-sonra-yonlendirme" tapfast.html 1 0
run "3-dokunus-7sn-sonra-yonlendirme" tapslow.html 1 0
run "4-dokunus-1sn-sonra-dogrudan" tapdirect.html 1 0
run "5-otomatik-dogrudan-dokunussuz" autodirect.html 0 0
run "6-customtab-otomatik-yonlendirme" auto.html 0 1
run "7-customtab-dokunus-7sn" tapslow.html 1 1
kill $SRV 2>/dev/null
# uygulama acilis ekrani ve giris dugmesi
adb shell am force-stop com.android.chrome; adb shell pm clear $PKG >/dev/null; adb logcat -c
adb shell am start -n $PKG/.MainActivity >/dev/null; sleep 40
adb exec-out screencap -p > probe/8-uygulama-acilis.png
adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb pull /sdcard/ui.xml /tmp/ui.xml >/dev/null 2>&1
B=$(python3 - <<'PY'
import re
x=open('/tmp/ui.xml',encoding='utf-8').read() if __import__('os').path.exists('/tmp/ui.xml') else ''
texts=[t for t in re.findall(r'text="([^"]{2,80})"',x)][:25]
m=re.search(r'text="(Sign in in the browser|Tarayıcıda giriş yap[^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"',x)
print((' '.join(map(str,[(int(m.group(2))+int(m.group(4)))//2,(int(m.group(3))+int(m.group(5)))//2])) if m else '-')+'|'+' ¦ '.join(texts))
PY
)
echo "::notice title=8-uygulama-acilis::dugme=${B%%|*} | ekrandaki yazilar: ${B#*|}" | cut -c1-1500
if [ "${B%%|*}" != "-" ]; then
  adb shell input tap ${B%%|*}; sleep 20
  adb exec-out screencap -p > probe/9-giris-sayfasi.png
  top=$(adb shell dumpsys activity activities | grep -m1 -E "mResumedActivity|topResumedActivity" | grep -o "[a-z.]*/[A-Za-z.]*" | head -1)
  adb shell uiautomator dump /sdcard/ui2.xml >/dev/null 2>&1; adb pull /sdcard/ui2.xml /tmp/ui2.xml >/dev/null 2>&1
  t2=$(python3 -c "import re;x=open('/tmp/ui2.xml',encoding='utf-8').read();print(' ¦ '.join(re.findall(r'text=\"([^\"]{2,80})\"',x)[:25]))" 2>/dev/null)
  echo "::notice title=9-giris-sayfasi::ondeki=$top | yazilar: $t2" | cut -c1-1500
  adb shell input keyevent 4; sleep 6
  adb exec-out screencap -p > probe/10-geri-donus.png
  echo "::notice title=10-geri::ondeki=$(adb shell dumpsys activity activities | grep -m1 -E 'mResumedActivity|topResumedActivity' | grep -o '[a-z.]*/[A-Za-z.]*' | head -1)"
fi
adb logcat -d | grep -iE "chromium|EMBridge|electricman" | grep -iE "error|uncaught|fail" | head -5 | sed 's/^/::notice title=logcat::/' | cut -c1-300
exit 0
