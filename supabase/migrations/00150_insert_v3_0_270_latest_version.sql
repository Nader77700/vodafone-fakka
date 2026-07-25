-- ═══════════════════════════════════════════════════════════
-- v3.0.270 — إدراج الإصدار الأحدث في app_versions
-- السبب: جميع المايجريشنز من 00129→00149 كانت إصلاحات DB فقط
--         ولم تُدرج v3.0.270 في جدول app_versions → الأبلكيشن
--         لا يرى أي تحديث لأن DB لا يزال يُشير لـ v3.0.254
-- ═══════════════════════════════════════════════════════════

-- 1. إلغاء is_latest من جميع الإصدارات القديمة
UPDATE app_versions SET is_latest = false WHERE is_latest = true;

-- 2. إدراج v3.0.270 كأحدث إصدار
INSERT INTO app_versions (
  version,
  version_code,
  is_latest,
  update_type,
  push_notif_sent,
  force_update,
  version_min_supported,
  release_notes,
  apk_url,
  created_at
) VALUES (
  '3.0.270',
  185,
  true,
  'apk',
  false,
  false,
  '3.0.254',
  'نظام تقييد التضارب المتزامن 10 دقائق + فحص حظر الجهاز عند التسجيل + إصلاح أيام الاشتراك + تبويبات عمليات المستخدم + إصلاح حذف الحساب + سجلات التقييد للأدمن',
  'https://github.com/Nader77700/vodafone-fakka/releases/download/v3.0.270/VodafoneFakka-v3.0.270.apk',
  now()
);

-- 3. مزامنة app_config
UPDATE app_config SET value = '3.0.270' WHERE key = 'version_latest_name';
UPDATE app_config SET value = '185'     WHERE key = 'version_latest_code';
UPDATE app_config SET value = 'false'   WHERE key = 'version_force_update';
UPDATE app_config SET value = 'https://github.com/Nader77700/vodafone-fakka/releases/download/v3.0.270/VodafoneFakka-v3.0.270.apk'
  WHERE key = 'version_apk_url';
