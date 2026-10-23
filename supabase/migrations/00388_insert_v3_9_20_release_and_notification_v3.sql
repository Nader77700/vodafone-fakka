-- 1. Unset previous latest version
UPDATE app_versions SET is_latest = false WHERE is_latest = true;

-- 2. Insert new release v3.9.20 (code 555)
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
  '3.9.20',
  555,
  true,
  'apk',
  true,
  false,
  '3.9.15',
  'تحديث VIP v3.9.20:
1. إضافة زر الإخراج التلقائي للفرد بعد اكتمال الجلسة (Auto-Eject) مدمجاً مباشرة داخل شاشة الجلسة.
2. تطبيق تسلسل الإخراج الذكي المعتمد (5 خطوات: تجديد باقة الأونر، انتظار الميكسات، 5 محاولات إخراج بفاصل 20 ثانية، فحص الخادم الصارم، وتحويل الفرد لنظام أهلا أقوى كارت MINION لفك التعليق نهائياً).
3. إصلاح جذري لفحص العائلة بالسيرفر لمنع إظهار الفرد مضافاً دون تأكيد XML الفعلي من سيرفر اتصالات.
4. إتاحة التحكم اليدوي المباشر في كافة خطوات الإخراج والترحيل من شاشة الجلسة نفسها.',
  'https://github.com/Nader77700/vodafone-fakka/releases/download/v3.9.20/VodafoneFakka-v3.9.20.apk',
  now()
);

-- 3. Update core_app_config for latest version
UPDATE core_app_config SET value = '3.9.20', updated_at = now() WHERE key = 'version_latest_name';
UPDATE core_app_config SET value = '555', updated_at = now() WHERE key = 'version_latest_code';
UPDATE core_app_config SET value = 'https://github.com/Nader77700/vodafone-fakka/releases/download/v3.9.20/VodafoneFakka-v3.9.20.apk', updated_at = now() WHERE key = 'version_apk_url';

-- 4. Insert Global In-App Notification
INSERT INTO notifications (
  title,
  body,
  type,
  is_read,
  is_global,
  created_at
) VALUES (
  'تحديث جديد متوفر v3.9.20 🚀',
  'تم إطلاق تحديث اتصالات VIP v3.9.20: زر الإخراج التلقائي بعد اكتمال الجلسة، تسلسل الإخراج الذكي الخماسي مع MINION، وإصلاح فحص العائلة المباشر من السيرفر.',
  'announcement',
  false,
  true,
  now()
);