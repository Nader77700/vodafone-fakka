#!/usr/bin/env bash
# ============================================
#  بناء APK Vodafone Fakka v3.0.95 على جهازك
#  شغّل من جذر المشروع الرئيسي
# ============================================
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

# ===== المتغيرات اللازمة =====
SUPABASE_URL="https://vchmsnavyhripakyvzom.supabase.co"
SERVICE_KEY="${SUPABASE_SERVICE_KEY:-REPLACE_WITH_SERVICE_KEY}"
KEYSTORE_PATH="${PROJECT_DIR}/android/app/vodafone-fakka-release.jks"
KEYSTORE_PASS="fakka2024vodafone"
KEY_ALIAS="vodafone-fakka"

APK_UNSIGNED="${PROJECT_DIR}/android/app/build/outputs/apk/release/app-release-unsigned.apk"
APK_SIGNED="${PROJECT_DIR}/VodafoneFakka-v3.0.95.apk"

echo "╔═════════════════════════════════════════════╗"
echo "║   بناء APK Vodafone Fakka v3.0.95 (code 139)      ║"
echo "╚═════════════════════════════════════════════╝"

# 1) بناء Vite
echo "⚙️  بناء Vite..."
cd "$PROJECT_DIR" && npx vite build --logLevel warn

# 2) مزامنة Capacitor
echo "⚙️  مزامنة Capacitor..."
npx cap sync android

# 3) إصلاح namespace (للتوافق)
echo "⚙️  إصلاح namespace..."
HTTP_GRADLE=$(find node_modules -path "*capacitor-community/http*/android/build.gradle" 2>/dev/null | head -1)
if [[ -n "$HTTP_GRADLE" && ! $(grep -c "namespace" "$HTTP_GRADLE") -gt 0 ]]; then
  sed -i "s|android {|android {\n    namespace 'com.getcapacitor.community.http'|" "$HTTP_GRADLE"
fi
HTTP_MANIFEST=$(find node_modules -path "*capacitor-community/http*/android/src/main/AndroidManifest.xml" 2>/dev/null | head -1)
[[ -n "$HTTP_MANIFEST" ]] && sed -i 's/ package="[^"]*"//' "$HTTP_MANIFEST" || true

# 4) بناء APK
echo "⚙️  بناء APK بعد زود..."
cd "$PROJECT_DIR/android"
if [[ -f "./gradlew" ]]; then
  ./gradlew assembleRelease --no-daemon
else
  echo "❌ لا يوجد gradlew! اتأكد أن Android Studio مثبت."
  exit 1
fi

# 5) توقيع APK
echo "⚙️  توقيع APK..."
if [[ ! -f "$KEYSTORE_PATH" ]]; then
  echo "❌ Keystore غير موجود في $KEYSTORE_PATH"
  echo "   أنشئه بالأمر: keytool -genkey -v -keystore $KEYSTORE_PATH -alias $KEY_ALIAS -keyalg RSA -keysize 2048 -validity 10000"
  exit 1
fi

# ابحث عن apksigner
APKSIGNER=""
for d in "$ANDROID_HOME/build-tools/"*/; do
  [[ -f "$d/apksigner" ]] && APKSIGNER="$d/apksigner" && break
done
if [[ -z "$APKSIGNER" ]]; then
  echo "❌ apksigner غير موجود. تأكد من تثبيت Android SDK build-tools."
  exit 1
fi

$APKSIGNER sign --ks "$KEYSTORE_PATH" --ks-pass "pass:$KEYSTORE_PASS" \
  --key-pass "pass:$KEYSTORE_PASS" --ks-key-alias "$KEY_ALIAS" \
  --in "$APK_UNSIGNED" --out "$APK_SIGNED"

APK_HASH=$(md5sum "$APK_SIGNED" | awk '{print $1}')
APK_SIZE=$(stat -c%s "$APK_SIGNED" 2>/dev/null || stat -f%z "$APK_SIGNED")
echo "✅ APK جاهز: $(basename "$APK_SIGNED") ($(($APK_SIZE/1024/1024)) MB)"
echo "   MD5: $APK_HASH"

# 6) رفع APK على Supabase Storage
echo "⚙️  رفع APK على Supabase Storage..."
STORAGE_FILE="VodafoneFakka-v3.0.95.apk"
curl -s -X POST "${SUPABASE_URL}/storage/v1/object/apk-releases/${STORAGE_FILE}" \
  -H "Authorization: Bearer $SERVICE_KEY" -H "apikey: $SERVICE_KEY" \
  -H "Content-Type: application/vnd.android.package-archive" \
  -H "x-upsert: true" \
  --data-binary "@$APK_SIGNED" | head -1

APK_PUBLIC_URL="${SUPABASE_URL}/storage/v1/object/public/apk-releases/${STORAGE_FILE}"

# 7) تحديث DB
echo "⚙️  تحديث DB..."
curl -s -X PATCH "${SUPABASE_URL}/rest/v1/app_versions?version=eq.3.0.95" \
  -H "Authorization: Bearer $SERVICE_KEY" -H "apikey: $SERVICE_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d "{\"apk_url\":\"$APK_PUBLIC_URL\",\"apk_hash\":\"$APK_HASH\",\"apk_size\":$APK_SIZE}"

curl -s -X PATCH "${SUPABASE_URL}/rest/v1/app_config?id=eq.1" \
  -H "Authorization: Bearer $SERVICE_KEY" -H "apikey: $SERVICE_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d "{\"version_min_supported\":139,\"version_latest_code\":139,\"version_latest_name\":\"3.0.95\",\"force_update\":true}"

echo ""
echo "═════════════════════════════════════════════════════════"
echo "✅ الإصدار جاهز!"
echo "   الإصدار: v3.0.95 (code 139)"
echo "   الملف: $APK_SIGNED"
echo "   الرابط: $APK_PUBLIC_URL"
echo "═════════════════════════════════════════════════════════"
