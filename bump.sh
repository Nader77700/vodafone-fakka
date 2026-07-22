#!/usr/bin/env bash
set -euo pipefail
WORKSPACE="/workspace/app-ck2v94t1nev5"
GRADLE="$WORKSPACE/android/app/build.gradle"
BUILD_INFO_TS="$WORKSPACE/src/lib/buildInfo.ts"
CURRENT_CODE=$(grep -oP 'versionCode \K\d+' "$GRADLE" | head -1)
CURRENT_VER=$(grep -oP 'versionName "\K[^"]+' "$GRADLE" | head -1)
IFS='.' read -r MAJ MIN PAT <<< "$CURRENT_VER"
NEW_VER="${MAJ}.${MIN}.$((PAT + 1))"
NOTES="تحديث هام: معالجة مشكلة تفعيل فليكس وإظهار الأخطاء الحقيقية من فودافون بدلاً من رسائل النجاح الوهمية"
NEW_CODE=$((CURRENT_CODE + 1))
BUILD_TS=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
sed -i "s/versionCode ${CURRENT_CODE}/versionCode ${NEW_CODE}/" "$GRADLE"
sed -i "s/versionName \"${CURRENT_VER}\"/versionName \"${NEW_VER}\"/" "$GRADLE"
NEW_VER_PY="$NEW_VER" NEW_CODE_PY="$NEW_CODE" NEW_TS_PY="$BUILD_TS" NOTES_PY="$NOTES" BUILD_INFO_TS_PY="$BUILD_INFO_TS" python3 - << 'PYEOF'
import re, os
path = os.environ['BUILD_INFO_TS_PY']
new_ver = os.environ['NEW_VER_PY']
new_code = int(os.environ['NEW_CODE_PY'])
new_ts = os.environ['NEW_TS_PY']
notes = os.environ['NOTES_PY']
new_apk = f"VodafoneFakka-v{new_ver}.apk"
new_note = f"v{new_ver}: {notes}"
slug = new_ver.replace('.', '_')
with open(path, 'r', encoding='utf-8') as f: src = f.read()
src = re.sub(r"appVersion:\s+'[^']+'", f"appVersion:     '{new_ver}'", src)
src = re.sub(r"versionCode:\s+\d+", f"versionCode:    {new_code}", src)
src = re.sub(r"buildTimestamp:\s+'[^']+'", f"buildTimestamp: '{new_ts}'", src)
src = re.sub(r"bundleFile:\s+'[^']+'", f"bundleFile:     '{new_apk}'", src)
src = re.sub(r"apkHash:\s+'[^']+'", f"apkHash:        'apk_v{slug}_code{new_code}'", src)
src = re.sub(r"bundleHash:\s+'[^']+'", f"bundleHash:     'apk_v{slug}_code{new_code}'", src)
src = re.sub(r"dbVersion:\s+'[^']+'", f"dbVersion:      'v{new_ver}'", src)
src = re.sub(r"(releaseNotes:\s*\[)", rf"\1\n    '{new_note}',", src, count=1)
with open(path, 'w', encoding='utf-8') as f: f.write(src)
PYEOF
