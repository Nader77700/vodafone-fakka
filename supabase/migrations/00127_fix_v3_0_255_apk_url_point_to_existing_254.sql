
-- ══════════════════════════════════════════════════════════════
-- إصلاح: v3.0.255 → يشير لملف v3.0.254 الموجود فعلاً
-- السبب: التحديثات كانت DB فقط، مفيش APK جديد اتبنى
-- ══════════════════════════════════════════════════════════════

-- تحديث رابط APK في جدول app_versions
UPDATE app_versions
SET apk_url = 'https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/apk-releases/VodafoneFakka-v3.0.254.apk'
WHERE version = '3.0.255';

-- تحديث app_config بنفس الرابط الصحيح
UPDATE app_config
SET value = 'https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/apk-releases/VodafoneFakka-v3.0.254.apk'
WHERE key = 'version_apk_url';
