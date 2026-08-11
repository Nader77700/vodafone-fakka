-- PHASE 3 — الشحن في قسم عروض واشتراكات فودافون

-- مفتاح تحكم تشغيل/إيقاف الشحن من لوحة التحكم
INSERT INTO public.core_app_config (key, value, value_type, category, label, description, is_public)
VALUES
  ('vodafone_offers_charge_enabled', 'true', 'boolean', 'feature_flags', 'تشغيل شحن عروض فودافون', 'عند الإيقاف يختفي زر الشحن من واجهة المستخدمين', true)
ON CONFLICT (key) DO UPDATE
  SET value       = EXCLUDED.value,
      label       = EXCLUDED.label,
      description = EXCLUDED.description,
      updated_at  = now();

-- جدول لتتبع عمليات الشحن
CREATE TABLE IF NOT EXISTS public.vodafone_charge_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone           text NOT NULL,
  subscription_id text NOT NULL,
  enc_product_id  text,
  description     text,
  base_price      numeric(10,2),
  tax_rate        numeric(4,4) NOT NULL DEFAULT 0.43,
  tax_amount      numeric(10,2),
  total_amount    numeric(10,2),
  operation_id    text NOT NULL UNIQUE,
  status          text NOT NULL CHECK (status IN ('pending', 'success', 'failed', 'timeout')),
  failure_reason  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vodafone_charge_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_charge_logs" ON public.vodafone_charge_logs;
CREATE POLICY "users_read_own_charge_logs"
  ON public.vodafone_charge_logs
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "admin_read_all_charge_logs" ON public.vodafone_charge_logs;
CREATE POLICY "admin_read_all_charge_logs"
  ON public.vodafone_charge_logs
  FOR SELECT
  TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin','super_admin'));

DROP POLICY IF EXISTS "service_insert_charge_logs" ON public.vodafone_charge_logs;
CREATE POLICY "service_insert_charge_logs"
  ON public.vodafone_charge_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_vodafone_charge_logs_user_id ON public.vodafone_charge_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_vodafone_charge_logs_operation_id ON public.vodafone_charge_logs(operation_id);
