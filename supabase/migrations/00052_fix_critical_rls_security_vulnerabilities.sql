
-- ══════════════════════════════════════════════════════════════
-- إصلاح ثغرات RLS الحرجة
-- ══════════════════════════════════════════════════════════════

-- 1. حذف سياسة UPDATE الخطيرة: المستخدم يمكنه ترقية اشتراكه بنفسه
DROP POLICY IF EXISTS "Users can update own subscription" ON subscriptions;

-- 2. حذف سياسة INSERT الخطيرة: المستخدم يمكنه إنشاء اشتراك لنفسه بأي حالة
DROP POLICY IF EXISTS "Users can insert own subscription" ON subscriptions;

-- 3. إصلاح admin_audit_logs INSERT: حذف السياسة العامة غير المقيدة
DROP POLICY IF EXISTS "admin_audit_insert_service" ON admin_audit_logs;

-- 4. إصلاح notifications INSERT: تقييد المستخدمين بإدراج إشعاراتهم فقط وليس العالمية
DROP POLICY IF EXISTS "users_insert_own_notification" ON notifications;

-- 5. إصلاح license_keys UPDATE: تقييد بـ user_id (linked_user_id)
DROP POLICY IF EXISTS "users_can_update_license_key_on_activate" ON license_keys;

-- ══════════════════════════════════════════════════════════════
-- إعادة إنشاء السياسات الآمنة
-- ══════════════════════════════════════════════════════════════

-- subscriptions: المستخدم يمكنه رؤية اشتراكه فقط (بدون UPDATE/INSERT مباشر)
-- جميع عمليات التعديل تمر عبر دوال SECURITY DEFINER أو Admin فقط
-- (لا نضيف INSERT/UPDATE للمستخدم العادي — كل تفعيل يمر عبر activate_license_key RPC)

-- admin_audit_logs: INSERT فقط عبر service_role أو SECURITY DEFINER
CREATE POLICY "admin_audit_insert_via_service_role"
  ON admin_audit_logs FOR INSERT
  TO service_role
  WITH CHECK (true);

-- notifications: المستخدم يضيف إشعاراته الخاصة فقط وغير العالمية
CREATE POLICY "users_insert_own_notification_only"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (is_global IS NULL OR is_global = false)
  );

-- license_keys UPDATE: فقط للربط بمستخدم عبر linked_user_id
-- يُسمح للمستخدم بتحديث مفتاح نشط إذا كان linked_user_id = NULL (تفعيل جديد)
-- أو إذا كان linked_user_id = auth.uid() (مفتاحه هو)
CREATE POLICY "users_activate_unlinked_license_key"
  ON license_keys FOR UPDATE
  TO authenticated
  USING (status = 'active'::license_key_status AND (linked_user_id IS NULL OR linked_user_id = auth.uid()))
  WITH CHECK (linked_user_id = auth.uid());
