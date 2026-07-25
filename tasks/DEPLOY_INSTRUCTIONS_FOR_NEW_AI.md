# 📋 تعليمات النشر والتحديث — Vodafone Fakka Premium
# ══════════════════════════════════════════════════════
# هذا الملف يشرح للـ AI الجديد كيف يحدث التطبيق بالكامل
# ══════════════════════════════════════════════════════

## 🔑 معلومات المشروع (لا تتغير أبداً)

```
SUPABASE_URL  = https://vchmsnavyhripakyvzom.supabase.co
SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjaG1zbmF2eWhyaXBha3l2em9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyODc4NTUsImV4cCI6MjA5Nzg2Mzg1NX0.pnqdmg5BApYx3HAPWR2UFhuV5ewyayvKR_dZk8of4s8
SERVICE_KEY   = ${SUPABASE_SERVICE_KEY:-REPLACE_WITH_SERVICE_KEY}
```

> ⚠️ الـ WORKSPACE بيتغير حسب app_id بتاع المشروع الجديد  
> مثال: `/workspace/app-cp9rof0XXXXX`

---

## 📁 الملفات المهمة

| الملف | الوظيفة |
|-------|---------|
| `src/lib/buildInfo.ts` | رقم الإصدار (versionCode + appVersion) |
| `.env` | متغيرات Supabase |
| `tasks/deploy-web.sh` | سكريبت النشر الكامل |
| `supabase/migrations/` | كل migrations قاعدة البيانات (84+ ملف) |

---

## 🚀 خطوات التحديث الكاملة (افعلها بالترتيب)

### الخطوة 1️⃣ — تحديث buildInfo.ts

الملف موجود في: `src/lib/buildInfo.ts`

```typescript
export const BUILD_INFO = {
  appVersion:     '3.0.XX',     // ← زوّد رقم الإصدار
  versionCode:    XXX,          // ← زوّد رقم الكود (+1 من آخر رقم)
  buildTimestamp: '2026-XX-XXTXX:XX:XXZ',
  sourceHash:     'b7c3d4e5f6a71829',
  bundleFile:     'VodafoneFakka-v3.0.XX.apk',
  bundleHash:     'apk_v3_0_XX_codeXXX',
  apkHash:        'apk_v3_0_XX_codeXXX',
  dbVersion:      'v3.0.XX',
  releaseNotes: [
    'v3.0.XX: وصف التغييرات الجديدة',
    // ... باقي السجل يبقى زي ما هو
  ],
  // ... باقي الخصائص تبقى زي ما هي
};
```

> آخر versionCode كان: **161** — الجديد يبدأ من **162**

### الخطوة 2️⃣ — بناء Vite

```bash
cd /workspace/YOUR_APP_ID
npx vite build --logLevel warn
```

### الخطوة 3️⃣ — رفع الملفات لـ Supabase Storage

**أنشئ ملف** `tasks/deploy-web.sh` بالمحتوى ده بالضبط (غيّر WORKSPACE بـ app_id الصح):

```bash
#!/usr/bin/env bash
set -euo pipefail

WORKSPACE="/workspace/YOUR_APP_ID_HERE"
SUPABASE_URL="https://vchmsnavyhripakyvzom.supabase.co"
SERVICE_KEY="${SUPABASE_SERVICE_KEY:-REPLACE_WITH_SERVICE_KEY}"
DIST_DIR="$WORKSPACE/dist"
LIVE_URL="${SUPABASE_URL}/storage/v1/object/public/web-live/index.html"

echo "⚙️  [1/3] بناء Vite..."
cd "$WORKSPACE"
npx vite build --logLevel warn
echo "✅ Vite build مكتمل — $(find $DIST_DIR -type f | wc -l) ملف"

echo "⚙️  [2/3] رفع index.html..."
INDEX_HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
  -X PUT "${SUPABASE_URL}/storage/v1/object/web-live/index.html" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: text/html; charset=utf-8" \
  -H "Cache-Control: no-cache, no-store, must-revalidate" \
  -H "x-upsert: true" \
  --data-binary "@${DIST_DIR}/index.html" \
  --max-time 30)
echo "  ✅ index.html (HTTP $INDEX_HTTP)"

upload_file() {
  local LOCAL_PATH="$1"
  local REL_PATH="${LOCAL_PATH#$DIST_DIR/}"
  local MIME="application/octet-stream"
  case "$REL_PATH" in
    *.html)       MIME="text/html; charset=utf-8" ;;
    *.js)         MIME="application/javascript; charset=utf-8" ;;
    *.css)        MIME="text/css; charset=utf-8" ;;
    *.json)       MIME="application/json" ;;
    *.svg)        MIME="image/svg+xml" ;;
    *.png)        MIME="image/png" ;;
    *.jpg|*.jpeg) MIME="image/jpeg" ;;
    *.webp)       MIME="image/webp" ;;
    *.ico)        MIME="image/x-icon" ;;
    *.woff)       MIME="font/woff" ;;
    *.woff2)      MIME="font/woff2" ;;
  esac
  local HTTP
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
    -X PUT "${SUPABASE_URL}/storage/v1/object/web-live/${REL_PATH}" \
    -H "Authorization: Bearer ${SERVICE_KEY}" \
    -H "Content-Type: ${MIME}" \
    -H "Cache-Control: public, max-age=31536000, immutable" \
    -H "x-upsert: true" \
    --data-binary "@${LOCAL_PATH}" \
    --max-time 60)
  [[ "$HTTP" == "200" ]] && echo "  ✅ $REL_PATH" || { echo "  ❌ فشل: $REL_PATH (HTTP $HTTP)"; return 1; }
}

echo "⚙️  رفع باقي الملفات..."
TOTAL=0; FAILED=0
while IFS= read -r FILE; do
  upload_file "$FILE" && TOTAL=$((TOTAL+1)) || FAILED=$((FAILED+1))
done < <(find "$DIST_DIR" -type f ! -name "index.html")

echo "  📊 رُفع: $TOTAL ملف — فشل: $FAILED ملف"

echo "⚙️  [3/3] التحقق من Live URL..."
sleep 2
LIVE_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --head --max-time 15 "$LIVE_URL" || echo "0")
echo "Live URL HTTP: $LIVE_HTTP"
[[ "$LIVE_HTTP" == "200" ]] && echo "✅ النشر ناجح!" || echo "⚠️  تحقق يدوياً"
```

ثم شغّله:
```bash
bash tasks/deploy-web.sh
```

### الخطوة 4️⃣ — تحديث قاعدة البيانات

```bash
curl -s -X POST "https://vchmsnavyhripakyvzom.supabase.co/rest/v1/app_versions" \
  -H "apikey: ${SUPABASE_SERVICE_KEY:-REPLACE_WITH_SERVICE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY:-REPLACE_WITH_SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "3.0.XX",
    "version_code": XXX,
    "apk_url": "",
    "release_notes": "وصف التحديث",
    "is_latest": true,
    "update_type": "web"
  }'
```

---

## 📊 حالة الإصدارات

| الرقم | versionCode | الحالة |
|-------|------------|--------|
| آخر إصدار | **161** | ✅ نشط الآن |
| الجديد | **162+** | ⏳ القادم |

---

## ⚠️ قواعد مهمة

1. **لا تحذف migrations** — كل ملف في `supabase/migrations/` ضروري
2. **لا تغير Supabase credentials** — كلها مربوطة بنفس المشروع
3. **buildInfo.ts** — versionCode يرتفع دايماً +1 ولا يتكرر
4. **بعد كل تعديل** — شغّل `bash tasks/deploy-web.sh` عشان يتحدث فوراً
5. **الـ .env** يجب يحتوي:
   ```
   VITE_SUPABASE_URL=https://vchmsnavyhripakyvzom.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjaG1zbmF2eWhyaXBha3l2em9tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyODc4NTUsImV4cCI6MjA5Nzg2Mzg1NX0.pnqdmg5BApYx3HAPWR2UFhuV5ewyayvKR_dZk8of4s8
   VITE_APP_VERSION=3.0.94
   VITE_APP_ID=app-ck2v94t1nev5
   ```

---

## 🌐 روابط مهمة

- **Live Web URL**: `https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/web-live/index.html`
- **Supabase Dashboard**: `https://supabase.com/dashboard/project/vchmsnavyhripakyvzom`
- **App ID الأصلي**: `app-ck2v94t1nev5`
