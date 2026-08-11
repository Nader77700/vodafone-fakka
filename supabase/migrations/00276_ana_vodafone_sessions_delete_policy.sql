
-- سياسة حذف الجلسة — يُسمح للمستخدم بحذف جلسته الخاصة فقط (تسجيل خروج)
CREATE POLICY "user_delete_own_session"
  ON ana_vodafone_sessions FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
