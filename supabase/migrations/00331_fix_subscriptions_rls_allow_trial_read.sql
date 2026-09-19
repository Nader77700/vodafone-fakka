
-- ══════════════════════════════════════════════════════════════════════════════
-- إصلاح جذري نهائي: السماح لكل مستخدم بقراءة اشتراكه بغض النظر عن code_type
-- المشكلة: 939 مستخدم code_type='trial' محجوبون تماماً → يظهر "انتهى اشتراكك"
-- ══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Users can view own subscription" ON subscriptions;

-- policy بسيطة ونظيفة: كل مستخدم يقرأ اشتراكه فقط
CREATE POLICY "Users can view own subscription"
  ON subscriptions
  FOR SELECT
  USING (user_id = auth.uid());
