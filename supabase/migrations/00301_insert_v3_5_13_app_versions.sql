UPDATE app_versions SET is_latest = false WHERE is_latest = true;

INSERT INTO app_versions (
  version, version_code, is_latest, update_type,
  push_notif_sent, force_update, version_min_supported,
  release_notes, apk_url, created_at
) VALUES (
  '3.5.13', 493, true, 'apk', false, true, '3.5.13',
  'v3.5.13: اقتراحات رقم المستفيد تلقائياً + Password Box للأرقام السرية + إخفاء الكارت عند انتهاء الاشتراك + شارة FREE + إشعارات 24h/48h + Light Mode لصفحات NTRA',
  'https://github.com/Nader77700/vodafone-fakka/releases/download/v3.5.13/VodafoneFakka-v3.5.13.apk',
  now()
);