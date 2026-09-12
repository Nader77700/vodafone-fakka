
-- ─── رفع versionCode من 505 → 506 ─────────────────────────────────────────────

-- 1. تحديث version_code و release_notes للنسخة 3.6.0
UPDATE app_versions
SET
  version_code  = 506,
  is_latest     = true,
  release_notes = 'v3.6.0 (code 506): نظام إخلاء المسؤولية الاحترافي — يظهر إجبارياً لجميع المستخدمين عند الفتح، لا يمكن تخطيه. رفض الإخلاء يُخرج المستخدم تلقائياً. إصلاح backButton على Android أثناء ظهور الإخلاء.'
WHERE version = '3.6.0';

-- 2. تحديث version_latest_code في core_app_config
UPDATE core_app_config
  SET value = '506'
  WHERE key = 'version_latest_code';

-- 3. تأكد أن version_latest يعكس 3.6.0
INSERT INTO core_app_config (key, value)
VALUES ('version_latest', '3.6.0')
ON CONFLICT (key) DO UPDATE SET value = '3.6.0';
