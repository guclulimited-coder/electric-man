#!/usr/bin/env bash
# Emulator test of the new app sign-in (debug APKs of this branch, live sign-in page, App Review demo account).
#  A) Electric Man, English: first screen = sign-in methods, no character select on top; demo sign-in in the Custom Tab while
#     the app process is killed (system closing the app); back in the app the sign-in completes and the game opens.
#  B) Electric Hunter, Bengali (per-app locale): the jump back (/native/handoff) is blocked; the app must finish by polling
#     and come back to the front by itself.
set -u
mkdir -p shots
FAILS=0
note(){ echo "::notice title=$1::$2"; }
bad(){ echo "::error title=$1::$2"; FAILS=$((FAILS+1)); }
shot(){ adb exec-out screencap -p > "shots/$1.png"; }
top(){ adb shell dumpsys activity activities | grep -m1 -E "topResumedActivity|mResumedActivity" | grep -oE "[a-z.]+/[A-Za-z.]+" | head -1; }
appws(){ local pid; pid=$(adb shell pidof "$1" | tr -d '\r'); adb forward --remove tcp:9223 >/dev/null 2>&1
  local sock; sock=$(adb shell cat /proc/net/unix | grep -o "webview_devtools_remote_$pid" | head -1)
  [ -n "$sock" ] && adb forward tcp:9223 "localabstract:$sock" >/dev/null; echo "pid=$pid sock=$sock"; }
chromews(){ adb forward --remove tcp:9222 >/dev/null 2>&1; adb forward tcp:9222 localabstract:chrome_devtools_remote >/dev/null; }
J(){ python3 .github/scripts/cdp.py "$@"; }

# live server: claim endpoint and sign-in page answer
r=$(curl -sS -X POST https://electricman.tusneldax.com/api/em/native/claim -H 'Origin: https://electricman.tusneldax.com' -H 'Content-Type: application/json' -d "{\"verifier\":\"$(printf 'a%.0s' $(seq 64))\"}")
[ "$r" = '{"pending":true}' ] && note "server claim" "$r" || bad "server claim" "$r"

adb root >/dev/null 2>&1; sleep 3
adb shell 'echo "_ --disable-fre --no-default-browser-check --no-first-run" > /data/local/tmp/chrome-command-line'
adb shell am set-debug-app --persistent com.android.chrome
adb shell pm grant com.android.chrome android.permission.POST_NOTIFICATIONS 2>/dev/null
adb shell am start -a android.intent.action.VIEW -d https://example.com -p com.android.chrome >/dev/null; sleep 20; adb shell am force-stop com.android.chrome
adb install -r apk/em.apk >/dev/null && adb install -r apk/eh.apk >/dev/null || bad install "apk install failed"

# ---------------- A: Electric Man (English) ----------------
P=com.tusneldax.electricman
adb shell am start -n $P/.MainActivity >/dev/null; sleep 35; shot A1-ilk-acilis
note "A ws" "$(appws $P)"
s=$(J 9223 eval index.html "JSON.stringify({gate: !!document.querySelector('#sheet.gate:not([hidden])'), charSelect: !document.getElementById('modal').hidden, ways: [...document.querySelectorAll('[data-login]')].map(b => b.dataset.login + '=' + b.textContent), lang: document.documentElement.lang})")
note "A first screen" "$s"
echo "$s" | grep -q '\\"gate\\":true' && echo "$s" | grep -q '\\"charSelect\\":false' && echo "$s" | grep -q 'Continue with Google' || bad "A first screen" "$s"
J 9223 eval index.html "document.querySelector('[data-login=review]').click(), 1" >/dev/null; sleep 10; shot A2-giris-sayfasi
note "A after tap" "top=$(top)"
adb shell "kill -9 \$(pidof $P)"; sleep 2
note "A app killed" "pid now='$(adb shell pidof $P | tr -d '\r')' top=$(top)"
chromews; out=$(J 9222 review app-login 0); note "A sign-in page" "$(echo "$out" | tr '\n' ' ')"
sleep 15; t=$(top); note "A after sign-in" "top=$t"
if [[ "$t" != *electricman* ]]; then adb shell input keyevent BACK; sleep 30; note "A back pressed" "top=$(top)"; else sleep 20; fi
shot A3-oyuna-donus
note "A ws2" "$(appws $P)"
s=$(J 9223 eval index.html "JSON.stringify({gate: !!document.querySelector('#sheet.gate:not([hidden])'), signedIn: !document.getElementById('accountDot').hidden, charSelect: !document.getElementById('modal').hidden, modalTitle: document.getElementById('modal').hidden ? '' : document.getElementById('modal').innerText.slice(0, 60)})")
note "A result" "$s"
echo "$s" | grep -q '\\"signedIn\\":true' && echo "$s" | grep -q '\\"gate\\":false' || bad "A result" "sign-in not completed after process death: $s"
shot A4-son

# ---------------- B: Electric Hunter (Bengali, polling only) ----------------
P=com.tusneldax.electrichunter
adb shell cmd locale set-app-locales $P --locales bn-BD >/dev/null 2>&1 || adb shell "setprop persist.sys.locale bn-BD"
adb shell am start -n $P/.MainActivity >/dev/null; sleep 40; shot B1-ilk-acilis
note "B ws" "$(appws $P)"
s=$(J 9223 eval index.html "JSON.stringify({gate: !document.getElementById('gateBox').hidden, startHidden: document.getElementById('startBtn').hidden, ways: [...document.querySelectorAll('[data-login]')].map(b => b.dataset.login + '=' + b.textContent), lang: document.documentElement.lang})")
note "B first screen" "$s"
echo "$s" | grep -q '\\"gate\\":true' || bad "B first screen" "$s"
J 9223 eval index.html "document.querySelector('[data-login=review]').click(), 1" >/dev/null; sleep 10; shot B2-giris-sayfasi
chromews; out=$(J 9222 review app-login 25); note "B sign-in page (jump back blocked)" "$(echo "$out" | tr '\n' ' ')"
sleep 8; t=$(top); note "B after polling" "top=$t"
[[ "$t" == *electrichunter* ]] && note "B came back by itself" "yes" || { note "B came back by itself" "no (pressing back)"; adb shell input keyevent BACK; sleep 10; }
shot B3-oyuna-donus
note "B ws2" "$(appws $P)"
s=$(J 9223 eval index.html "JSON.stringify({gate: !document.getElementById('gateBox').hidden, title: !document.getElementById('title').hidden, running: typeof running !== 'undefined' ? running : null})")
note "B result" "$s"
echo "$s" | grep -q '\\"gate\\":false' || bad "B result" "polling sign-in not completed: $s"
sleep 10; shot B4-son
note "summary" "failures=$FAILS"
exit 0
