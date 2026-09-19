
-- ══════════════════════════════════════════════════════════════════════════════
-- إصلاح جذري: إزالة is_valid_app_version() من policy قراءة الاشتراكات
-- السبب: المستخدمون على إصدارات APK قديمة (build < 504) لا يستطيعون قراءة
--        اشتراكاتهم بسبب هذا الشرط → يرجع null → يظهر "انتهى اشتراكك" خطأ
-- ══════════════════════════════════════════════════════════════════════════════

-- حذف policy القراءة القديمة
DROP POLICY IF EXISTS "Users can view own subscription" ON subscriptions;

-- إنشاء policy جديدة بدون is_valid_app_version()
-- المستخدم يمكنه دائماً قراءة اشتراكه الخاص بغض النظر عن إصدار التطبيق
CREATE POLICY "Users can view own subscription"
  ON subscriptions
  FOR SELECT
  USING (
    user_id = auth.uid()
    AND code_type <> 'trial'
  );

-- ملاحظة: is_valid_app_version() تظل في policies الكتابة (INSERT/UPDATE/DELETE)
--         لأن العمليات الحساسة يجب أن تمر عبر إصدارات معتمدة فقط
-- أما القراءة: فكل مستخدم يحق له رؤية اشتراكه دائماً

-- التحقق من الـ policies الحالية
SELECT policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'subscriptions'
ORDER BY policyname;
