#!/bin/bash
export SUPABASE_URL="https://vchmsnavyhripakyvzom.supabase.co"
export SB_SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZjaG1zbmF2eWhyaXBha3l2em9tIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjI4Nzg1NSwiZXhwIjoyMDk3ODYzODU1fQ.qGv6iURGQONn7wlG55S8HMCxTfodI2GQfcV4PkpARIo"
BASE="${SUPABASE_URL}/storage/v1/object/web-live"
FAIL=0

upload() {
  local FILE="$1" KEY="$2" MIME="$3"
  local HTTP=$(curl -s -o /tmp/wu.txt -w "%{http_code}" -X POST \
    "${BASE}/${KEY}" \
    -H "Authorization: Bearer $SB_SERVICE_KEY" \
    -H "apikey: $SB_SERVICE_KEY" \
    -H "Content-Type: ${MIME}" \
    -H "x-upsert: true" \
    --data-binary "@${FILE}")
  if [[ "$HTTP" == "200" ]]; then
    echo "✅ Uploaded: $KEY"
  else
    echo "⚠️ ${KEY}: HTTP $HTTP — $(cat /tmp/wu.txt)"
    FAIL=$((FAIL+1))
  fi
}

upload "dist/index.html" "index.html" "text/html; charset=utf-8"

find dist/assets -type f 2>/dev/null | while read FILE; do
  KEY="${FILE#dist/}"
  case "$FILE" in
    *.js)    MIME="application/javascript" ;;
    *.css)   MIME="text/css" ;;
    *.png)   MIME="image/png" ;;
    *.svg)   MIME="image/svg+xml" ;;
    *.ico)   MIME="image/x-icon" ;;
    *.woff2) MIME="font/woff2" ;;
    *.woff)  MIME="font/woff" ;;
    *.json)  MIME="application/json" ;;
    *)       MIME="application/octet-stream" ;;
  esac
  upload "$FILE" "$KEY" "$MIME"
done

find dist -maxdepth 1 -type f ! -name "index.html" | while read FILE; do
  KEY="${FILE#dist/}"
  case "$FILE" in
    *.json) MIME="application/json" ;;
    *.txt)  MIME="text/plain" ;;
    *.ico)  MIME="image/x-icon" ;;
    *.png)  MIME="image/png" ;;
    *.webmanifest) MIME="application/manifest+json" ;;
    *)      MIME="application/octet-stream" ;;
  esac
  upload "$FILE" "$KEY" "$MIME"
done

echo "✅ web-live updated (failures: $FAIL)"