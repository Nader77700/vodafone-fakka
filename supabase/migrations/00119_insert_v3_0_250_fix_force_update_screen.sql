-- ─── إصدار v3.0.250 — إصلاح شاشة التحديث الإجباري ──────────────────────
-- الخطأ كان: الكود يتجاهل apkUrl من DB ويستخدم GitHub v3.0.235 دائماً
-- الإصلاح: يستخدم apkUrl من DB مباشرة (Supabase Storage)

UPDATE app_versions SET is_latest = false WHERE is_latest = true;

INSERT INTO app_versions (
  version, version_code, is_latest, update_type,
  push_notif_sent, force_update, version_min_supported,
  release_notes, apk_url, created_at
) VALUES (
  '3.0.250',
  166,
  true,
  'apk',
  false,
  true,
  '3.0.250',
  'إصلاح حاسم: شاشة التحديث كانت تحمّل v3.0.235 القديم من GitHub بدلاً من v3.0.249 من Supabase — السبب رابط مُشفَّر في الكود · الآن يستخدم دائماً الرابط من قاعدة البيانات',
  'https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/apk-releases/VodafoneFakka-v3.0.250.apk',
  now()
);