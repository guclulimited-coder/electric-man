#!/usr/bin/env bash
# Runs inside the emulator job: install the debug app and grab the six demo scenes per language.
set -u
PKG=com.tusneldax.electricman
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell settings put global sysui_demo_allowed 1
adb shell am broadcast -a com.android.systemui.demo -e command enter
adb shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0941
adb shell am broadcast -a com.android.systemui.demo -e command battery -e level 100 -e plugged false
adb shell am broadcast -a com.android.systemui.demo -e command network -e wifi show -e level 4
adb shell am broadcast -a com.android.systemui.demo -e command notifications -e visible false
# warm-up
adb shell am start -n $PKG/.MainActivity --ei emShot 1 --es emShotLang tr; sleep 60
for L in tr en; do
  mkdir -p shots/android/$L
  for N in 1 2 3 4 5 6; do
    adb shell am force-stop $PKG
    adb shell am start -n $PKG/.MainActivity --ei emShot $N --es emShotLang $L
    if [ $N = 3 ]; then sleep 55; else sleep 45; fi
    adb exec-out screencap -p > shots/android/$L/$N.png
    echo "::notice::android $L/$N $(stat -c %s shots/android/$L/$N.png) bytes"
  done
done
