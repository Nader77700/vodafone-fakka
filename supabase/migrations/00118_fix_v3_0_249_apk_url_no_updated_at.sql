-- إصلاح رابط APK v3.0.249 — الرابط الصحيح بدون لاحقة -code165
UPDATE app_versions
SET apk_url = 'https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/apk-releases/VodafoneFakka-v3.0.249.apk'
WHERE version = '3.0.249';

-- تحديث app_config
UPDATE app_config
SET value = 'https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/apk-releases/VodafoneFakka-v3.0.249.apk'
WHERE key = 'version_apk_url';

-- التأكد أن v3.0.249 هو is_latest
UPDATE app_versions SET is_latest = false WHERE version != '3.0.249';
UPDATE app_versions SET is_latest = true  WHERE version = '3.0.249';