UPDATE core_app_config SET value = 'true',    updated_at = now() WHERE key = 'version_force_update';
UPDATE core_app_config SET value = '3.5.13',  updated_at = now() WHERE key = 'version_latest_name';
UPDATE core_app_config SET value = '493',     updated_at = now() WHERE key = 'version_latest_code';
UPDATE core_app_config SET value = '493',     updated_at = now() WHERE key = 'version_min_supported';
UPDATE core_app_config SET value = 'تحديث مهم جاهز! يُرجى تحديث التطبيق للحصول على آخر التحسينات والميزات الجديدة.', updated_at = now() WHERE key = 'version_force_update_msg';