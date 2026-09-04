-- إصلاح طارئ: version_min_supported كان 493 = يحجب حتى الإصدار الجديد نفسه
-- السبب: is_valid_app_version() تقرأ من app_config (view) التي تحتاج is_valid_app_version() → حلقة
-- الحل: نعيد min إلى 492 (الإصدار السابق) حتى يعمل 493 الجديد بدون حجب
UPDATE core_app_config 
SET value = '492', updated_at = now() 
WHERE key = 'version_min_supported';