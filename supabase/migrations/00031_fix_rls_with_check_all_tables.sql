
-- إصلاح WITH CHECK على subscriptions UPDATE
DROP POLICY IF EXISTS "Users can update own subscription" ON subscriptions;
CREATE POLICY "Users can update own subscription"
ON subscriptions FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (true);

-- إضافة INSERT policies لـ notifications و subscription_history
DO $$
BEGIN
  -- notifications INSERT
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='notifications' AND cmd='INSERT'
  ) THEN
    EXECUTE 'CREATE POLICY "users_insert_own_notification" ON notifications
             FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())';
  END IF;
  -- subscription_history INSERT
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='subscription_history' AND cmd='INSERT'
  ) THEN
    EXECUTE 'CREATE POLICY "users_insert_own_history" ON subscription_history
             FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())';
  END IF;
END $$;
