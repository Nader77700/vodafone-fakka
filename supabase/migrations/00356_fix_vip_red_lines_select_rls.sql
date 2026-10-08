-- السماح لجميع المستخدمين المسجلين بقراءة أرقام المراقبة للبحث عنها وطلب ربطها بحساباتهم
DROP POLICY IF EXISTS "Users and admins can select vip_red_monitored_lines" ON public.vip_red_monitored_lines;
CREATE POLICY "Users and admins can select vip_red_monitored_lines"
  ON public.vip_red_monitored_lines
  FOR SELECT
  TO authenticated
  USING (true);

-- التأكد من صلاحيات جدول طلبات ربط الأرقام vip_red_line_claims
ALTER TABLE IF EXISTS public.vip_red_line_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vip_red_line_claims_insert_auth" ON public.vip_red_line_claims;
CREATE POLICY "vip_red_line_claims_insert_auth"
  ON public.vip_red_line_claims
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "vip_red_line_claims_select_own" ON public.vip_red_line_claims;
CREATE POLICY "vip_red_line_claims_select_own"
  ON public.vip_red_line_claims
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.core_profiles
      WHERE core_profiles.id = auth.uid()
        AND (core_profiles.role = 'admin' OR core_profiles.role = 'super_admin')
    )
  );
