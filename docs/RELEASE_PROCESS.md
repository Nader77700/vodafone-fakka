# دليل الإصدار الرسمي (Official Release & Zero Trust Integration)

بما أن التطبيق يتبنى معمارية **Zero Trust** بشكل كامل، فإن الخادم (Server) لن يقبل أي طلبات من التطبيق إلا إذا كانت النسخة مبنية رسمياً، موقعة بمفتاح الشركة (Keystore)، ومُدرجة في جدول `build_registry`.

يجب اتباع هذه الخطوات في كل مرة يتم فيها إصدار تحديث جديد للتطبيق.

## 1. إعداد مفتاح التوقيع (Keystore)
إذا لم يكن لديك مفتاح توقيع مسبقاً، قم بإنشائه عبر الأمر التالي في الـ Terminal:

```bash
keytool -genkey -v -keystore release-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
```
> **تنبيه:** احتفظ بملف `release-key.keystore` وكلمات المرور في مكان آمن جداً. ضياع هذا الملف يعني عدم قدرتك على تحديث التطبيق في متجر جوجل بلاي.

## 2. بناء التطبيق وتوقيعه (APK/AAB)
باستخدام Capacitor أو React Native (Expo)، قم ببناء التطبيق بصيغة Release.
إذا كنت تستخدم أندرويد ستوديو (Android Studio):
1. افتح مجلد `android`.
2. من القائمة العلوية: `Build > Generate Signed Bundle / APK`.
3. اختر `APK` ثم أدخل بيانات الـ Keystore الذي أنشأته.
4. اختر `release` كنوع للـ Build وقم بوضع علامة على `V1 (Jar Signature)` و `V2 (Full APK Signature)`.

## 3. استخراج بصمة التوقيع (APK Signature)
بعد استخراج ملف الـ `app-release.apk`، ستحتاج إلى استخراج بصمة الـ SHA-256 الخاصة بالتوقيع.
قم بتنفيذ هذا الأمر على ملف الـ APK:
```bash
apksigner verify --print-certs app-release.apk
```
أو باستخدام الـ Keystore مباشرة:
```bash
keytool -list -v -keystore release-key.keystore
```
انسخ بصمة الـ **SHA-256** (ستكون بصيغة `XX:YY:ZZ...`). يمكنك إزالة النقطتين الرأسيتين `:` ليصبح نصاً متصلاً. هذا هو الـ `apk_signature` الخاص بك.

## 4. استخراج الـ Build Hash
الـ Build Hash يمكن أن يكون أي توقيع فريد للملفات المبنية (مثلاً MD5 لملف الـ APK أو الـ bundle).
لمعرفة الـ Hash لملف الـ APK:
```bash
sha256sum app-release.apk
```
انسخ الناتج. هذا هو الـ `build_hash`.

## 5. تسجيل الإصدار في السيرفر (Server Registry)
الآن بعد أن حصلت على الـ Signature والـ Hash، يجب إخبار السيرفر بأن هذه النسخة "موثوقة" (Trusted) ليسمح لها بالاتصال بالـ API.

توجه إلى لوحة تحكم Supabase > SQL Editor ونفذ الاستعلام التالي (مع استبدال القيم الخاصة بك):

```sql
INSERT INTO build_registry (
  version_code, 
  app_version, 
  build_hash, 
  apk_signature, 
  is_active,
  release_notes
) VALUES (
  326,                                   -- Version Code
  '3.0.326',                             -- App Version Name
  'YOUR_BUILD_HASH_HERE',                -- הـ Build Hash المستخرج
  'YOUR_APK_SHA256_SIGNATURE_HERE',      -- بصمة الـ SHA-256
  true,                                  -- تفعيل النسخة فوراً
  'إصدار الإنتاج الرسمي V3.0.326'
);
```

## 6. إعداد التطبيق (Frontend)
إذا كان التطبيق يقرأ بصمة البناء محلياً، تأكد أنك تقوم بحقن الـ `BUILD_INFO.apkHash` و `BUILD_INFO.versionCode` الصحيحين داخل كود المصدر في ملف `src/lib/buildInfo.ts` قبل عملية البناء الأخيرة.

*(ملاحظة: في الأنظمة الأمنية المتقدمة، يتم برمجة إضافة (Native Plugin) تقرأ هذه الـ Hashes أوتوماتيكياً وقت التشغيل (Runtime) وإرسالها بالـ Headers).*

## ماذا سيحدث إذا تم تجاهل هذه الخطوات؟
- أي تطبيق (بما في ذلك تطبيقك الرسمي) يحاول الاتصال بـ Edge Functions أو تنفيذ RPC سيرسل بيانات لا تتطابق مع `build_registry`.
- سيقوم السيرفر برفض الطلب وإرجاع خطأ `403 Forbidden` (Integrity Check Failed).
- سيقوم السيرفر بتسجيل الحدث في جدول `security_logs` تحت تصنيف `TAMPER_DETECTED`.