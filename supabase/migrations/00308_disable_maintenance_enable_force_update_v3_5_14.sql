-- إيقاف وضع الصيانة نهائياً بعد اكتمال رفع web-live
UPDATE core_app_config SET value = 'false', updated_at = now() WHERE key = 'ff_maintenance_mode';
-- تفعيل التحديث الإجباري للإصدار 3.5.14
UPDATE core_app_config SET value = 'true',   updated_at = now() WHERE key = 'version_force_update';
UPDATE core_app_config SET value = '3.5.14', updated_at = now() WHERE key = 'version_latest_name';
UPDATE core_app_config SET value = '494',    updated_at = now() WHERE key = 'version_latest_code';
UPDATE core_app_config SET value = '492',    updated_at = now() WHERE key = 'version_min_supported';