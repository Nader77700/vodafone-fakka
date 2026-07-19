# تقرير شامل — Vodafone Fakka Premium
## Phase 28: Deep Link Router + Duplicate Guard + In-App APK Downloader
**التاريخ:** 2026-06-26  
**الإصدار النهائي:** v2.9.9 (code 52)  
**المطور:** Nader Akram  
**رابط APK:** https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/apk-releases/VodafoneFakka-v2.9.9.apk

---

## 1. ملخص المشروع

Vodafone Fakka Premium هو تطبيق ويب/موبايل عربي لإدارة شحن كروت الفكة الخاصة بشركة Vodafone Egypt. يعمل التطبيق كمنصة احترافية تتيح للمستخدمين:
- متابعة أرصدة الكروت
- تسجيل المعاملات والشحن
- تلقي إشعارات push فورية
- تحديث التطبيق تلقائيًا عبر APK داخلي

---

## 2. ما تم إنجازه في هذه الجلسة (Phase 28)

### 2.1 نظام Notification Router (جديد)
**الملف:** `src/lib/notificationRouter.ts` (126 سطر)

يحول البيانات الواردة في الإشعارات (action_url / deep_link / page / type) إلى مسارات React Router صحيحة داخل التطبيق.

| المكون | الوصف |
|--------|-------|
| `TYPE_ROUTE_MAP` | 15+ نوع إشعار ← مسار مباشر |
| `PAGE_ROUTE_MAP` | 30+ اسم صفحة ← مسار React Router |
| `resolveRoute()` | دالة ذكية تحاول action_url ثم deep_link ثم page ثم type |
| `notifLog()` | سجل تصحيح (dev-only) |

**أمثلة على التوجيه:**
- `type: "offer"` → `/offers`
- `page: "notification-center"` → `/admin/notifications`
- `deep_link: "/profile/settings"` → `/profile/settings`
- لا يوجد شيء مطابق → `/home` (افتراضي)

---

### 2.2 حماية تكرار الإشعارات (Duplicate Guard) — جديد
**الملف:** `src/lib/duplicateNotifGuard.ts` (83 سطر)

يمنع ظهور نفس الإشعار مرتين باستخدام 3 آليات:
1. **messageId** — معرف FCM الفريد (الأولوية الأولى)
2. **collapseKey** — مفتاح التجميع (الأولوية الثانية)
3. **hash(title+body)** — تجزئة المحتوى (الاحتياطي)

- نافذة الحذف: 10 دقائق
- التخزين: session-based (Map في الذاكرة)

---

### 2.3 تحديث FCM Listener
**الملف:** `src/hooks/usePushNotifications.ts` (160 سطر)

تم تحديث hook الاستماع للإشعارات بما يلي:
- ✅ دمج `notificationRouter.resolveRoute()` لاستخراج المسار الصحيح
- ✅ دمج `isNewNotification()` لتصفية التكرار
- ✅ **mark-as-read تلقائي**: عند ضغط الإشعار يُحفظ `read_at` في قاعدة البيانات
- ✅ Debug Logs (dev-only): تسجيل تفاصيل التوجيه والتصفية

---

### 2.4 Deep Link Handler — Cold Start + Warm Start
**الملف:** `src/App.tsx` (213 سطر)

أُضيف `NotificationDeepLinkHandler` component يدعم:
- **Cold Start** (`getLaunchUrl`): عند فتح التطبيق من الإشعار وهو مغلق
- **Warm Start** (`appUrlOpen`): عند فتح التطبيق من الإشعار وهو في الخلفية
- **Foreground**: الإشعارات الواردة أثناء الاستخدام
- **Background**: الإشعارات الواردة والتطبيق في الخلفية

---

### 2.5 تحديث mark-as-read مع الطابع الزمني
**الملف:** `src/lib/api.ts`

دالة `markNotificationRead()` تم تحديثها لتسجيل `read_at` كـ `timestamptz` في قاعدة البيانات بدلاً من مجرد تبديل علامة boolean.

---

### 2.6 تحديث قاعدة البيانات
**العمود الجديد في جدول `notifications`:**
- `read_at` (timestamptz): وقت قراءة الإشعار
- `external_id` (text): معرف FCM الخارجي
- **فهارس:** index على `read_at` + `external_id`

---

### 2.7 نظام تحميل APK داخلي (In-App Downloader)
**الملف:** `src/components/common/UpdateBanner.tsx` (241 سطر)

أُعيدت كتابة شريط التحديث بالكامل:
- 5 حالات: `idle` → `downloading` → `ready` → `installing` → `error`
- شريط تقدم مع عرض السرعة والوقت المتبقي
- دعم التثبيت الأصلي عبر `ApkInstaller` (Capacitor Plugin)
- fallback للمتصفح عند فشل التثبيت الأصلي
- حفظ الملف في ذاكرة التخزين المؤقت (cache) باستخدام `file_paths.xml`

---

### 2.8 ApkInstallerPlugin.java — Plugin أصلي
**الملف:** `android/app/src/main/java/.../ApkInstallerPlugin.java`

Plugin Capacitor مخصص للتعامل مع APK:
- `install(String apkBase64)` — تثبيت APK من base64
- `saveAndInstall(String apkBase64, String filename)` — حفظ + تثبيت
- `downloadAndSave()` — تحميل الملف وكتابته مباشرة (بدون @capacitor/filesystem)
- دعم `FileProvider` لمشاركة الملفات مع PackageManager

**ملاحظة:** أُزيل `@capacitor/filesystem` بسبب مشاكل توافق Java 21.

---

## 3. المشاكل التي تم حلها

| المشكلة | الحل |
|---------|------|
| JAVA_HOME غير صالح | تحميل JDK 17.0.11 من Adoptium |
| JRE لا يحتوي javac | استبداله بـ JDK كامل |
| Android SDK مفقود | تحميل cmdline-tools + تثبيت build-tools 34 + platform 34 |
| AGP compatibility (@capacitor-community/http) | إضافة `namespace` في build.gradle الخاص بالمكتبة |
| إشعارات مكررة | Duplicate Guard بـ 3 آليات dedup |
| Cold Start لا يفتح الصفحة الصحيحة | NotificationDeepLinkHandler + getLaunchUrl |
| تحميل APK خارجي | In-App Downloader + ApkInstallerPlugin |

---

## 4. الملفات الجديدة

| الملف | الوظيفة |
|-------|---------|
| `src/lib/notificationRouter.ts` | توجيه الإشعارات إلى المسارات الصحيحة |
| `src/lib/duplicateNotifGuard.ts` | منع تكرار الإشعارات |
| `android/app/.../ApkInstallerPlugin.java` | تثبيت APK من Native Android |

---

## 5. الملفات المعدلة

| الملف | التعديل |
|-------|---------|
| `src/hooks/usePushNotifications.ts` | دمج Router + Guard + mark-as-read + Debug Logs |
| `src/App.tsx` | إضافة NotificationDeepLinkHandler |
| `src/lib/api.ts` | markNotificationRead() الآن تسجل read_at |
| `src/components/common/UpdateBanner.tsx` | إعادة كتابة كاملة مع In-App Downloader |
| `android/app/build.gradle` | الإصدار 2.9.9 (code 52) |
| `src/lib/buildInfo.ts` | تحديث سجل الإصدارات |
| `android/app/src/main/res/xml/file_paths.xml` | إضافة cache-path لـ APK |
| `android/gradle.properties` | تحديث JAVA_HOME |
| `tasks/release.sh` | تحديث JAVA_HOME + ANDROID_HOME |

---

## 6. حالة البناء والإصدار

```
✅ Lint نظيف — لا أخطاء TypeScript
✅ Vite Build — ناجح
✅ Capacitor Sync — ناجح
✅ Gradle Build — ناجح
✅ APK Verification — v2.9.9 (code 52) مطابق
✅ رفع APK إلى Supabase Storage — ناجح
✅ تحديث قاعدة البيانات — ناجح
✅ إرسال Push Notification — 2 جهاز
```

**تاريخ الإصدار:** 2026-06-26  
**الإصدار:** v2.9.9 (code 52)  
**ملاحظات الإصدار:** HotFix: Deep Link Router + Duplicate Guard + تحميل APK داخلي

---

## 7. الإصدارات السابقة (من السياق التاريخي)

| الإصدار | الكود | المميزات |
|---------|-------|----------|
| v2.9.0 | 43 | Premium Notification Center · Multi-Select · معاينة الإشعار · عداد حروف · Deep Links ذكي · قوالب إشعارات · 19 قاعدة تلقائية |
| v2.9.1 | 44 | إصلاح بانر التحديث · إصلاح اسم الملف · push_notif_sent |
| v2.9.2 | 45 | — |
| v2.9.3 | 46 | — |
| v2.9.4 | 47 | — |
| v2.9.5 | 48 | — |
| v2.9.6 | 49 | — |
| v2.9.7 | 50 | — |
| v2.9.8 | 51 | — |
| **v2.9.9** | **52** | **Deep Link Router + Duplicate Guard + In-App Downloader** |

---

## 8. البنية التقنية

**Frontend:**
- React 18 + TypeScript + Vite
- Tailwind CSS + shadcn/ui
- React Router DOM (التوجيه)
- Capacitor 8 (Bridge للموبايل)

**Backend / Storage:**
- Supabase (PostgreSQL + Storage + Auth + Realtime)
- Edge Functions

**Push Notifications:**
- @capacitor/push-notifications
- FCM (Firebase Cloud Messaging)

**Native Plugins (Android):**
- ApkInstallerPlugin.java (مخصص)
- VodafoneDetectorPlugin.java (مخصص)

---

## 9. التالي / التوصيات

1. **اختبار Deep Links** على أجهزة حقيقية (Cold/Warm/Background/Foreground)
2. **مراقبة Duplicate Guard** — التأكد من عدم فقدان إشعارات مشروعة
3. **اختبار In-App Downloader** — التأكد من التثبيت على Android 10/11/12/13/14
4. **إضافة iOS support** — إذا كان هناك خطط لنشر على App Store

---

*تم إعداد هذا التقرير تلقائيًا بناءً على حالة الكود والسجلات التاريخية.*
