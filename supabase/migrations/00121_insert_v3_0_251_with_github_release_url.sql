-- إصدار v3.0.251 — الإصلاح الكامل + GitHub Release في كل بناء
UPDATE app_versions SET is_latest = false WHERE is_latest = true;

INSERT INTO app_versions (
  version, version_code, is_latest, update_type,
  push_notif_sent, force_update, version_min_supported,
  release_notes, apk_url, created_at
) VALUES (
  '3.0.251',
  167,
  true,
  'apk',
  false,
  true,
  '3.0.251',
  'إصلاح نهائي: إنشاء GitHub Release تلقائياً مع كل بناء — يضمن عمل التحديث مع كل الإصدارات القديمة والجديدة من التطبيق',
  'https://github.com/Nader77700/vodafone-fakka/releases/download/v3.0.251/VodafoneFakka-v3.0.251.apk',
  now()
);