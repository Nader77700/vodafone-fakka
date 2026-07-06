-- ─── إصلاح عاجل: جميع روابط APK → Supabase Storage (المصدر الوحيد المؤكد) ───
-- GitHub Releases موجود فقط لـ v3.0.235 و v3.0.234
-- Supabase Storage يحتوي على: v3.0.249 حتى v3.0.253 (كلها 200 OK)

UPDATE app_versions
SET apk_url = CASE version
  WHEN '3.0.253' THEN 'https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/apk-releases/VodafoneFakka-v3.0.253.apk'
  WHEN '3.0.252' THEN 'https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/apk-releases/VodafoneFakka-v3.0.252.apk'
  WHEN '3.0.251' THEN 'https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/apk-releases/VodafoneFakka-v3.0.251.apk'
  WHEN '3.0.250' THEN 'https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/apk-releases/VodafoneFakka-v3.0.250.apk'
  WHEN '3.0.249' THEN 'https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/apk-releases/VodafoneFakka-v3.0.249.apk'
  ELSE apk_url
END
WHERE version IN ('3.0.249','3.0.250','3.0.251','3.0.252','3.0.253');

-- تحديث app_config بالرابط الصحيح
UPDATE app_config
SET value = 'https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/apk-releases/VodafoneFakka-v3.0.253.apk'
WHERE key = 'version_apk_url';