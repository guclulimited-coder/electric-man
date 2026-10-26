#!/bin/bash
# A fresh macOS job: no running simulator, signing keys, certificates or ASC API.
set -euo pipefail
export HOMEBREW_NO_AUTO_UPDATE=1
out="$PWD/evidence/ipad30"
mkdir -p "$out"
xcode_app=$(find /Applications -maxdepth 1 -name 'Xcode_26*.app' | sort -V | tail -1)
if [ -n "$xcode_app" ]; then sudo xcode-select -s "$xcode_app/Contents/Developer"; fi
xcodebuild -version > "$out/xcode.txt"
command -v xcodegen >/dev/null || brew install xcodegen >/dev/null
node scripts/bundle-native.mjs ios/ElectricMan/www
(cd ios && xcodegen generate)
set +e
xcodebuild -project ios/ElectricMan.xcodeproj -scheme ElectricMan -configuration Release \
  -destination 'generic/platform=iOS' -derivedDataPath build/archive30 \
  -archivePath build/ElectricMan30.xcarchive -jobs 2 CODE_SIGNING_ALLOWED=NO \
  CURRENT_PROJECT_VERSION=30 archive > "$out/archive.log" 2>&1
status=$?
set -e
grep -E 'error:|ARCHIVE (SUCCEEDED|FAILED)' "$out/archive.log" | head -30 || true
if [ "$status" != 0 ]; then exit "$status"; fi
ditto -c -k --sequesterRsrc --keepParent build/ElectricMan30.xcarchive "$out/ElectricMan-build30-unsigned-archive.zip"
python3 - "$out" <<'PY'
import json,pathlib,sys,plistlib,hashlib,os
out=pathlib.Path(sys.argv[1]);archive=pathlib.Path('build/ElectricMan30.xcarchive')
info=plistlib.loads((archive/'Products/Applications/ElectricMan.app/Info.plist').read_bytes())
assert info['CFBundleVersion']=='30'
artifact=out/'ElectricMan-build30-unsigned-archive.zip'
(out/'archive-result.json').write_text(json.dumps(dict(passed=True,scope='UNSIGNED_RELEASE_IPHONEOS_ARCHIVE',commit=os.environ.get('GITHUB_SHA'),bundleId=info['CFBundleIdentifier'],version=info['CFBundleShortVersionString'],build=info['CFBundleVersion'],unsigned=True,storeUpload=False,realAppleAccountLoginVerified=False,bytes=artifact.stat().st_size,sha256=hashlib.sha256(artifact.read_bytes()).hexdigest()),indent=2))
PY
