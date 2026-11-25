#!/bin/bash
# HızırUsta emülatör denemesi: uygulamayı kurar, açar, sekmeleri gezer, ekran görüntüsü ve hata kaydı toplar.
set -x
OUT=hu-test; mkdir -p $OUT
adb install -r hizirusta-app/android/app/build/outputs/apk/debug/app-debug.apk
adb logcat -c
adb shell am start -n com.tusneldax.hizirusta/.MainActivity
sleep 25
adb exec-out screencap -p > $OUT/1-acilis.png
adb shell uiautomator dump /sdcard/u.xml >/dev/null; adb exec-out cat /sdcard/u.xml > $OUT/1-agac.xml
# alt menü: 5 sekme, ekranın en altında (gezinme çubuğunun üstü)
read W H < <(adb shell wm size | sed -E 's/.* ([0-9]+)x([0-9]+).*/\1 \2/')
Y=$((H - H/12))
i=2
for s in 3 5 7 9; do adb shell input tap $((W*s/10)) $Y; sleep 4; adb exec-out screencap -p > $OUT/$i-sekme.png; adb shell uiautomator dump /sdcard/u.xml >/dev/null; adb exec-out cat /sdcard/u.xml > $OUT/$i-agac.xml; i=$((i+1)); done
adb shell input tap $((W/10)) $Y; sleep 3
adb exec-out screencap -p > $OUT/8-hesap.png; adb shell uiautomator dump /sdcard/u.xml >/dev/null; adb exec-out cat /sdcard/u.xml > $OUT/8-agac.xml
adb shell input keyevent KEYCODE_BACK; sleep 2
adb exec-out screencap -p > $OUT/9-geri.png
adb logcat -d | grep -iE "chromium|AndroidRuntime|FATAL|hizirusta" | grep -viE "verbose" | tail -150 > $OUT/kayit.txt
true
