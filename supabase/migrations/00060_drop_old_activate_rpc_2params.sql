
-- حذف النسخة القديمة بمعاملَين لإزالة التضارب (ambiguous function)
DROP FUNCTION IF EXISTS activate_license_key_v2(UUID, TEXT);
