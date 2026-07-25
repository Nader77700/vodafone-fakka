
-- إصلاح RLS UPDATE على license_keys:
-- السياسة الحالية: USING (status='active') بدون WITH CHECK
-- → PostgreSQL يستخدم USING كـ WITH CHECK أيضاً → يرفض تغيير status إلى 'used'
-- الإصلاح: إضافة WITH CHECK صريح يسمح بأي قيمة
DROP POLICY IF EXISTS "users_can_update_license_key_on_activate" ON license_keys;

CREATE POLICY "users_can_update_license_key_on_activate"
ON license_keys
FOR UPDATE
TO authenticated
USING (status = 'active'::license_key_status)
WITH CHECK (true);
