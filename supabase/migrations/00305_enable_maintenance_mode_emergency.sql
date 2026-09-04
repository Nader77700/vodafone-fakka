-- تفعيل وضع الصيانة فوراً لإيقاف التحديث الإجباري
UPDATE core_app_config SET value = 'true',  updated_at = now() WHERE key = 'ff_maintenance_mode';
-- إيقاف التحديث الإجباري مؤقتاً
UPDATE core_app_config SET value = 'false', updated_at = now() WHERE key = 'version_force_update';
-- رسالة الصيانة
UPDATE core_app_config SET value = 'التطبيق في وضع الصيانة حالياً. نعمل على تحسينه وسيعود قريباً. نعتذر عن الإزعاج.', updated_at = now() WHERE key = 'maintenance_message';