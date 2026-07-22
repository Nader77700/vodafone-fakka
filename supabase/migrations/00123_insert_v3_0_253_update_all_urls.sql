-- v3.0.253 — تحديث شامل لجميع الروابط + رفع التحديث
UPDATE app_versions SET is_latest = false WHERE is_latest = true;

INSERT INTO app_versions (
  version, version_code, is_latest, update_type,
  push_notif_sent, force_update, version_min_supported,
  release_notes, apk_url, created_at
) VALUES (
  '3.0.253', 168, true, 'apk', false, true, '3.0.253',
  'تحديث شامل: مزامنة جميع الروابط مع أحدث إصدار + إصلاح ForceUpdateScreen fallback URL + تحديث buildInfo',
  'https://github.com/Nader77700/vodafone-fakka/releases/download/v3.0.253/VodafoneFakka-v3.0.253.apk',
  now()
);

-- مزامنة app_config
UPDATE app_config SET value = '3.0.253'   WHERE key = 'version_latest_name';
UPDATE app_config SET value = '168'        WHERE key = 'version_latest_code';
UPDATE app_config SET value = 'https://github.com/Nader77700/vodafone-fakka/releases/download/v3.0.253/VodafoneFakka-v3.0.253.apk'
  WHERE key = 'version_apk_url';