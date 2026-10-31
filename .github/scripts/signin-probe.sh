#!/usr/bin/env bash
# Emulator icinde: Play'deki surumlerin (EM 1.0.35 (135), EH 1.0.30 (130)) ilk acilisi, giris ekrani ve
# "tarayicida giris" dugmesi. Paketler hata ayiklama anahtariyla yeniden imzalanir; canliya yazilmaz.
set -u
mkdir -p probe
shot(){ adb exec-out screencap -p > "probe/$1.png"; }
top(){ adb shell dumpsys activity activities | grep -m1 -E "topResumedActivity|mResumedActivity" | grep -o "[a-z.]*/[A-Za-z.]*" | head -1; }
texts(){ adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb pull /sdcard/ui.xml /tmp/ui.xml >/dev/null 2>&1; python3 - "$1" <<'PY'
import re,sys,os
x=open('/tmp/ui.xml',encoding='utf-8').read() if os.path.exists('/tmp/ui.xml') else ''
want=sys.argv[1]
t=[s for s in re.findall(r'(?:text|content-desc)="([^"]{2,90})"',x)]
m=re.search(r'(?:text|content-desc)="('+want+r')"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"',x)
print((f"{(int(m.group(2))+int(m.group(4)))//2} {(int(m.group(3))+int(m.group(5)))//2}" if m else '-')+'|'+' ¦ '.join(t[:30]))
PY
}
adb root >/dev/null 2>&1; sleep 3
adb shell 'echo "_ --disable-fre --no-default-browser-check --no-first-run" > /data/local/tmp/chrome-command-line'
adb shell am set-debug-app --persistent com.android.chrome
adb shell am start -a android.intent.action.VIEW -d https://example.com -p com.android.chrome >/dev/null; sleep 20; adb shell am force-stop com.android.chrome
for spec in "em com.tusneldax.electricman probe-apk/em.apk" "eh com.tusneldax.electrichunter probe-apk/eh.apk"; do
  set -- $spec; G=$1; PKG=$2; APK=$3
  adb install -r "$APK" >/dev/null 2>&1 && echo "::notice title=$G kurulum::$(basename $APK) kuruldu" || { echo "::warning title=$G kurulum::kurulamadi"; continue; }
  adb logcat -c
  adb shell am start -n $PKG/.MainActivity >/dev/null
  for s in 15 45 90 150; do
    case $s in 15) sleep 15;; 45) sleep 30;; 90) sleep 45;; *) sleep 60;; esac
    shot "$G-acilis-${s}sn"
    R=$(texts 'Sign in in the browser|Tarayıcıda giriş yap')
    echo "::notice title=$G acilis ${s}sn::ondeki=$(top) dugme=${R%%|*} | yazilar: ${R#*|}" | cut -c1-1200
    [ "${R%%|*}" != "-" ] && break
  done
  pid=$(adb shell pidof $PKG | tr -d '\r')
  adb logcat -d | grep -E "ANR in|FATAL|AndroidRuntime|Skipped [0-9]{3,} frames|chromium.*(Uncaught|ERROR:)|Choreographer" | head -6 | cut -c1-250 | sed "s/^/::notice title=$G logcat::/"
  if [ "${R%%|*}" != "-" ]; then
    adb logcat -c
    adb shell input tap ${R%%|*}; sleep 20
    shot "$G-giris-sayfasi"
    R2=$(texts 'zzz')
    echo "::notice title=$G giris dugmesi::ondeki=$(top) | yazilar: ${R2#*|}" | cut -c1-1200
    adb logcat -d | grep -m3 -E "START u0.*(app-login|customtabs|VIEW)" | cut -c1-250 | sed "s/^/::notice title=$G baslatilan::/"
    adb shell input keyevent 4; sleep 8
    shot "$G-geri"
    R3=$(texts 'zzz')
    echo "::notice title=$G geri donus::ondeki=$(top) | yazilar: ${R3#*|}" | cut -c1-900
  fi
  adb shell am force-stop $PKG
done
exit 0
