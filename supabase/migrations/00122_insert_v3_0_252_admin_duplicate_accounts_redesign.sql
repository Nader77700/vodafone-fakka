UPDATE app_versions SET is_latest = false WHERE is_latest = true;

INSERT INTO app_versions (
  version, version_code, is_latest, update_type,
  push_notif_sent, force_update, version_min_supported,
  release_notes, apk_url, created_at
) VALUES (
  '3.0.252', 167, true, 'apk', false, true, '3.0.252',
  'إعادة تصميم كاملة لقسم الحسابات المكررة: قائمة منظمة + صفحة تفاصيل لكل مجموعة جهاز مع إجراءات فردية وجماعية (حظر/حذف/تحديد رئيسي) + حظر الجهاز نهائياً',
  'https://github.com/Nader77700/vodafone-fakka/releases/download/v3.0.252/VodafoneFakka-v3.0.252.apk',
  now()
);