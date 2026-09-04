-- إيقاف وضع الصيانة
UPDATE core_app_config SET value = 'false', updated_at = now() WHERE key = 'ff_maintenance_mode';
-- تفعيل التحديث الإجباري
UPDATE core_app_config SET value = 'true',   updated_at = now() WHERE key = 'version_force_update';
UPDATE core_app_config SET value = '494',    updated_at = now() WHERE key = 'version_latest_code';
UPDATE core_app_config SET value = '3.5.14', updated_at = now() WHERE key = 'version_latest_name';
UPDATE core_app_config SET value = '492',    updated_at = now() WHERE key = 'version_min_supported';

-- تحديث رابط APK + force_update في app_versions
UPDATE app_versions 
SET apk_url      = 'https://github.com/Nader77700/vodafone-fakka/releases/download/v3.5.14/VodafoneFakka-v3.5.14.apk',
    force_update = true
WHERE version = '3.5.14';