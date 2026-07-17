
-- ═══════════════════════════════════════════════════════════
-- إصلاح: حذف إصدار v3.0.255 المزيف وإعادة v3.0.254 كأحدث إصدار
-- السبب: v3.0.255 لم يُبنَ APK حقيقي له — الملف هو v3.0.254 بالضبط
-- ═══════════════════════════════════════════════════════════

-- حذف إصدار v3.0.255 المزيف
DELETE FROM app_versions WHERE version = '3.0.255';

-- إعادة v3.0.254 كأحدث إصدار
UPDATE app_versions SET is_latest = true WHERE version = '3.0.254';

-- مزامنة app_config بقيم v3.0.254 الصحيحة
UPDATE app_config SET value = '3.0.254'
  WHERE key = 'version_latest_name';
UPDATE app_config SET value = '169'
  WHERE key = 'version_latest_code';
UPDATE app_config SET value = 'https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/apk-releases/VodafoneFakka-v3.0.254.apk'
  WHERE key = 'version_apk_url';
UPDATE app_config SET value = 'false'
  WHERE key = 'version_force_update';
