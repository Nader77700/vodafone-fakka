INSERT INTO app_config (key, value, value_type, category, label, description, is_public) 
VALUES ('version_min_supported', '326', 'number', 'version', 'الحد الأدنى لإصدار التطبيق', 'أي إصدار أقل من هذا الرقم سيتم حظره وإجباره على التحديث', true)
ON CONFLICT (key) DO UPDATE SET value = '326', updated_at = now();

-- Delete the incorrect key
DELETE FROM app_config WHERE key = 'min_supported_version';