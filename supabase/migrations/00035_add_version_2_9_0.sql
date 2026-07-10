
-- تحديث الإصدار السابق
UPDATE app_versions SET is_latest = false WHERE is_latest = true;

-- إضافة الإصدار الجديد v2.9.0
INSERT INTO app_versions (version, version_code, is_latest, release_notes, apk_url, created_at)
VALUES (
  '2.9.0',
  44,
  true,
  'Premium Notification Center · Multi-Select لاختيار عدة مستخدمين مع بحث لحظي · معاينة الإشعار قبل الإرسال · عداد حروف · نظام Deep Links ذكي · قوالب إشعارات قابلة للحفظ · تبويب إشعارات تلقائية (19 قاعدة) · تبويب مدير الروابط · بحث وفلتر في صفحة الإشعارات · Deep Linking عند الضغط على الإشعار',
  'https://vchmsnavyhripakyvzom.supabase.co/storage/v1/object/public/apk-releases/VodafoneFakka-v2.8.1.apk',
  now()
);
