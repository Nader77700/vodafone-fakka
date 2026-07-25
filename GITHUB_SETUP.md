# إرفع Vodafone Fakka على GitHub + بناء APK تلقائي

## الخطوة 1: عمل حساب GitHub (1 دقيقة)
1. افتح github.com
2. اضغط “Sign Up”
3. الإيميل: الإيميل الشخصي اللي بتستخدمه
4. سؤال الأمان: “What do you want to do?” → اختر “Just browsing”
5. تفعيل الإيميل (يجيك رابط تفعيل في الإيميل)
6. صايغ مستخدم وباسورد → إنشاء حساب

## الخطوة 2: إنشاء Repository
1. اضغط “+ New repository”
2. اسم الموقع: `vodafone-fakka-app`
3. اختر “Public”
4. اضغط “Create repository”

## الخطوة 3: ارفع الكود
```bash
# على جهازك (مشروع محلي):
git init
git add .
git commit -m "v3.0.95"

git remote add origin https://github.com/سم-المستخدم/vodafone-fakka-app.git
git push -u origin main
```

## الخطوة 4: إضافة Secrets (مفاتيح الأمان)
1. فتح الموقع على GitHub
2. اذهب إلى Settings → Secrets and variables → Actions
3. اضغط “New repository secret” لكل مفتاح:

| الاسم | القيمة |
|---|---|
| `SUPABASE_SERVICE_KEY` | eyJhbGciOiJIUzI1NiIs...qGv6iURGQONn7wlG55S8HMCxTfodI2GQfcV4PkpARIo |
| `KEYSTORE_BASE64` | (ملف jks مولد إلى base64 → أمر مادال) |
| `KEYSTORE_PASSWORD` | (password باسورد keystore) |
| `KEY_ALIAS` | vodafone-fakka |

## الخطوة 5: إنشاء Keystore Base64
على جهازك:
```bash
# من جذر المشروع:
cd android/app
base64 -w 0 vodafone-fakka-release.jks > keystore.txt
cat keystore.txt
# انسخ النص والصق في KEYSTORE_BASE64 على GitHub
```

## الخطوة 6: شغّل البناء
1. اذهب إلى الموقع → Actions → Build Vodafone Fakka APK
2. اضغط “Run workflow”
3. يبدأ البناء تلقائياً مع الرايح 20 دقيقة

## النتيجة
✅ APK جاهز تلقائياً
✅ مرفوع على Supabase Storage
✅ DB مطبوعة تلقائياً
✅ التطبيق يستلم تحديث v3.0.95 تلقائياً
