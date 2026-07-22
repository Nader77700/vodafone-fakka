#!/bin/bash
cd /workspace/app-ck2v94t1nev5
GRADLE="android/app/build.gradle"
sed -i "s/versionCode 326/versionCode 327/" "$GRADLE"
sed -i "s/versionName \"3.0.326\"/versionName \"3.0.327\"/" "$GRADLE"

python3 - << 'PYEOF'
import re
path = 'src/lib/buildInfo.ts'
with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

src = re.sub(r"appVersion:\s+'[^']+'",     "appVersion:     '3.0.327'",     src)
src = re.sub(r"versionCode:\s+\d+",        "versionCode:    327",       src)
src = re.sub(r"bundleFile:\s+'[^']+'",     "bundleFile:     'VodafoneFakka-v3.0.327.apk'",      src)
src = re.sub(r"apkHash:\s+'[^']+'",        "apkHash:        'apk_v3_0_327_code327'", src)
src = re.sub(r"bundleHash:\s+'[^']+'",     "bundleHash:     'apk_v3_0_327_code327'", src)
src = re.sub(r"dbVersion:\s+'[^']+'",      "dbVersion:      'v3.0.327'",     src)

new_note = "v3.0.327: إصدار أمني حاسم - إزالة شفرة الشحن المباشر من التطبيق، ونقل العمليات بالكامل للسيرفر (Zero Trust) مع حظر النسخ المهكرة وإجبارها على التحديث"
src = re.sub(r"(releaseNotes:\s*\[)", rf"\1\n    '{new_note}',", src, count=1)

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)
PYEOF
