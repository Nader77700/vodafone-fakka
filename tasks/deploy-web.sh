#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════╗
# ║  deploy-web.sh — نشر الويب فوراً بدون APK جديد (Live URL Mode)     ║
# ║                                                                      ║
# ║  الاستخدام:                                                          ║
# ║    bash tasks/deploy-web.sh                                          ║
# ║                                                                      ║
# ║  ما يفعله:                                                           ║
# ║    1. نشر serve-app بـ --no-verify-jwt (إذا Supabase CLI موجود)     ║
# ║    2. بناء dist/ بـ Vite                                             ║
# ║    3. رفع كل الملفات إلى web-live bucket في Supabase Storage        ║
# ║    كل APK مبني بـ server.url يحمّل الكود الجديد فوراً              ║
# ╚══════════════════════════════════════════════════════════════════════╝
set -euo pipefail

WORKSPACE="/workspace/app-ck2v94t1nev5"
SUPABASE_URL="https://vchmsnavyhripakyvzom.supabase.co"
SERVICE_KEY="${SUPABASE_SERVICE_KEY:-REPLACE_WITH_SERVICE_KEY}"
DIST_DIR="$WORKSPACE/dist"
LOG="$WORKSPACE/tasks/deploy-web.log"

exec > >(tee -a "$LOG") 2>&1

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   🌐 نشر ويب — $(date '+%Y-%m-%d %H:%M')         ║"
echo "╚══════════════════════════════════════╝"

# ─── [1/3] نشر serve-app بدون JWT ────────────────────────────────────
echo ""
echo "⚙️  [1/3] نشر serve-app (no-verify-jwt)..."
cd "$WORKSPACE"
if command -v supabase &> /dev/null; then
  supabase link --project-ref vchmsnavyhripakyvzom 2>/dev/null || true
  supabase functions deploy serve-app \
    --project-ref vchmsnavyhripakyvzom \
    --no-verify-jwt 2>&1 | tail -3
  echo "✅ serve-app منشور — APK يصل له بدون JWT"
else
  echo "⚠️  Supabase CLI غير موجود — تخطي"
  echo "   لتثبيته: npm install -g supabase"
fi

# ─── [2/3] بناء Vite ──────────────────────────────────────────────────
echo ""
echo "⚙️  [2/3] بناء Vite..."
cd "$WORKSPACE"
npx vite build --logLevel warn
FILE_COUNT=$(find "$DIST_DIR" -type f | wc -l)
echo "✅ Vite build مكتمل — $FILE_COUNT ملف"

# ─── [3/3] رفع إلى web-live bucket ───────────────────────────────────
echo ""
echo "⚙️  [3/3] رفع $FILE_COUNT ملف إلى web-live..."
python3 << PYEOF
import os, urllib.request

BASE_URL = "${SUPABASE_URL}"
SK       = "${SERVICE_KEY}"
DIST     = "${DIST_DIR}"
BUCKET   = "web-live"
MIME     = {'.html':'text/html','.js':'application/javascript','.css':'text/css',
            '.json':'application/json','.png':'image/png','.jpg':'image/jpeg',
            '.svg':'image/svg+xml','.ico':'image/x-icon',
            '.woff':'font/woff','.woff2':'font/woff2',
            '.webmanifest':'application/manifest+json'}
HDR = {"Authorization": f"Bearer {SK}", "apikey": SK}

ok = 0; fail = 0
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
            urllib.request.urlopen(req, timeout=30); ok += 1
        except Exception as e:
            print(f"  ❌ {relpath}: {e}"); fail += 1
print(f"  ✅ رُفع: {ok} ملف — فشل: {fail}")
PYEOF

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ✅ اكتمل النشر!                                     ║"
echo "║  🌐 serve-app: /functions/v1/serve-app              ║"
echo "║  📦 ملفات: $FILE_COUNT                                       ║"
echo "║  ⏰ وقت: $(date '+%Y-%m-%d %H:%M')                        ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "💡 كل APK مبني بـ server.url سيحمّل هذا الكود فوراً"
set -euo pipefail

WORKSPACE="/workspace/app-ck2v94t1nev5"
SUPABASE_URL="https://vchmsnavyhripakyvzom.supabase.co"
SERVICE_KEY="${SUPABASE_SERVICE_KEY:-REPLACE_WITH_SERVICE_KEY}"
DIST_DIR="$WORKSPACE/dist"
LOG="$WORKSPACE/tasks/deploy-web.log"

exec > >(tee -a "$LOG") 2>&1

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   🌐 نشر ويب — $(date '+%Y-%m-%d %H:%M')         ║"
echo "╚══════════════════════════════════════╝"

# ─── [1/3] بناء Vite ──────────────────────────────────────────────────
echo ""
echo "⚙️  [1/3] بناء Vite..."
cd "$WORKSPACE"
npx vite build --logLevel warn
echo "✅ Vite build مكتمل — $(find $DIST_DIR -type f | wc -l) ملف"

# ─── [2/3] رفع إلى web-live bucket ───────────────────────────────────
echo ""
echo "⚙️  [2/3] رفع الملفات إلى web-live..."

# index.html بدون cache (يُجبر المتصفح دائماً على تحميل أحدث نسخة)
echo "  📄 رفع index.html..."
INDEX_HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
  -X PUT "${SUPABASE_URL}/storage/v1/object/web-live/index.html" \
  -H "Authorization: Bearer ${SERVICE_KEY}" \
  -H "Content-Type: text/html; charset=utf-8" \
  -H "Cache-Control: no-cache, no-store, must-revalidate" \
  -H "x-upsert: true" \
  --data-binary "@${DIST_DIR}/index.html" \
  --max-time 30)
echo "  ✅ index.html (HTTP $INDEX_HTTP)"

# دالة رفع مع MIME type تلقائي
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
    *.txt|*.map)  MIME="text/plain" ;;
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
  if [[ "$HTTP" == "200" ]]; then
    echo "  ✅ $REL_PATH"
  else
    echo "  ❌ فشل: $REL_PATH (HTTP $HTTP)"
    return 1
  fi
}

# رفع باقي الملفات
TOTAL=0
FAILED=0
while IFS= read -r FILE; do
  if upload_file "$FILE"; then
    TOTAL=$((TOTAL + 1))
  else
    FAILED=$((FAILED + 1))
  fi
done < <(find "$DIST_DIR" -type f ! -name "index.html")

echo ""
echo "  📊 رُفع: $TOTAL ملف — فشل: $FAILED ملف"

# ─── [3/3] تحقق من Live URL ──────────────────────────────────────────
echo ""
echo "⚙️  [3/3] التحقق من Live URL..."
sleep 2  # انتظار propagation
LIVE_HTTP=$(curl -s -o /dev/null -w "%{http_code}" --head --max-time 15 "$LIVE_URL" || echo "0")

echo ""
echo "╔══════════════════════════════════════════════════════╗"
if [[ "$LIVE_HTTP" == "200" ]]; then
  echo "║  ✅ Live URL يعمل بنجاح!                             ║"
else
  echo "║  ⚠️  Live URL HTTP $LIVE_HTTP — تحقق يدوياً          ║"
fi
echo "╠══════════════════════════════════════════════════════╣"
echo "║  🌐 URL: $LIVE_URL"
echo "║  📦 ملفات مرفوعة: $TOTAL"
echo "║  ⏰ وقت النشر: $(date '+%Y-%m-%d %H:%M')"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "💡 كل APK مبني بـ server.url سيحمّل هذا الكود فوراً عند فتح التطبيق"
