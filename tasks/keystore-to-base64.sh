#!/usr/bin/env bash
# مساعد في تحويل Keystore إلى Base64 للرفع على GitHub

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
KS="$PROJECT_DIR/android/app/vodafone-fakka-release.jks"
OUT="$PROJECT_DIR/keystore.txt"

if [[ ! -f "$KS" ]]; then
    echo "❌ Keystore غير موجود: $KS"
    echo "   هل انشأته بالأمر التالي؟"
    echo "   keytool -genkey -v -keystore $KS -alias vodafone-fakka -keyalg RSA -keysize 2048 -validity 10000"
    exit 1
fi

echo "⚙️ جاري تحويل إلى Base64..."
base64 -w 0 "$KS" > "$OUT"
echo "✅ تم! الملف: $OUT"
echo "   الحجم: $(wc -c < "$OUT") حرف"
echo ""
echo "┌────────────────────────────────────────────────────┐"
echo "│  الآن: انسخ محتوى $OUT           │"
echo "│  ألصقه في GitHub → Settings → Secrets     │"
echo "│  اسم: KEYSTORE_BASE64                        │"
echo "└─────────────────────────────────────────────────────┘"
