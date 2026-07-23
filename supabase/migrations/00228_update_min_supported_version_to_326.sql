INSERT INTO app_config (key, value, value_type, category, label, description, is_public) 
VALUES ('min_supported_version', '326', 'number', 'version', 'الحد الأدنى لإصدار التطبيق', 'أي إصدار أقل من هذا الرقم سيتم حظره وإجباره على التحديث', true)
ON CONFLICT (key) DO UPDATE SET value = '326', updated_at = now();