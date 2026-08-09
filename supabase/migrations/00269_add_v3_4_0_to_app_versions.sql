-- تحديث is_latest=false لجميع الإصدارات السابقة
UPDATE app_versions SET is_latest = false WHERE is_latest = true;

-- إضافة إصدار v3.4.0 الجديد
INSERT INTO app_versions (
  version, version_code, apk_url, release_notes, is_latest, update_type, created_at
) VALUES (
  '3.4.0',
  477,
  'https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/apk-releases/VodafoneFakka-v3.4.0.apk?download=',
  'v3.4.0: إضافة قسم خدمات الخطوط والمحافظ — تسجيل دخول وإنشاء حساب OTP واستعلام بالرقم القومي + لوحة أخطاء الأدمن + تحكم كامل من السيرفر',
  true,
  'apk',
  now()
);

-- تحديث app_config أيضاً
UPDATE core_app_config SET value = '3.4.0', updated_at = now() WHERE key = 'version_latest_name';
UPDATE core_app_config SET value = '477',   updated_at = now() WHERE key = 'version_latest_code';
