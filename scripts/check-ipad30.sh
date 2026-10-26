#!/bin/bash
# No signing identities, developer keys, portal APIs, credentials or Apple upload.
set -euo pipefail
out="$PWD/evidence/ipad30"
mkdir -p "$out"
xcode_app=$(find /Applications -maxdepth 1 -name 'Xcode_26*.app' | sort -V | tail -1)
if [ -n "$xcode_app" ]; then sudo xcode-select -s "$xcode_app/Contents/Developer"; fi
xcodebuild -version > "$out/xcode.txt"
xcrun simctl list --json runtimes > "$out/runtimes.json"
xcrun simctl list --json devicetypes > "$out/device-types.json"
command -v xcodegen >/dev/null || brew install xcodegen >/dev/null
node scripts/bundle-native.mjs ios/ElectricMan/www
(cd ios && xcodegen generate)
set +e
xcodebuild -project ios/ElectricMan.xcodeproj -scheme ElectricMan -configuration Debug \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath build/ipad30 CODE_SIGNING_ALLOWED=NO CURRENT_PROJECT_VERSION=30 \
  build > "$out/build.log" 2>&1
status=$?
set -e
grep -E 'error:|BUILD (SUCCEEDED|FAILED)' "$out/build.log" | head -30 || true
if [ "$status" != 0 ]; then exit "$status"; fi
app="$PWD/build/ipad30/Build/Products/Debug-iphonesimulator/ElectricMan.app"
ditto -c -k --sequesterRsrc --keepParent "$app" "$out/ElectricMan-build30-simulator.zip"
python3 - "$out" <<'PY'
import json,pathlib,sys
out=pathlib.Path(sys.argv[1])
runtimes=[r for r in json.loads((out/'runtimes.json').read_text())['runtimes'] if r.get('isAvailable') and r['identifier'].startswith('com.apple.CoreSimulator.SimRuntime.iOS-')]
assert runtimes,'No installed iOS simulator runtime'
runtime=max(runtimes,key=lambda r:tuple(int(n) for n in r['version'].split('.')))
types=[d for d in json.loads((out/'device-types.json').read_text())['devicetypes'] if d.get('productFamily')=='iPad']
assert types,'No installed iPad device type'
device=next((d for d in types if 'iPad Air 11-inch (M3)' in d['name']),None) or next((d for d in types if 'iPad Air' in d['name']),types[-1])
(out/'selection.json').write_text(json.dumps(dict(device=device['name'],deviceType=device['identifier'],runtime=runtime['identifier'],version=runtime['version'],unsigned=True,liveAPICalls=False,realAppleAccountLoginVerified=False),indent=2))
(out/'device-type.txt').write_text(device['identifier'])
(out/'runtime.txt').write_text(runtime['identifier'])
PY
device=$(xcrun simctl create ElectricMan-Review30 "$(cat "$out/device-type.txt")" "$(cat "$out/runtime.txt")")
trap 'xcrun simctl shutdown "$device" >/dev/null 2>&1 || true' EXIT
xcrun simctl boot "$device"
xcrun simctl bootstatus "$device" -b
xcrun simctl install "$device" "$app"
for entry in sheet:en guest:en apple:en sheet:tr; do
  mode=${entry%:*}; lang=${entry#*:}
  xcrun simctl terminate "$device" com.tusneldax.electricman >/dev/null 2>&1 || true
  xcrun simctl launch "$device" com.tusneldax.electricman \
    -emTest "$mode" -emShotLang "$lang" -emTestOffline YES
  sleep 13
  xcrun simctl io "$device" screenshot "$out/$mode-$lang.png"
done
xcrun simctl spawn "$device" log show --last 4m --style compact \
  --predicate 'eventMessage CONTAINS "EMTEST"' > "$out/ui.log"
python3 - "$out" "$app" <<'PY'
import json,pathlib,plistlib,sys,re
out=pathlib.Path(sys.argv[1]);app=pathlib.Path(sys.argv[2]);p=plistlib.loads((app/'Info.plist').read_bytes())
log=(out/'ui.log').read_text()
guest=[json.loads(m) for m in re.findall(r'guest-state (\{[^\n]+\})',log)]
checks={'build30':p['CFBundleVersion']=='30','appleButtonTapped':'clicked appleLogin' in log,'guestButtonTapped':'clicked guestPlay' in log,'guestBoardVisible':any(g.get('sheetHidden') is True and g.get('canvas') is True for g in guest),'noPageErrors':'js-error ' not in log and 'js-rejection ' not in log,'fourScreenshots':all((out/f).is_file() for f in ['sheet-en.png','guest-en.png','apple-en.png','sheet-tr.png'])}
(out/'result.json').write_text(json.dumps(dict(checks=checks,passed=all(checks.values()),bundleId=p['CFBundleIdentifier'],version=p['CFBundleShortVersionString'],build=p['CFBundleVersion'],scope='UNSIGNED_IPAD_SIMULATOR_UI_WITH_OFFLINE_API_FIXTURE',realAppleAccountLoginVerified=False,storeUpload=False),indent=2))
print(json.dumps(checks))
assert all(checks.values()),'Inspect screenshots and UI log; synthetic UI test failed'
PY
