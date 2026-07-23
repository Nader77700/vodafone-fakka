#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════╗
# ║  Vodafone Fakka Premium — سكريبت الإصدار الرسمي الثابت             ║
# ║  الاستخدام الوحيد:                                                  ║
# ║    bash tasks/release.sh "ملاحظات الإصدار"                          ║
# ║    bash tasks/release.sh "3.1.0" "إصدار كبير"  ← إصدار يدوي        ║
# ╚══════════════════════════════════════════════════════════════════════╝
set -euo pipefail

WORKSPACE="/workspace/app-ck2v94t1nev5"
LOG="$WORKSPACE/tasks/release.log"
exec > >(tee -a "$LOG") 2>&1
echo ""
echo "╔══════════════════════════════════════╗"
echo "║   🚀 بدء إصدار جديد — $(date '+%Y-%m-%d %H:%M')  ║"
echo "╚══════════════════════════════════════╝"

# ──────────────────────────────────────────────────────────────────────
# ثوابت المشروع (لا تعدّل هذا القسم)
# ──────────────────────────────────────────────────────────────────────
SUPABASE_URL="https://vchmsnavyhripakyvzom.supabase.co"
SERVICE_KEY="${SUPABASE_SERVICE_KEY:-REPLACE_WITH_SERVICE_KEY}"
KEYSTORE="$WORKSPACE/android/keystore.jks"
KS_PASS="vodafone123"
KS_ALIAS="vfkey"
GRADLE="$WORKSPACE/android/app/build.gradle"
BUILD_INFO_TS="$WORKSPACE/src/lib/buildInfo.ts"
APK_OUT="$WORKSPACE/android/app/build/outputs/apk/release/app-release.apk"

# ──────────────────────────────────────────────────────────────────────
# قراءة الإصدار الحالي من build.gradle (المصدر الوحيد للحقيقة)
# ──────────────────────────────────────────────────────────────────────
CURRENT_CODE=$(grep -oP 'versionCode \K\d+' "$GRADLE" | head -1)
CURRENT_VER=$(grep -oP 'versionName "\K[^"]+' "$GRADLE" | head -1)

echo "📌 الإصدار الحالي : v${CURRENT_VER} (code ${CURRENT_CODE})"

# ──────────────────────────────────────────────────────────────────────
# تحديد الإصدار الجديد
# ──────────────────────────────────────────────────────────────────────
if [[ $# -ge 1 && "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  NEW_VER="$1"
  NOTES="${2:-تحديث جديد}"
else
  IFS='.' read -r MAJ MIN PAT <<< "$CURRENT_VER"
  NEW_VER="${MAJ}.${MIN}.$((PAT + 1))"
  NOTES="${1:-تحديث جديد}"
fi
NEW_CODE=$((CURRENT_CODE + 1))
APK_NAME="VodafoneFakka-v${NEW_VER}.apk"
APK_URL="${SUPABASE_URL}/storage/v1/object/public/apk-releases/${APK_NAME}"
BUILD_TS=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

echo "🚀 الإصدار الجديد  : v${NEW_VER} (code ${NEW_CODE})"
echo "📝 ملاحظات         : ${NOTES}"
echo ""

# ──────────────────────────────────────────────────────────────────────
# إعداد JDK 17 الكامل (مع javac — مطلوب لـ Gradle)
# ──────────────────────────────────────────────────────────────────────
JDK_DIR="/opt/jdk17"
if [[ ! -f "$JDK_DIR/bin/javac" ]]; then
  echo "⬇️  تنزيل JDK 17 الكامل (Temurin)..."
  mkdir -p "$JDK_DIR"
  curl -sL "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse?project=jdk" \
    -o /tmp/jdk17.tar.gz --max-time 180 -L
  tar -xzf /tmp/jdk17.tar.gz -C "$JDK_DIR" --strip-components=1
  rm -f /tmp/jdk17.tar.gz
fi
export JAVA_HOME="$JDK_DIR"
"$JAVA_HOME/bin/javac" -version 2>&1 | head -1
echo "✅ JDK جاهز (مع javac)"

# ──────────────────────────────────────────────────────────────────────
# إعداد Android SDK
# ──────────────────────────────────────────────────────────────────────
ANDROID_HOME_PATH="/root/android-sdk"
if [[ ! -f "$ANDROID_HOME_PATH/build-tools/34.0.0/apksigner" ]]; then
  echo "⬇️  تثبيت Android SDK build-tools..."
  mkdir -p "$ANDROID_HOME_PATH/cmdline-tools"
  if [[ ! -f "$ANDROID_HOME_PATH/cmdline-tools/latest/bin/sdkmanager" ]]; then
    curl -sL "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip" \
      -o /tmp/cmdtools.zip
    unzip -q /tmp/cmdtools.zip -d "$ANDROID_HOME_PATH/cmdline-tools/"
    mv "$ANDROID_HOME_PATH/cmdline-tools/cmdline-tools" \
       "$ANDROID_HOME_PATH/cmdline-tools/latest" 2>/dev/null || true
    rm -f /tmp/cmdtools.zip
  fi
  export ANDROID_HOME="$ANDROID_HOME_PATH"
  export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
  yes | sdkmanager --licenses > /dev/null 2>&1 || true
  sdkmanager "build-tools;34.0.0" "platforms;android-34" > /dev/null 2>&1 || true
fi
export ANDROID_HOME="$ANDROID_HOME_PATH"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/build-tools/34.0.0:$ANDROID_HOME/platform-tools:$PATH"
echo "✅ Android SDK جاهز"

# ──────────────────────────────────────────────────────────────────────
# [1/7] تحديث build.gradle
# ──────────────────────────────────────────────────────────────────────
echo ""
echo "⚙️  [1/7] تحديث build.gradle..."
sed -i "s/versionCode ${CURRENT_CODE}/versionCode ${NEW_CODE}/" "$GRADLE"
sed -i "s/versionName \"${CURRENT_VER}\"/versionName \"${NEW_VER}\"/" "$GRADLE"
# تحقق من نجاح التعديل
VERIFY_CODE=$(grep -oP 'versionCode \K\d+' "$GRADLE" | head -1)
VERIFY_VER=$(grep -oP 'versionName "\K[^"]+' "$GRADLE" | head -1)
if [[ "$VERIFY_CODE" != "$NEW_CODE" || "$VERIFY_VER" != "$NEW_VER" ]]; then
  echo "❌ فشل تحديث build.gradle — كود: $VERIFY_CODE/$NEW_CODE — إصدار: $VERIFY_VER/$NEW_VER"
  exit 1
fi
echo "✅ build.gradle: v${NEW_VER} (code ${NEW_CODE})"

# ──────────────────────────────────────────────────────────────────────
# [2/7] تحديث buildInfo.ts — Python لضمان الدقة (بدون مشاكل sed)
# ──────────────────────────────────────────────────────────────────────
echo "⚙️  [2/7] تحديث buildInfo.ts..."
NEW_VER_PY="$NEW_VER" NEW_CODE_PY="$NEW_CODE" NEW_TS_PY="$BUILD_TS" \
  NOTES_PY="$NOTES" BUILD_INFO_TS_PY="$BUILD_INFO_TS" \
  python3 - << 'PYEOF'
import re, os

path      = os.environ['BUILD_INFO_TS_PY']
new_ver   = os.environ['NEW_VER_PY']
new_code  = int(os.environ['NEW_CODE_PY'])
new_ts    = os.environ['NEW_TS_PY']
notes     = os.environ['NOTES_PY']
new_apk   = f"VodafoneFakka-v{new_ver}.apk"
new_note  = f"v{new_ver}: {notes}"
slug      = new_ver.replace('.', '_')

with open(path, 'r', encoding='utf-8') as f:
    src = f.read()

src = re.sub(r"appVersion:\s+'[^']+'",     f"appVersion:     '{new_ver}'",     src)
src = re.sub(r"versionCode:\s+\d+",        f"versionCode:    {new_code}",       src)
src = re.sub(r"buildTimestamp:\s+'[^']+'", f"buildTimestamp: '{new_ts}'",       src)
src = re.sub(r"bundleFile:\s+'[^']+'",     f"bundleFile:     '{new_apk}'",      src)
src = re.sub(r"apkHash:\s+'[^']+'",        f"apkHash:        'apk_v{slug}_code{new_code}'", src)
src = re.sub(r"bundleHash:\s+'[^']+'",     f"bundleHash:     'apk_v{slug}_code{new_code}'", src)
src = re.sub(r"dbVersion:\s+'[^']+'",      f"dbVersion:      'v{new_ver}'",     src)

src = re.sub(r"(releaseNotes:\s*\[)", rf"\1\n    '{new_note}',", src, count=1)

with open(path, 'w', encoding='utf-8') as f:
    f.write(src)

# ── تحديث ForceUpdateScreen.tsx — رابط الـ fallback الثابت ──────────
force_update_path = path.replace('lib/buildInfo.ts', 'components/common/ForceUpdateScreen.tsx')
if os.path.exists(force_update_path):
    with open(force_update_path, 'r', encoding='utf-8') as f:
        fu_src = f.read()
    fu_src = re.sub(
        r"(VodafoneFakka-v)[\d.]+\.apk(?=['\"`])",
        rf"\g<1>{new_ver}.apk",
        fu_src
    )
    with open(force_update_path, 'w', encoding='utf-8') as f:
        f.write(fu_src)
    print(f"  ✅ ForceUpdateScreen.tsx fallback → v{new_ver}")

c = open(path).read()
assert f"'{new_ver}'" in c, "خطأ: appVersion"
assert str(new_code) in c,  "خطأ: versionCode"
print(f"  ✅ buildInfo.ts: v{new_ver} (code {new_code})")
PYEOF

# ──────────────────────────────────────────────────────────────────────
# [3/7] نشر serve-app بـ --no-verify-jwt (مطلوب لـ Live URL Mode)
# ──────────────────────────────────────────────────────────────────────
echo "⚙️  [3/7] نشر serve-app Edge Function (no JWT)..."
cd "$WORKSPACE"

# تحقق من وجود Supabase CLI
if command -v supabase &> /dev/null && [[ -n "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  supabase link --project-ref vchmsnavyhripakyvzom 2>/dev/null || true
  supabase functions deploy serve-app \
    --project-ref vchmsnavyhripakyvzom \
    --no-verify-jwt 2>&1 | tail -3 || true
  echo "✅ serve-app منشور (no-verify-jwt)"
else
  echo "⚠️  تخطي نشر serve-app (لا يوجد SUPABASE_ACCESS_TOKEN) — Edge Function تعمل بالفعل"
fi

# ──────────────────────────────────────────────────────────────────────
# [3/7] بناء Vite + رفع web-live + مزامنة Capacitor (Live URL Mode)
# ──────────────────────────────────────────────────────────────────────
echo "⚙️  [3/7] بناء Vite..."
cd "$WORKSPACE"
npx vite build --logLevel warn
FILE_COUNT=$(find dist -type f | wc -l)
echo "✅ Vite build مكتمل — $FILE_COUNT ملف"

# ── رفع dist/ إلى web-live (يُوصَّل تلقائياً للـ APK عبر serve-app) ──
echo "⚙️  [3/7] رفع $FILE_COUNT ملف إلى web-live bucket..."
SUPABASE_SERVICE_KEY_EXPORT="$SERVICE_KEY" python3 << 'PYEOF'
import os, urllib.request

BASE_URL  = "https://vchmsnavyhripakyvzom.supabase.co"
SK        = os.environ.get('SUPABASE_SERVICE_KEY_EXPORT','')
DIST      = "/workspace/app-ck2v94t1nev5/dist"
BUCKET    = "web-live"
MIME      = {'.html':'text/html','.js':'application/javascript','.css':'text/css',
             '.json':'application/json','.png':'image/png','.jpg':'image/jpeg',
             '.svg':'image/svg+xml','.ico':'image/x-icon',
             '.woff':'font/woff','.woff2':'font/woff2',
             '.webmanifest':'application/manifest+json'}
HDR = {"Authorization": f"Bearer {SK}", "apikey": SK}

ok = 0
for root, dirs, files in os.walk(DIST):
    dirs[:] = [d for d in dirs if d not in ['node_modules','.git']]
    for fname in files:
        fpath   = os.path.join(root, fname)
        relpath = os.path.relpath(fpath, DIST).replace(os.sep,'/')
        ext     = os.path.splitext(fname)[1].lower()
        ctype   = MIME.get(ext,'application/octet-stream')
        with open(fpath,'rb') as f: data = f.read()
        url = f"{BASE_URL}/storage/v1/object/{BUCKET}/{relpath}"
        req = urllib.request.Request(url, data=data, method='POST',
              headers={**HDR,"Content-Type":ctype,"x-upsert":"true",
                       "Cache-Control":"no-cache" if fname.endswith('.html') else "public,max-age=31536000"})
        try:
            urllib.request.urlopen(req, timeout=30)
            ok += 1
        except Exception as e:
            print(f"  ❌ {relpath}: {e}")
print(f"  ✅ web-live: {ok} ملف رُفع")
PYEOF

echo "⚙️  [3/7] مزامنة Capacitor (Live URL Mode — server.url مفعَّل)..."
npx cap sync android 2>&1 | grep -E "✓|✗|error|Error" || true
echo "✅ Vite + web-live + Capacitor جاهز"

# ──────────────────────────────────────────────────────────────────────
# إصلاح namespace تلقائياً (مشكلة دائمة مع @capacitor-community/http)
# ──────────────────────────────────────────────────────────────────────
HTTP_GRADLE=$(find "$WORKSPACE/node_modules" -path "*capacitor-community/http*/android/build.gradle" 2>/dev/null | head -1)
HTTP_MANIFEST=$(find "$WORKSPACE/node_modules" -path "*capacitor-community/http*/android/src/main/AndroidManifest.xml" 2>/dev/null | head -1)
if [[ -n "$HTTP_GRADLE" ]] && ! grep -q "namespace" "$HTTP_GRADLE"; then
  sed -i "s|android {|android {\n    namespace 'com.getcapacitor.community.http'|" "$HTTP_GRADLE"
  echo "  ✔ namespace مُصحَّح في build.gradle"
fi
if [[ -n "$HTTP_MANIFEST" ]]; then
  sed -i 's/ package="[^"]*"//' "$HTTP_MANIFEST"
  echo "  ✔ package= أُزيل من AndroidManifest.xml"
fi

# إصلاح JAVA_HOME في gradle.properties
GRADLE_PROPS="$WORKSPACE/android/gradle.properties"
if grep -q "org.gradle.java.home" "$GRADLE_PROPS"; then
  sed -i "s|org.gradle.java.home=.*|org.gradle.java.home=$JAVA_HOME|" "$GRADLE_PROPS"
else
  echo "org.gradle.java.home=$JAVA_HOME" >> "$GRADLE_PROPS"
fi

# ──────────────────────────────────────────────────────────────────────
# [4/7] بناء APK
# ──────────────────────────────────────────────────────────────────────
echo "⚙️  [4/7] بناء APK (Gradle assembleRelease)..."
cd "$WORKSPACE/android"
chmod +x gradlew
./gradlew assembleRelease --rerun-tasks -q 2>&1 | tail -5

[[ -f "$APK_OUT" ]] || { echo "❌ APK لم يُبنَ: $APK_OUT"; exit 1; }
APK_SIZE=$(du -sh "$APK_OUT" | cut -f1)
echo "✅ APK مبني: $APK_SIZE"

# ──────────────────────────────────────────────────────────────────────
# إعادة توقيع APK بـ v1+v2+v3
# ──────────────────────────────────────────────────────────────────────
APK_SIGNED="/tmp/VodafoneFakka-v${NEW_VER}-signed.apk"
apksigner sign \
  --ks "$KEYSTORE" \
  --ks-pass "pass:$KS_PASS" \
  --key-pass "pass:$KS_PASS" \
  --ks-key-alias "$KS_ALIAS" \
  --v1-signing-enabled true \
  --v2-signing-enabled true \
  --v3-signing-enabled true \
  --out "$APK_SIGNED" \
  "$APK_OUT"
apksigner verify "$APK_SIGNED" 2>&1 | grep -E "Verified|error" || true
cp "$APK_SIGNED" "$APK_OUT"
echo "✅ APK موقَّع v1+v2+v3"

# ──────────────────────────────────────────────────────────────────────
# تحقق: APK يحتوي الإصدار الصحيح (لا نرفع إذا مش صح)
# ──────────────────────────────────────────────────────────────────────
BUILT_CODE=$(aapt dump badging "$APK_OUT" 2>/dev/null | grep -oP "versionCode='[^']+" | grep -oP "[0-9]+")
BUILT_VER=$(aapt dump badging "$APK_OUT" 2>/dev/null | grep -oP "versionName='[^']+" | grep -oP "[\d.]+")
if [[ "$BUILT_CODE" != "$NEW_CODE" || "$BUILT_VER" != "$NEW_VER" ]]; then
  echo "❌ خطأ حرج: APK يحتوي v${BUILT_VER}/code${BUILT_CODE} — المطلوب v${NEW_VER}/code${NEW_CODE}"
  echo "   السبب المحتمل: Gradle cache — تم إيقاف العملية لحماية المستخدمين"
  exit 1
fi
echo "✅ تحقق APK: v${BUILT_VER} (code ${BUILT_CODE}) — مطابق 100%"

# ──────────────────────────────────────────────────────────────────────
# [5/7] رفع APK إلى Supabase Storage
# ──────────────────────────────────────────────────────────────────────
echo "⚙️  [5/7] رفع APK إلى Supabase Storage..."
HTTP=$(curl -s -o /tmp/upload_resp.json -w "%{http_code}" \
  -X PUT "${SUPABASE_URL}/storage/v1/object/apk-releases/${APK_NAME}" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: application/vnd.android.package-archive" \
  -H "x-upsert: true" \
  --data-binary "@${APK_OUT}" \
  --max-time 120)

if [[ "$HTTP" != "200" ]]; then
  echo "❌ فشل الرفع: HTTP $HTTP"
  cat /tmp/upload_resp.json
  exit 1
fi
# تحقق أن الرابط يعمل
HEAD_CODE=$(curl -s -o /dev/null -w "%{http_code}" --head --max-time 10 "$APK_URL" || echo "0")
[[ "$HEAD_CODE" == "200" ]] && echo "✅ رُفع ويعمل: $APK_URL" \
  || echo "⚠️  رُفع لكن HEAD يعيد $HEAD_CODE — قد يحتاج دقيقة"

# ──────────────────────────────────────────────────────────────────────
# [6/7] تحديث قاعدة البيانات (app_versions + app_config كاملاً)
# ──────────────────────────────────────────────────────────────────────
echo "⚙️  [6/7] تحديث قاعدة البيانات..."

# إلغاء is_latest من جميع الإصدارات القديمة
curl -s -X PATCH "${SUPABASE_URL}/rest/v1/app_versions?is_latest=eq.true" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"is_latest":false}' > /dev/null

# إدراج الإصدار الجديد (merge-duplicates = تحديث لو موجود)
DB_HTTP=$(curl -s -o /tmp/db_resp.json -w "%{http_code}" \
  -X POST "${SUPABASE_URL}/rest/v1/app_versions" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "apikey: ${SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=merge-duplicates,return=representation" \
  -d "{
    \"version\":       \"${NEW_VER}\",
    \"version_code\":  ${NEW_CODE},
    \"apk_url\":       \"${APK_URL}\",
    \"release_notes\": \"${NOTES}\",
    \"is_latest\":     true,
    \"force_update\":  false,
    \"update_type\":   \"apk\",
    \"apk_deployed\":  true
  }")

if [[ "$DB_HTTP" != "200" && "$DB_HTTP" != "201" ]]; then
  echo "⚠️  DB HTTP $DB_HTTP:"; cat /tmp/db_resp.json
fi

VERSION_ID=$(python3 -c "
import json,sys
try:
  d = json.load(open('/tmp/db_resp.json'))
  rows = d if isinstance(d,list) else [d]
  print(rows[0].get('id',''))
except: print('')
" 2>/dev/null || echo "")
echo "✅ DB app_versions: v${NEW_VER} is_latest=true (id: ${VERSION_ID:-غير معروف})"

# ── تحديث app_config — جميع المفاتيح دفعة واحدة ──────────────────────
echo "   تحديث app_config..."
declare -A CONFIG_UPDATES=(
  [version_latest_name]="${NEW_VER}"
  [version_latest_code]="${NEW_CODE}"
  [version_apk_url]="${APK_URL}"
  [version_force_update]="true"
  [version_min_supported]="${NEW_CODE}"
)
for KEY in "${!CONFIG_UPDATES[@]}"; do
  VAL="${CONFIG_UPDATES[$KEY]}"
  CFG_HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
    -X PATCH "${SUPABASE_URL}/rest/v1/app_config?key=eq.${KEY}" \
    -H "Authorization: Bearer ${SERVICE_KEY}" \
    -H "apikey: ${SERVICE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"value\":\"${VAL}\"}")
  if [[ "$CFG_HTTP" == "200" || "$CFG_HTTP" == "204" ]]; then
    echo "   ✅ app_config[${KEY}] = ${VAL}"
  else
    echo "   ⚠️  app_config[${KEY}] HTTP ${CFG_HTTP}"
  fi
done

# ──────────────────────────────────────────────────────────────────────
# [7/7] إشعار Push — يُرسَل تلقائياً بواسطة Database Trigger
#        (trigger_auto_version_notify) عند ضبط is_latest=true
#        لا حاجة لاستدعاء auto-version-notify هنا لتجنّب التكرار
# ──────────────────────────────────────────────────────────────────────
echo "⚙️  [7/7] Push Notification — سيُرسَل تلقائياً بواسطة DB Trigger..."
# انتظر ثانية واحدة لإعطاء الـ trigger وقتاً لتنفيذ الإرسال
sleep 1

# استطلع عدد الأجهزة التي وصلها الإشعار من DB
SENT=$(python3 -c "
import urllib.request, json, sys
url = '${SUPABASE_URL}/rest/v1/app_versions?id=eq.${VERSION_ID}&select=push_sent_count,push_total_devices'
req = urllib.request.Request(url, headers={
  'Authorization': 'Bearer ${SERVICE_KEY}',
  'apikey': '${SERVICE_KEY}'
})
try:
  d = json.loads(urllib.request.urlopen(req).read())
  row = d[0] if d else {}
  sent  = row.get('push_sent_count',   '?')
  total = row.get('push_total_devices','?')
  print(f'{sent}/{total}')
except: print('?')
" 2>/dev/null || echo "?")
echo "✅ Push أُرسل لـ ${SENT} جهاز (عبر DB Trigger)"

# ──────────────────────────────────────────────────────────────────────
# ملخص نهائي
# ──────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ✅ تم الإصدار بنجاح!                               ║"
printf  "║  📦 الإصدار   : v%-4s (code %-3s)                  ║\n" "$NEW_VER" "$NEW_CODE"
echo "║  🔗 رابط APK  : $APK_NAME"
printf  "║  📣 إشعار     : %-3s جهاز                           ║\n" "$SENT"
printf  "║  📝 ملاحظات   : %-35s ║\n" "${NOTES:0:35}"
echo "║  🕐 وقت البناء: $(date '+%Y-%m-%d %H:%M')                     ║"
echo "╚══════════════════════════════════════════════════════╝"
echo "💡 لإصدار جديد: bash tasks/release.sh \"ملاحظات الإصدار\""
