-- مفاتيح التحكم في قسم الخطوط والمحافظ من السيرفر
INSERT INTO core_app_config (key, value, value_type, category, label, description, is_public)
VALUES
  ('wl_service_enabled',       'true',    'boolean', 'feature_flags', 'تفعيل قسم الخطوط والمحافظ',   'تفعيل أو تعطيل القسم كاملاً بدون تحديث التطبيق', true),
  ('wl_service_status',        'active',  'string',  'business',      'حالة خدمة الخطوط',             'active | maintenance | coming_soon | disabled',   true),
  ('wl_maintenance_message',   '',        'string',  'business',      'رسالة صيانة الخطوط',           'تظهر للمستخدم عند وضع الصيانة',                   true),
  ('wl_require_egypt_vpn_msg', 'هذه الخدمة تعمل داخل مصر فقط. استخدم شبكة مصرية أو VPN مصري.', 'string', 'business', 'رسالة الحجب الجغرافي', 'تظهر عند الاتصال من خارج مصر', true),
  ('wl_otp_length',            '6',       'number',  'business',      'طول رمز OTP',                  'عدد خانات رمز التحقق',                            true),
  ('wl_session_ttl_minutes',   '60',      'number',  'security',      'مدة جلسة الخطوط (دقائق)',      'مدة صلاحية الجلسة بالدقائق',                      false),
  ('wl_max_retry_attempts',    '2',       'number',  'security',      'أقصى محاولات خطوط',            'عدد المحاولات قبل الإيقاف المؤقت',                false),
  ('wl_admin_logs_enabled',    'true',    'boolean', 'feature_flags', 'تسجيل أخطاء الخطوط',          'تفعيل/تعطيل سجل أخطاء لوحة الأدمن',              false),
  ('wl_debug_mode',            'false',   'boolean', 'feature_flags', 'وضع تشخيص الخطوط',            'سجلات تفصيلية للمشاكل — للأدمن فقط',             false)
ON CONFLICT (key) DO UPDATE
  SET value       = EXCLUDED.value,
      label       = EXCLUDED.label,
      description = EXCLUDED.description,
      updated_at  = now();

-- تحديث إصدار التطبيق
INSERT INTO core_app_config (key, value, value_type, category, label, description, is_public)
VALUES
  ('version_latest_name', '3.4.0', 'string', 'version', 'أحدث إصدار',     'رقم إصدار التطبيق الأحدث', true),
  ('version_latest_code', '477',   'number', 'version', 'كود أحدث إصدار', 'كود البناء للإصدار الأحدث', true)
ON CONFLICT (key) DO UPDATE
  SET value      = EXCLUDED.value,
      updated_at = now();
