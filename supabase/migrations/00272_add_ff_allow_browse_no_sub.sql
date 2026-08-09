INSERT INTO core_app_config (key, value, value_type, category, label, description, is_public)
VALUES (
  'ff_allow_browse_no_sub',
  'false',
  'boolean',
  'feature_flags',
  'التصفح بدون اشتراك (Guest Mode)',
  'يسمح للمستخدمين غير المشتركين بتصفح التطبيق بالكامل بدون تنفيذ أي عمليات — يُوقَف فوراً من هنا عند أي ثغرة',
  true
)
ON CONFLICT (key) DO NOTHING;