
-- السماح للـ anon بقراءة بيانات الدعوة فقط من جدول merchants
CREATE POLICY "anon_read_invite_fields" ON public.merchants
  FOR SELECT TO anon
  USING (invite_enabled = true AND invite_status = 'active');

-- السماح للـ anon بقراءة merchant_invites النشطة
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'merchant_invites' AND policyname = 'anon_read_active_invites'
  ) THEN
    CREATE POLICY "anon_read_active_invites" ON public.merchant_invites
      FOR SELECT TO anon
      USING (status = 'active');
  END IF;
END $$;
