-- تحديث RLS لـ subscriptions: السماح بعرض compensation (كتعويض إداري) للمستخدمين
DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;

CREATE POLICY "Users can view own subscription"
ON public.subscriptions
FOR SELECT
USING (
  user_id = auth.uid()
  AND is_valid_app_version()
  AND code_type != 'trial'  -- trial محظور دائماً، compensation مسموح
);