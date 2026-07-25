-- ─── إضافة إصدار v3.0.249 مع force_update ────────────────────────────────
-- 1. إلغاء تأشير is_latest عن الإصدار السابق
UPDATE app_versions SET is_latest = false WHERE is_latest = true;

-- 2. إدراج الإصدار الجديد v3.0.249
INSERT INTO app_versions (
  version, version_code, is_latest, update_type,
  push_notif_sent, force_update, version_min_supported,
  release_notes, apk_url, created_at
) VALUES (
  '3.0.249',
  165,
  true,
  'apk',
  false,
  true,
  '3.0.249',
  'نظام حظر الأجهزة وكشف الحسابات المكررة — يمنع إنشاء حسابات متعددة على نفس الجهاز حتى بعد إعادة التثبيت · إصلاح خطأ حذف الحساب · تحديث أمني إجباري',
  'https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/apk-releases/VodafoneFakka-v3.0.249-code165.apk',
  now()
);