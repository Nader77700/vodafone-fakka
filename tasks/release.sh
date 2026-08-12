#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  release.sh — سكريبت الإصدار الشامل لـ Vodafone Fakka
#
#  الاستخدام:
#    bash tasks/release.sh            → رفع patch تلقائي  (3.5.5 → 3.5.6)
#    bash tasks/release.sh minor      → رفع minor         (3.5.x → 3.6.0)
#    bash tasks/release.sh major      → رفع major         (3.x.x → 4.0.0)
#    bash tasks/release.sh 3.6.0      → إصدار محدد يدوياً
#
#  ما يفعله هذا السكريبت:
#  1. قراءة آخر إصدار من build.gradle (المصدر الرسمي)
#  2. حساب الإصدار الجديد تلقائياً
#  3. تحديث build.gradle (versionCode + versionName)
#  4. تحديث src/lib/buildInfo.ts
#  5. Lint check للتأكد من خلو الكود من الأخطاء
#  6. git add كل الملفات المعدَّلة
#  7. git commit بـ message واضح
#  8. git push origin main
#  9. طباعة رابط الـ GitHub Actions لمتابعة البناء
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

# ── الألوان ─────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

log()  { echo -e "${BLUE}[release]${NC} $*"; }
ok()   { echo -e "${GREEN}✅${NC} $*"; }
warn() { echo -e "${YELLOW}⚠️${NC}  $*"; }
err()  { echo -e "${RED}❌${NC} $*" >&2; exit 1; }
step() { echo -e "\n${BOLD}${CYAN}── $* ──${NC}"; }

# ── المسار الجذري للمشروع ────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

GRADLE="$ROOT/android/app/build.gradle"
BUILD_INFO="$ROOT/src/lib/buildInfo.ts"
REPO="Nader77700/vodafone-fakka"
BRANCH="main"

# ════════════════════════════════════════════════════════════════════════
# 1. قراءة الإصدار الحالي من build.gradle
# ════════════════════════════════════════════════════════════════════════
step "قراءة الإصدار الحالي"

CURRENT_VERSION=$(grep 'versionName' "$GRADLE" | head -1 \
  | sed 's/.*versionName "\(.*\)".*/\1/' | tr -d '[:space:]')
CURRENT_CODE=$(grep 'versionCode' "$GRADLE" | head -1 \
  | sed 's/.*versionCode \([0-9]*\).*/\1/' | tr -d '[:space:]')

if [[ -z "$CURRENT_VERSION" || -z "$CURRENT_CODE" ]]; then
  err "تعذّر قراءة versionName / versionCode من build.gradle"
fi
log "الإصدار الحالي: v${CURRENT_VERSION} (code ${CURRENT_CODE})"

# ════════════════════════════════════════════════════════════════════════
# 2. حساب الإصدار الجديد
# ════════════════════════════════════════════════════════════════════════
step "حساب الإصدار الجديد"

BUMP_TYPE="${1:-patch}"   # patch | minor | major | رقم مباشر

IFS='.' read -r V_MAJOR V_MINOR V_PATCH <<< "$CURRENT_VERSION"

if [[ "$BUMP_TYPE" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  # إصدار يدوي محدد
  NEW_VERSION="$BUMP_TYPE"
  IFS='.' read -r NM NI NP <<< "$NEW_VERSION"
  NEW_CODE=$(( CURRENT_CODE + 1 ))
elif [[ "$BUMP_TYPE" == "major" ]]; then
  NEW_VERSION="$(( V_MAJOR + 1 )).0.0"
  NEW_CODE=$(( CURRENT_CODE + 1 ))
elif [[ "$BUMP_TYPE" == "minor" ]]; then
  NEW_VERSION="${V_MAJOR}.$(( V_MINOR + 1 )).0"
  NEW_CODE=$(( CURRENT_CODE + 1 ))
else
  # patch (الافتراضي)
  NEW_VERSION="${V_MAJOR}.${V_MINOR}.$(( V_PATCH + 1 ))"
  NEW_CODE=$(( CURRENT_CODE + 1 ))
fi

ok "الإصدار الجديد: v${NEW_VERSION} (code ${NEW_CODE})"

# تأكيد من المستخدم
if [[ -t 0 ]]; then
  echo -e "${YELLOW}هل تريد المتابعة؟ (y/n)${NC} \c"
  read -r CONFIRM
  [[ "$CONFIRM" =~ ^[Yy]$ ]] || { warn "تم الإلغاء."; exit 0; }
fi

# ════════════════════════════════════════════════════════════════════════
# 3. تحديث build.gradle
# ════════════════════════════════════════════════════════════════════════
step "تحديث build.gradle"

# التحقق من وجود الملف
[[ -f "$GRADLE" ]] || err "build.gradle غير موجود: $GRADLE"

# نسخة احتياطية
cp "$GRADLE" "${GRADLE}.bak"

# تحديث versionCode
sed -i "s/versionCode ${CURRENT_CODE}/versionCode ${NEW_CODE}/" "$GRADLE"

# تحديث versionName
sed -i "s/versionName \"${CURRENT_VERSION}\"/versionName \"${NEW_VERSION}\"/" "$GRADLE"

# التحقق من نجاح التحديث
VERIFY_V=$(grep 'versionName' "$GRADLE" | head -1 | sed 's/.*versionName "\(.*\)".*/\1/' | tr -d '[:space:]')
VERIFY_C=$(grep 'versionCode' "$GRADLE" | head -1 | sed 's/.*versionCode \([0-9]*\).*/\1/' | tr -d '[:space:]')

if [[ "$VERIFY_V" != "$NEW_VERSION" || "$VERIFY_C" != "$NEW_CODE" ]]; then
  # استعادة النسخة الاحتياطية
  cp "${GRADLE}.bak" "$GRADLE"
  err "فشل تحديث build.gradle — تم الاستعادة"
fi
rm -f "${GRADLE}.bak"
ok "build.gradle: versionName=$NEW_VERSION versionCode=$NEW_CODE"

# ════════════════════════════════════════════════════════════════════════
# 4. تحديث buildInfo.ts
# ════════════════════════════════════════════════════════════════════════
step "تحديث buildInfo.ts"

[[ -f "$BUILD_INFO" ]] || err "buildInfo.ts غير موجود: $BUILD_INFO"

SAFE_CURRENT=$(echo "$CURRENT_VERSION" | sed 's/\./\\./g')
HASH_TAG="build_v${NEW_VERSION//./_}_$(date +%s)"
APK_TAG="apk_v${NEW_VERSION//./_}_code${NEW_CODE}"
NOW_DATE=$(date -u +%Y-%m-%d)

sed -i \
  -e "s/appVersion: *'${SAFE_CURRENT}'/appVersion:      '${NEW_VERSION}'/" \
  -e "s/versionCode: *[0-9]*/versionCode:    ${NEW_CODE}/" \
  -e "s/sourceHash: *'[^']*'/sourceHash:     '${HASH_TAG}'/" \
  -e "s/bundleFile: *'[^']*'/bundleFile:     'VodafoneFakka-v${NEW_VERSION}.apk'/" \
  -e "s/bundleHash: *'[^']*'/bundleHash:     '${APK_TAG}'/" \
  -e "s/apkHash: *'[^']*'/apkHash:        '${APK_TAG}'/" \
  -e "s/dbVersion: *'[^']*'/dbVersion:      'v${NEW_VERSION}'/" \
  "$BUILD_INFO"

# تحقق
VERIFY_BV=$(grep "appVersion:" "$BUILD_INFO" | head -1 | sed "s/.*'\(.*\)'.*/\1/" | tr -d '[:space:]')
if [[ "$VERIFY_BV" != "$NEW_VERSION" ]]; then
  warn "تحديث buildInfo.ts جزئي (appVersion=$VERIFY_BV) — يرجى المراجعة"
else
  ok "buildInfo.ts: appVersion=$NEW_VERSION versionCode=$NEW_CODE"
fi

# ════════════════════════════════════════════════════════════════════════
# 5. Lint
# ════════════════════════════════════════════════════════════════════════
step "Lint check"

if npm run lint 2>&1 | grep -q "error"; then
  err "Lint فشل — أصلح الأخطاء قبل الإصدار"
fi
ok "Lint نظيف"

# ════════════════════════════════════════════════════════════════════════
# 6. Git status — عرض الملفات المتغيرة
# ════════════════════════════════════════════════════════════════════════
step "الملفات المتغيرة"
git status --short

# ════════════════════════════════════════════════════════════════════════
# 7. Git add + commit + push
# ════════════════════════════════════════════════════════════════════════
step "Git commit & push"

git add -A

COMMIT_MSG="build(v${NEW_VERSION}): رفع الإصدار ${NEW_VERSION} / versionCode ${NEW_CODE}"
git commit -m "$COMMIT_MSG" || { warn "لا توجد تغييرات للـ commit"; exit 0; }

git push origin "$BRANCH"

ok "تم الـ push بنجاح: $COMMIT_MSG"

# ════════════════════════════════════════════════════════════════════════
# 8. رابط GitHub Actions للمتابعة
# ════════════════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}${GREEN}🎉 تم إطلاق الإصدار v${NEW_VERSION} بنجاح!${NC}"
echo ""
echo -e "  ${CYAN}📦 الإصدار:${NC}  v${NEW_VERSION} (code ${NEW_CODE})"
echo -e "  ${CYAN}🔗 Actions:${NC}   https://github.com/${REPO}/actions"
echo -e "  ${CYAN}📱 APK:${NC}       ستصل لكل المستخدمين تلقائياً بعد نجاح البناء"
echo ""
echo -e "${YELLOW}💡 تابع تقدم البناء على:${NC}"
echo -e "   https://github.com/${REPO}/actions"
echo ""
