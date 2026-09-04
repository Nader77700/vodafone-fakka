-- تسجيل الإصدار الجديد v3.5.14
UPDATE app_versions SET is_latest = false WHERE is_latest = true;

INSERT INTO app_versions (
  version, version_code, is_latest, update_type,
  push_notif_sent, force_update, version_min_supported,
  release_notes, apk_url, created_at
) VALUES (
  '3.5.14', 494, true, 'apk', false, false, '3.5.12',
  'v3.5.14: إصلاح مشكلة بناء ERR_PNPM_IGNORED_BUILDS — تشغيل مستقر بدون crash — تحديث آمن',
  'https://github.com/Nader77700/vodafone-fakka/releases/download/v3.5.14/VodafoneFakka-v3.5.14.apk',
  now()
);

-- تحديث app_config للإصدار الجديد (force_update=false حتى نتأكد من البناء)
UPDATE core_app_config SET value = '3.5.14', updated_at = now() WHERE key = 'version_latest_name';
UPDATE core_app_config SET value = '494',    updated_at = now() WHERE key = 'version_latest_code';
UPDATE core_app_config SET value = '492',    updated_at = now() WHERE key = 'version_min_supported';
-- الصيانة لا تزال مفعلة حتى يكتمل البناء
UPDATE core_app_config SET value = 'true',   updated_at = now() WHERE key = 'ff_maintenance_mode';