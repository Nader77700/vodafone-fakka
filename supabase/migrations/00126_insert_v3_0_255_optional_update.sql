
-- ═══════════════════════════════════════════════════════════
-- v3.0.255 — تحديث اختياري (غير إجباري)
-- يحتوي على: إصلاح شامل لنظام التاجر (RPCs + واجهة)
-- force_update = FALSE → المستخدم يختار إذا يحدّث أم لا
-- ═══════════════════════════════════════════════════════════

-- إلغاء is_latest من الإصدار السابق
UPDATE app_versions SET is_latest = false WHERE is_latest = true;

-- إدراج الإصدار الجديد بدون إجبار
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
  '3.0.255',
  170,
  true,
  'apk',
  false,
  false,      -- ← تحديث اختياري
  '3.0.249',  -- الحد الأدنى المدعوم (القديم لا يُجبر)
  'إصلاح شامل لنظام التجار: توزيع النقاط، تفعيل الاشتراك، أزرار الحظر/الإيقاف، كود الدعوة، تحويل التاجر لمستخدم عادي',
  'https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/apk-releases/VodafoneFakka-v3.0.255.apk',
  now()
);

-- مزامنة app_config — الأهم: version_force_update = false
UPDATE app_config SET value = '3.0.255' WHERE key = 'version_latest_name';
UPDATE app_config SET value = '170'     WHERE key = 'version_latest_code';
UPDATE app_config SET value = 'false'   WHERE key = 'version_force_update';
UPDATE app_config SET value = 'https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/apk-releases/VodafoneFakka-v3.0.255.apk'
  WHERE key = 'version_apk_url';
