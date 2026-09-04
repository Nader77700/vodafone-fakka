-- إصلاح 1: تفعيل force_update على الإصدار الجديد
UPDATE app_versions 
SET force_update = true,
    version_min_supported = '3.5.13'
WHERE version = '3.5.13';

-- إصلاح 2: رابط APK يشير لـ GitHub Releases (المصدر الصحيح)
UPDATE app_versions 
SET apk_url = 'https://github.com/Nader77700/vodafone-fakka/releases/download/v3.5.13/VodafoneFakka-v3.5.13.apk'
WHERE version = '3.5.13';

-- إصلاح 3: version_min_supported = 492 (ليس 493) لتجنب حجب الإصدار الجديد نفسه
UPDATE core_app_config SET value = '492', updated_at = now() WHERE key = 'version_min_supported';

-- إصلاح 4: version_force_update = true
UPDATE core_app_config SET value = 'true', updated_at = now() WHERE key = 'version_force_update';