
-- ══ جدول تقييد الشحن (تضارب العمليات المتزامنة) ══════════════════════════
CREATE TABLE IF NOT EXISTS public.charge_throttles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  throttled_at    timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  is_active       boolean NOT NULL DEFAULT true,
  reason          text NOT NULL DEFAULT 'تضارب عمليات متزامنة من أجهزة متعددة',
  device1_fp      text,
  device2_fp      text,
  op1_id          uuid,
  op2_id          uuid,
  ops_count       int NOT NULL DEFAULT 2,
  lifted_at       timestamptz,
  lifted_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  lifted_by_name  text,
  notes           text
);

-- فهارس للأداء
CREATE INDEX IF NOT EXISTS idx_charge_throttles_user_id    ON public.charge_throttles(user_id);
CREATE INDEX IF NOT EXISTS idx_charge_throttles_is_active  ON public.charge_throttles(is_active);
CREATE INDEX IF NOT EXISTS idx_charge_throttles_expires_at ON public.charge_throttles(expires_at);

-- RLS
ALTER TABLE public.charge_throttles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_all_throttles" ON public.charge_throttles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin','super_admin')
    )
  );

CREATE POLICY "user_read_own_throttle" ON public.charge_throttles
  FOR SELECT USING (user_id = auth.uid());
